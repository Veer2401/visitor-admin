"use client";

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { initFirebase, db, ENQUIRIES_COLLECTION, STAFF_COLLECTION, DOCTORS_COLLECTION } from '../../../../lib/firebase';
import { signInWithGoogle, signOutUser, onAuthStateChange } from '../../../../lib/auth';
import {
  collection as col,
  onSnapshot,
  query,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  DocumentData,
  DocumentSnapshot,
  QuerySnapshot,
  where
} from 'firebase/firestore';
import type { Enquiry, Staff } from '../../../../lib/types';
import type { User } from 'firebase/auth';

// Initialize from env (will be set in environment when running)
if (!db && process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
  initFirebase({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  });
}

interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  timestamp: Date | null;
  status: 'completed' | 'current' | 'pending';
}

function EnquiryDetailsPageContent() {
  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [enquiryDetails, setEnquiryDetails] = useState('');
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [pendingEnquiries, setPendingEnquiries] = useState<Enquiry[]>([]);
  const [isSettingReminder, setIsSettingReminder] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [showStaffDropdown, setShowStaffDropdown] = useState(false);
  const [isAssigningStaff, setIsAssigningStaff] = useState(false);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [showDoctorDropdown, setShowDoctorDropdown] = useState(false);
  const [isAssigningDoctor, setIsAssigningDoctor] = useState(false);
  const [docRemarks, setDocRemarks] = useState('');
  const [isEditingDocRemarks, setIsEditingDocRemarks] = useState(false);
  const [isSavingDocRemarks, setIsSavingDocRemarks] = useState(false);
  const [isMarkingCompleted, setIsMarkingCompleted] = useState(false);
  const [showReminderExpiredPopup, setShowReminderExpiredPopup] = useState(false);
  const [expiredEnquiry, setExpiredEnquiry] = useState<Enquiry | null>(null);
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const enquiryId = searchParams.get('id');

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user);
      setAuthLoading(false);
      
      // When user signs in, check for expired reminders after a brief delay
      if (user && enquiryId) {
        setTimeout(() => {
          checkForExpiredRemindersOnSignIn();
        }, 2000); // 2 second delay to ensure data is loaded
      }
    });

    return () => unsubscribe();
  }, [enquiryId]);

  // Function to check for expired reminders when user signs in
  const checkForExpiredRemindersOnSignIn = async () => {
    if (!db || !user || !enquiryId) return;
    
    try {
      const enquiryRef = doc(db, ENQUIRIES_COLLECTION, enquiryId);
      const docSnap = await getDoc(enquiryRef);
      
      if (docSnap.exists()) {
        const enquiryData = { id: docSnap.id, ...docSnap.data() } as Enquiry;
        checkForExpiredReminderOnLoad(enquiryData);
      }
    } catch (error) {
      console.error('Error checking expired reminders on sign in:', error);
    }
  };

  // Update time remaining every minute for active reminders
  useEffect(() => {
    // Clean up old localStorage entries once per session
    cleanupOldPopupRecords();
  }, []);

  // Function to clean up old popup records from localStorage
  const cleanupOldPopupRecords = () => {
    try {
      const sevenDaysAgo = new Date().getTime() - (7 * 24 * 60 * 60 * 1000);
      
      // Get all localStorage keys that match our pattern
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('reminder_popup_shown_')) {
          const timestamp = localStorage.getItem(key);
          if (timestamp && parseInt(timestamp) < sevenDaysAgo) {
            localStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.warn('Could not clean up localStorage:', error);
    }
  };

  // Fetch staff data
  useEffect(() => {
    if (!db || !user) return;
    
    const staffQuery = query(col(db, STAFF_COLLECTION));
    const unsubStaff = onSnapshot(staffQuery, (snapshot) => {
      const items: Staff[] = [];
      snapshot.forEach((docSnap) => 
        items.push({ id: docSnap.id, ...docSnap.data() } as Staff)
      );
      setStaff(items);
    }, (error) => {
      console.error('Error fetching staff:', error);
    });
    
    // Fetch doctors as well
    const doctorsQuery = query(col(db, DOCTORS_COLLECTION));
    const unsubDoctors = onSnapshot(doctorsQuery, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((docSnap) => items.push({ id: docSnap.id, ...docSnap.data() }));
      setDoctors(items);
    }, (error) => {
      console.error('Error fetching doctors:', error);
    });
    
    return () => {
      unsubStaff();
      unsubDoctors();
    };
  }, [user]);

  // Check for expired reminders periodically
  useEffect(() => {
    if (!db || !user) return;

    const checkExpiredReminders = async () => {
      try {
        if (!db) return;
        
        const enquiriesQuery = query(
          col(db, ENQUIRIES_COLLECTION),
          where('reminderScheduledAt', '!=', null)
        );
        
        const snapshot = await new Promise<QuerySnapshot>((resolve) => {
          const unsubscribe = onSnapshot(enquiriesQuery, (snapshot) => {
            unsubscribe();
            resolve(snapshot);
          });
        });

        const now = new Date().getTime();
        
        for (const docSnap of snapshot.docs) {
          const enquiryData = { id: docSnap.id, ...docSnap.data() } as Enquiry;
          
          if (enquiryData.reminderScheduledAt && enquiryData.reminderDuration) {
            const reminderTime = typeof enquiryData.reminderScheduledAt === 'object' && 'toDate' in enquiryData.reminderScheduledAt
              ? enquiryData.reminderScheduledAt.toDate().getTime()
              : enquiryData.reminderScheduledAt instanceof Date
              ? enquiryData.reminderScheduledAt.getTime()
              : 0;
            
            const expiryTime = reminderTime + (enquiryData.reminderDuration * 60 * 60 * 1000);
            
            if (now >= expiryTime) {
              // Reminder has expired, reset to pending
              const enquiryRef = doc(db, ENQUIRIES_COLLECTION, docSnap.id);
              await updateDoc(enquiryRef, {
                status: 'pending',
                pendingSince: serverTimestamp(),
                reminderScheduledAt: null,
                reminderDuration: null,
                originalStatus: null,
                lastNotificationShown: null, // Reset this so popup can show again
                updatedAt: serverTimestamp(),
                userId: user.uid,
                userEmail: user.email || ''
              });

              // Show popup notification for the expired enquiry
              // Only show if this is the current enquiry being viewed
              if (docSnap.id === enquiryId) {
                // Check localStorage to avoid showing duplicate popups
                const localStorageKey = `reminder_popup_shown_${docSnap.id}`;
                let lastShownTime = 0;
                
                try {
                  const lastShownLocal = localStorage.getItem(localStorageKey);
                  lastShownTime = lastShownLocal ? parseInt(lastShownLocal) : 0;
                } catch (error) {
                  console.warn('localStorage not available:', error);
                }
                
                const now = new Date().getTime();
                const thirtyMinutes = 30 * 60 * 1000;
                
                // Only show if not shown in last 30 minutes
                if (now - lastShownTime > thirtyMinutes) {
                  setExpiredEnquiry(enquiryData);
                  setShowReminderExpiredPopup(true);
                  // Play notification sound
                  playNotificationSound();
                  
                  // Update localStorage and database
                  try {
                    localStorage.setItem(localStorageKey, now.toString());
                  } catch (error) {
                    console.warn('Could not update localStorage:', error);
                  }
                  setTimeout(() => updateLastNotificationShown(docSnap.id), 1000);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Error checking expired reminders:', error);
      }
    };

    // Check immediately and then every minute
    checkExpiredReminders();
    const interval = setInterval(checkExpiredReminders, 60000);

    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!db || !user || !enquiryId) {
      setLoading(false);
      return;
    }
    
    // Listen to specific enquiry data
    const enquiryRef = doc(db, ENQUIRIES_COLLECTION, enquiryId);
    const unsubEnquiry = onSnapshot(enquiryRef, (doc) => {
      if (doc.exists()) {
        const enquiryData = { id: doc.id, ...doc.data() } as Enquiry;
        setEnquiry(enquiryData);
        setEnquiryDetails(enquiryData.enquiryDetails || '');
  setDocRemarks(enquiryData.docRemarks || '');
        
        // Check if this enquiry had an expired reminder on load/reload
        checkForExpiredReminderOnLoad(enquiryData);
      } else {
        setEnquiry(null);
      }
      setLoading(false);
    });

    // Listen for pending enquiries for notifications
    const pendingQuery = query(
      col(db, ENQUIRIES_COLLECTION), 
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    
    const unsubPending = onSnapshot(pendingQuery, (snapshot) => {
      const items: Enquiry[] = [];
      snapshot.forEach((docSnap: DocumentSnapshot<DocumentData>) => 
        items.push({ id: docSnap.id, ...docSnap.data() } as Enquiry)
      );
      setPendingEnquiries(items);
    });
    
    return () => {
      unsubEnquiry();
      unsubPending();
    };
  }, [user, enquiryId]);

  // Function to check for expired reminders when page loads or enquiry data changes
  const checkForExpiredReminderOnLoad = (enquiryData: Enquiry) => {
    if (!enquiryData.reminderScheduledAt || !enquiryData.reminderDuration) return;
    
    const now = new Date().getTime();
    const reminderTime = typeof enquiryData.reminderScheduledAt === 'object' && 'toDate' in enquiryData.reminderScheduledAt
      ? enquiryData.reminderScheduledAt.toDate().getTime()
      : enquiryData.reminderScheduledAt instanceof Date
      ? enquiryData.reminderScheduledAt.getTime()
      : 0;
    
    const expiryTime = reminderTime + (enquiryData.reminderDuration * 60 * 60 * 1000);
    
    // Check if reminder has expired
    if (now >= expiryTime) {
      // Check if this enquiry was recently reset to pending status
      // This indicates it was an expired reminder
      if (enquiryData.status === 'pending' && enquiryData.pendingSince) {
        const pendingSinceTime = typeof enquiryData.pendingSince === 'object' && 'toDate' in enquiryData.pendingSince
          ? enquiryData.pendingSince.toDate().getTime()
          : enquiryData.pendingSince instanceof Date
          ? enquiryData.pendingSince.getTime()
          : 0;
        
        // Show popup if enquiry was reset to pending within the last 24 hours
        // This ensures we show the popup on reload/sign-in for recently expired reminders
        const timeSincePending = now - pendingSinceTime;
        const twentyFourHours = 24 * 60 * 60 * 1000;
        
        if (timeSincePending <= twentyFourHours) {
          // Check localStorage to see if we've shown this popup recently
          const localStorageKey = `reminder_popup_shown_${enquiryData.id}`;
          let lastShownTime = 0;
          
          try {
            const lastShownLocal = localStorage.getItem(localStorageKey);
            lastShownTime = lastShownLocal ? parseInt(lastShownLocal) : 0;
          } catch (error) {
            console.warn('localStorage not available:', error);
          }
          
          // Also check database timestamp
          const lastNotificationTime = enquiryData.lastNotificationShown
            ? (typeof enquiryData.lastNotificationShown === 'object' && 'toDate' in enquiryData.lastNotificationShown
                ? enquiryData.lastNotificationShown.toDate().getTime()
                : enquiryData.lastNotificationShown instanceof Date
                ? enquiryData.lastNotificationShown.getTime()
                : 0)
            : 0;
          
          // Show popup if no notification was shown in the last 30 minutes (local or database)
          const thirtyMinutes = 30 * 60 * 1000;
          const shouldShowPopup = (now - lastShownTime > thirtyMinutes) && 
                                  (now - lastNotificationTime > thirtyMinutes);
          
          if (shouldShowPopup) {
            setExpiredEnquiry(enquiryData);
            setShowReminderExpiredPopup(true);
            playNotificationSound();
            
            // Update both localStorage and database
            try {
              localStorage.setItem(localStorageKey, now.toString());
            } catch (error) {
              console.warn('Could not update localStorage:', error);
            }
            updateLastNotificationShown(enquiryData.id!);
          }
        }
      }
    }
  };

  // Function to update the last notification shown timestamp
  const updateLastNotificationShown = async (enquiryId: string) => {
    if (!db || !user) return;
    
    try {
      const enquiryRef = doc(db, ENQUIRIES_COLLECTION, enquiryId);
      await updateDoc(enquiryRef, {
        lastNotificationShown: serverTimestamp(),
        updatedAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email || ''
      });
    } catch (error) {
      console.error('Error updating last notification shown:', error);
    }
  };

  const getActorDisplayName = (updaterEmail?: string | null, currentUser?: User | null) => {
    // Prefer current signed-in user's displayName if they match the updaterEmail
    if (currentUser && updaterEmail && currentUser.email === updaterEmail) {
      const name = currentUser.displayName || '';
      if (name && name.trim().length > 0) return name;
    }

    // Derive a readable name from the email local-part (never show full email)
    if (updaterEmail) {
      const local = updaterEmail.split('@')[0] || '';
      const parts = local.split(/[_\.\-]+/).filter(Boolean);
      if (parts.length > 0) {
        return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
      }
    }

    return 'Unknown';
  };

  const generateTimeline = (enquiry: Enquiry, currentUser: User | null): TimelineEvent[] => {
    if (!enquiry) return [];

    const timeline: TimelineEvent[] = [];
    const now = new Date();

    // 1. Visitor logged in
    timeline.push({
      id: 'login',
      title: 'Visitor logged in',
      description: `${enquiry.enquirerName || 'Visitor'} logged into the system`,
      timestamp: enquiry.createdAt ? 
        (typeof enquiry.createdAt === 'object' && 'toDate' in enquiry.createdAt ? 
          enquiry.createdAt.toDate() : 
          enquiry.createdAt instanceof Date ? enquiry.createdAt : null
        ) : null,
      status: 'completed'
    });

    // 2. Enquiry submitted to reception
    timeline.push({
      id: 'submitted',
      title: 'Enquiry submitted to reception',
      description: `Enquiry for patient: ${enquiry.patientName || 'N/A'}`,
      timestamp: enquiry.createdAt ? 
        (typeof enquiry.createdAt === 'object' && 'toDate' in enquiry.createdAt ? 
          enquiry.createdAt.toDate() : 
          enquiry.createdAt instanceof Date ? enquiry.createdAt : null
        ) : null,
      status: 'completed'
    });

    // 3. Enquiry type and details (if available)
    if (enquiry.enquiryDetails) {
      const actor = getActorDisplayName(enquiry.userEmail || null, currentUser);
      timeline.push({
        id: 'enquiry_type',
        title: 'Enquiry Type',
        description: `${actor}: ${enquiry.enquiryDetails}`,
        timestamp: enquiry.updatedAt ? 
          (typeof enquiry.updatedAt === 'object' && 'toDate' in enquiry.updatedAt ? 
            enquiry.updatedAt.toDate() : 
            enquiry.updatedAt instanceof Date ? enquiry.updatedAt : null
          ) : null,
        status: 'completed'
      });
    }

    // Add enquiry details history entries (if any) as additional timeline items
    if (enquiry.enquiryDetailsHistory && Array.isArray(enquiry.enquiryDetailsHistory)) {
      // Ensure chronological order (oldest first)
      type HistoryEntry = { text: string; at: Date | null; byName: string };
      const history: HistoryEntry[] = enquiry.enquiryDetailsHistory.slice().map((h: any): HistoryEntry => ({
        text: h.text || '',
        at: h.at && typeof h.at === 'object' && 'toDate' in h.at ? h.at.toDate() : (h.at instanceof Date ? h.at : null),
        byName: h.byName || getActorDisplayName(h.byEmail || null, currentUser)
      }));

      history.forEach((h: HistoryEntry, idx: number) => {
        timeline.push({
          id: `enquiry_history_${idx}`,
          title: 'Enquiry Details (edited)',
          description: `${h.byName}: ${h.text}`,
          timestamp: h.at,
          status: 'completed'
        });
      });
    }

    // 3.5. Doctor assigned (if assigned)
    if (enquiry.assignedDoctor) {
      timeline.push({
        id: 'doctor_assigned',
        title: 'Doctor Assigned',
        description: `Assigned to ${enquiry.assignedDoctor}`,
        timestamp: enquiry.assignedDoctorAt ? 
          (typeof enquiry.assignedDoctorAt === 'object' && 'toDate' in enquiry.assignedDoctorAt ? 
            enquiry.assignedDoctorAt.toDate() : 
            enquiry.assignedDoctorAt instanceof Date ? enquiry.assignedDoctorAt : null
          ) : null,
        status: 'completed'
      });
    }

    // 3.6. Doctor remarks (if provided)
    if (enquiry.docRemarks) {
      timeline.push({
        id: 'doctor_remarks',
        title: 'Doctor Remarks',
        description: `${enquiry.docRemarks}`,
        timestamp: enquiry.docRemarksAt ? 
          (typeof enquiry.docRemarksAt === 'object' && 'toDate' in enquiry.docRemarksAt ? 
            enquiry.docRemarksAt.toDate() : 
            enquiry.docRemarksAt instanceof Date ? enquiry.docRemarksAt : null
          ) : null,
        status: 'completed'
      });
    }

    // 4. Progress status events
    if (enquiry.status === 'pending') {
      timeline.push({
        id: 'pending',
        title: 'Enquiry Status',
        description: enquiry.assignedStaff 
          ? `${enquiry.assignedStaff} is reviewing the enquiry`
          : 'Pending - Waiting for staff review',
        timestamp: enquiry.updatedAt ? 
          (typeof enquiry.updatedAt === 'object' && 'toDate' in enquiry.updatedAt ? 
            enquiry.updatedAt.toDate() : 
            enquiry.updatedAt instanceof Date ? enquiry.updatedAt : null
          ) : null,
        status: 'current'
      });
    } else if (enquiry.status === 'in_progress') {
      timeline.push({
        id: 'in_progress',
        title: 'Enquiry Status',
        description: enquiry.assignedStaff 
          ? `${enquiry.assignedStaff} is processing the enquiry`
          : 'In Progress - Being processed by staff',
        timestamp: enquiry.updatedAt ? 
          (typeof enquiry.updatedAt === 'object' && 'toDate' in enquiry.updatedAt ? 
            enquiry.updatedAt.toDate() : 
            enquiry.updatedAt instanceof Date ? enquiry.updatedAt : null
          ) : null,
        status: 'current'
      });
    } else if (enquiry.status === 'completed') {
      timeline.push({
        id: 'in_progress',
        title: 'Enquiry Status',
        description: enquiry.assignedStaff 
          ? `${enquiry.assignedStaff} processed the enquiry`
          : 'In Progress - Processed by staff',
        timestamp: enquiry.updatedAt ? 
          (typeof enquiry.updatedAt === 'object' && 'toDate' in enquiry.updatedAt ? 
            enquiry.updatedAt.toDate() : 
            enquiry.updatedAt instanceof Date ? enquiry.updatedAt : null
          ) : null,
        status: 'completed'
      });
      
      timeline.push({
        id: 'completed',
        title: 'Enquiry completed',
        description: 'Enquiry successfully resolved',
        timestamp: enquiry.updatedAt ? 
          (typeof enquiry.updatedAt === 'object' && 'toDate' in enquiry.updatedAt ? 
            enquiry.updatedAt.toDate() : 
            enquiry.updatedAt instanceof Date ? enquiry.updatedAt : null
          ) : null,
        status: 'current'
      });

      // 5. Enquiry checkout by staff (only if completed)
      timeline.push({
        id: 'checkout',
        title: 'Enquiry checked out by staff',
        description: enquiry.assignedStaff 
          ? `Enquiry checked out by ${enquiry.assignedStaff}`
          : 'Process completed and closed',
        timestamp: enquiry.updatedAt ? 
          (typeof enquiry.updatedAt === 'object' && 'toDate' in enquiry.updatedAt ? 
            enquiry.updatedAt.toDate() : 
            enquiry.updatedAt instanceof Date ? enquiry.updatedAt : null
          ) : null,
        status: 'completed'
      });
    } else if (enquiry.status === 'cancelled') {
      timeline.push({
        id: 'cancelled',
        title: 'Enquiry Status',
        description: 'Cancelled/Rejected - Enquiry was not processed',
        timestamp: enquiry.updatedAt ? 
          (typeof enquiry.updatedAt === 'object' && 'toDate' in enquiry.updatedAt ? 
            enquiry.updatedAt.toDate() : 
            enquiry.updatedAt instanceof Date ? enquiry.updatedAt : null
          ) : null,
        status: 'current'
      });
    }

    // Add reminder timeline event if active
  if (enquiry.reminderScheduledAt && enquiry.reminderDuration) {
      const reminderTime = typeof enquiry.reminderScheduledAt === 'object' && 'toDate' in enquiry.reminderScheduledAt
        ? enquiry.reminderScheduledAt.toDate()
        : enquiry.reminderScheduledAt instanceof Date
        ? enquiry.reminderScheduledAt
        : null;

      if (reminderTime) {
        const expiryTime = new Date(reminderTime.getTime() + (enquiry.reminderDuration * 60 * 60 * 1000));
        const timeRemaining = expiryTime.getTime() - now.getTime();
        
        let timeRemainingText = '';
        if (timeRemaining > 0) {
          const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
          const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
          
          if (days > 0) {
            timeRemainingText = `${days}d ${hours}h remaining`;
          } else if (hours > 0) {
            timeRemainingText = `${hours}h ${minutes}m remaining`;
          } else {
            timeRemainingText = `${minutes}m remaining`;
          }
        } else {
          timeRemainingText = 'Expired - will be reset soon';
        }

        timeline.push({
          id: 'reminder',
          title: 'Reminder Set',
          description: `Reminder for ${enquiry.reminderDuration} hours - ${timeRemainingText}`,
          timestamp: reminderTime,
          status: timeRemaining > 0 ? 'current' : 'pending'
        });
      }
    }

    return timeline;
  };

  const formatTimestamp = (timestamp: Date | null) => {
    if (!timestamp) return 'N/A';
    return timestamp.toLocaleString();
  };

  const handleSaveDetails = async () => {
    if (!db || !enquiryId || !user) return;

    setIsSavingDetails(true);
    try {
      const enquiryRef = doc(db, ENQUIRIES_COLLECTION, enquiryId);
      // append a history entry and update current details
      const actorName = (user.displayName && user.displayName.trim()) ? user.displayName : (user.email ? user.email.split('@')[0] : 'Unknown');
      await updateDoc(enquiryRef, {
        enquiryDetails: enquiryDetails,
        updatedAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email || '',
        enquiryDetailsHistory: arrayUnion({ text: enquiryDetails, at: serverTimestamp(), byName: actorName, byEmail: user.email || '' })
      });
      setIsEditingDetails(false);
    } catch (error) {
      console.error('Error saving enquiry details:', error);
      alert('Failed to save enquiry details. Please try again.');
    }
    setIsSavingDetails(false);
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in failed:', error);
      alert('Sign in failed. Please try again.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      setEnquiry(null);
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const handleSetReminder = async (hours: number) => {
    if (!db || !enquiryId || !user || !enquiry) return;

    setIsSettingReminder(true);
    try {
      const enquiryRef = doc(db, ENQUIRIES_COLLECTION, enquiryId);
      await updateDoc(enquiryRef, {
        reminderScheduledAt: serverTimestamp(),
        reminderDuration: hours,
        originalStatus: enquiry.status,
        updatedAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email || ''
      });

      alert(`Reminder set for ${hours} hours. The enquiry will automatically return to pending status.`);
    } catch (error) {
      console.error('Error setting reminder:', error);
      alert('Failed to set reminder. Please try again.');
    }
    setIsSettingReminder(false);
  };

  const handleCancelReminder = async () => {
    if (!db || !enquiryId || !user || !enquiry) return;

    setIsSettingReminder(true);
    try {
      const enquiryRef = doc(db, ENQUIRIES_COLLECTION, enquiryId);
      await updateDoc(enquiryRef, {
        reminderScheduledAt: null,
        reminderDuration: null,
        originalStatus: null,
        updatedAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email || ''
      });

      alert('Reminder cancelled successfully.');
    } catch (error) {
      console.error('Error cancelling reminder:', error);
      alert('Failed to cancel reminder. Please try again.');
    }
    setIsSettingReminder(false);
  };

  // Function to play notification sound
  const playNotificationSound = () => {
    try {
      // Create a simple beep sound using Web Audio API
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800; // Frequency in Hz
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  };

  const handleAssignStaff = async (staffName: string) => {
    if (!db || !enquiryId || !user || !enquiry) return;

    setIsAssigningStaff(true);
    try {
      const enquiryRef = doc(db, ENQUIRIES_COLLECTION, enquiryId);
      await updateDoc(enquiryRef, {
        assignedStaff: staffName,
        status: 'in_progress',
        updatedAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email || ''
      });

      setShowStaffDropdown(false);
    } catch (error) {
      console.error('Error assigning staff:', error);
      alert('Failed to assign staff. Please try again.');
    }
    setIsAssigningStaff(false);
  };

  const handleAssignDoctor = async (doctorName: string) => {
    if (!db || !enquiryId || !user || !enquiry) return;

    setIsAssigningDoctor(true);
    try {
      const enquiryRef = doc(db, ENQUIRIES_COLLECTION, enquiryId);
      await updateDoc(enquiryRef, {
        assignedDoctor: `Dr. ${doctorName}`,
        assignedDoctorAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email || ''
      });

      setShowDoctorDropdown(false);
    } catch (error) {
      console.error('Error assigning doctor:', error);
      alert('Failed to assign doctor. Please try again.');
    }
    setIsAssigningDoctor(false);
  };

  const handleSaveDocRemarks = async () => {
    if (!db || !enquiryId || !user || !enquiry) return;

    setIsSavingDocRemarks(true);
    try {
      const enquiryRef = doc(db, ENQUIRIES_COLLECTION, enquiryId);
      await updateDoc(enquiryRef, {
        docRemarks: docRemarks,
        docRemarksAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email || ''
      });
      setIsEditingDocRemarks(false);
    } catch (error) {
      console.error('Error saving doctor remarks:', error);
      alert('Failed to save doctor remarks. Please try again.');
    }
    setIsSavingDocRemarks(false);
  };

  const handleMarkAsCompleted = async () => {
    if (!db || !enquiryId || !user || !enquiry) return;

    setIsMarkingCompleted(true);
    try {
      const enquiryRef = doc(db, ENQUIRIES_COLLECTION, enquiryId);
      await updateDoc(enquiryRef, {
        status: 'completed',
        updatedAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email || ''
      });

      // Optional: Show success message
      // alert('Enquiry marked as completed successfully.');
    } catch (error) {
      console.error('Error marking enquiry as completed:', error);
      alert('Failed to mark enquiry as completed. Please try again.');
    }
    setIsMarkingCompleted(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-yellow-100 text-yellow-800">Pending</span>;
      case 'in_progress':
        return <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800">In Progress</span>;
      case 'completed':
        return <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-green-100 text-green-800">Completed</span>;
      case 'cancelled':
        return <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-800">Rejected</span>;
      default:
        return <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  // Show loading spinner while checking auth state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center max-w-md w-full">
          {/* Logo */}
          <div className="mb-8 bg-white p-6 rounded-2xl shadow-lg">
            <Image 
              src="/logo-1.png" 
              alt="Kalpavruksha Logo" 
              width={256}
              height={256}
              quality={100}
              priority
              className="h-32 w-auto"
            />
          </div>
          
          <div className="w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
              <p className="text-gray-600 mb-8 text-sm leading-relaxed">Sign in to access the Kalpavruksha Admin Dashboard</p>
              
              <button
                onClick={handleSignIn}
                className="w-full flex items-center justify-center px-6 py-4 border border-gray-200 rounded-xl shadow-sm bg-white text-base font-medium text-gray-700 hover:bg-gray-50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </button>
              
              <div className="mt-8 text-sm text-gray-500 space-y-1">
                <p>Only authorized users can access this dashboard.</p>
                <p>Contact your administrator if you need access.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!enquiryId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No enquiry ID provided</p>
          <Link href="/admin/enquiries" className="text-blue-600 hover:text-blue-800 mt-2 inline-block">
            Back to Enquiries
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading enquiry details...</p>
        </div>
      </div>
    );
  }

  if (!enquiry) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Enquiry not found</p>
          <Link href="/admin/enquiries" className="text-blue-600 hover:text-blue-800 mt-2 inline-block">
            Back to Enquiries
          </Link>
        </div>
      </div>
    );
  }

  const timeline = generateTimeline(enquiry, user);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm shadow-lg border-b border-gray-200/50">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <Image 
                src="/logo-1.png" 
                alt="Kalpavruksha Logo" 
                width={128}
                height={128}
                quality={100}
                priority
                className="h-16 w-auto mr-6"
              />
              <div className="mt-2">
                <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-lg text-gray-700">
                <span className="font-normal">Welcome, </span>
                <span className="font-semibold">{user?.displayName || user?.email}</span>
              </div>
              <button
                onClick={handleSignOut}
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors duration-200"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Section */}
      <div className="bg-white/60 backdrop-blur-sm border-b border-gray-200/50">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="flex space-x-6">
              <Link
                href="/admin"
                className="flex items-center border-2 border-gray-300/50 rounded-2xl px-6 py-4 hover:border-gray-400 hover:shadow-lg hover:scale-105 transition-all duration-300 group bg-white/80 backdrop-blur-sm"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg" style={{ backgroundColor: '#1C4B46' }}>
                    <img 
                      src="/visits.png" 
                      alt="Visits" 
                      className="w-7 h-7 rounded-lg"
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Visits</h3>
                    <p className="text-sm text-gray-600">Check-in patients and manage visits</p>
                  </div>
                </div>
              </Link>
              <Link
                href="/admin/enquiries"
                className="flex items-center border-2 rounded-2xl px-6 py-4 shadow-xl scale-105 transition-all duration-300 group backdrop-blur-sm"
                style={{ 
                  backgroundColor: '#1C4B46',
                  borderColor: '#1C4B46'
                }}
              >
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-white/20">
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Enquiries</h3>
                    <p className="text-sm text-white/80">Submit and track enquiries</p>
                  </div>
                </div>
              </Link>
              <Link
                href="/admin/analytics"
                className="flex items-center border-2 border-gray-300/50 rounded-2xl px-6 py-4 hover:border-gray-400 hover:shadow-lg hover:scale-105 transition-all duration-300 group bg-white/80 backdrop-blur-sm"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg" style={{ backgroundColor: '#1C4B46' }}>
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">View Analytics</h3>
                    <p className="text-sm text-gray-600">View data insights and reports</p>
                  </div>
                </div>
              </Link>
            </div>
            
            {/* Notifications */}
            <div className="relative">
              <Link
                href="/admin/notifications"
                className="relative p-3 text-black hover:bg-gray-100 rounded-xl transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-300 flex items-center justify-center"
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
                </svg>
                {pendingEnquiries.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                    {pendingEnquiries.length}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <div className="mb-6">
          <Link
            href="/admin/enquiries"
            className="inline-flex items-center text-gray-600 hover:text-gray-900 transition-colors duration-200"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Enquiries
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Enquiry Info */}
          <div className="space-y-6">
            {/* Enquiry Information */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50">
                <h2 className="text-xl font-bold text-gray-900">Enquiry Information</h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-500">Status</span>
                    <div className="flex items-center space-x-3">
                      {getStatusBadge(enquiry.status || 'pending')}
                      {enquiry.status && ['pending', 'in_progress'].includes(enquiry.status) && (
                        <div className="relative">
                          <button
                            onClick={() => setShowStaffDropdown(!showStaffDropdown)}
                            disabled={isAssigningStaff}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1 rounded-lg text-xs transition-colors duration-200 disabled:opacity-50 flex items-center space-x-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span>{enquiry.assignedStaff ? 'Reassign Staff' : 'Assign Staff'}</span>
                          </button>
                          
                          {showStaffDropdown && (
                            <>
                              <div 
                                className="fixed inset-0 z-10" 
                                onClick={() => setShowStaffDropdown(false)}
                              />
                              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                                <div className="py-1">
                                  {staff.length === 0 ? (
                                    <div className="px-4 py-2 text-sm text-gray-500">
                                      No staff available
                                    </div>
                                  ) : (
                                    staff.map((staffMember) => (
                                      <button
                                        key={staffMember.id}
                                        onClick={() => handleAssignStaff(staffMember.staffName || 'Unknown Staff')}
                                        disabled={isAssigningStaff}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-200 disabled:opacity-50"
                                      >
                                        {staffMember.staffName || 'Unknown Staff'}
                                      </button>
                                    ))
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      {/* Always show Assign Doctor button for pending/in_progress enquiries */}
                      {enquiry.status && ['pending', 'in_progress'].includes(enquiry.status) && (
                        <div className="relative">
                          <button
                            onClick={() => setShowDoctorDropdown(!showDoctorDropdown)}
                            disabled={isAssigningDoctor}
                            className={`ml-2 font-bold px-3 py-1 rounded-lg text-xs transition-colors duration-200 disabled:opacity-50 flex items-center space-x-1 ${
                              enquiry.assignedDoctor
                                ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>{enquiry.assignedDoctor ? 'Change Doctor' : 'Assign Doctor'}</span>
                          </button>

                          {showDoctorDropdown && (
                            <>
                              <div 
                                className="fixed inset-0 z-10" 
                                onClick={() => setShowDoctorDropdown(false)}
                              />
                              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                                <div className="py-1">
                                  {doctors.length === 0 ? (
                                    <div className="px-4 py-2 text-sm text-gray-500">
                                      No doctors available
                                    </div>
                                  ) : (
                                    doctors.map((doctor) => (
                                      <button
                                        key={doctor.id}
                                        onClick={() => handleAssignDoctor(doctor.doctorName || 'Unknown Doctor')}
                                        disabled={isAssigningDoctor}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-200 disabled:opacity-50"
                                      >
                                        {doctor.doctorName || 'Unknown Doctor'}
                                      </button>
                                    ))
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Visitor Name</span>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{enquiry.enquirerName || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Mobile</span>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{enquiry.enquirerMobile || 'N/A'}</p>
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Patient Name</span>
                    <p className="mt-1 text-sm font-semibold text-gray-900">{enquiry.patientName || 'N/A'}</p>
                  </div>
                  {enquiry.assignedStaff && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Assigned Staff</span>
                      <p className="mt-1 text-sm font-semibold text-green-700">{enquiry.assignedStaff}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Created At</span>
                      <p className="mt-1 text-sm text-gray-900">{formatTimestamp(
                        enquiry.createdAt && typeof enquiry.createdAt === 'object' && 'toDate' in enquiry.createdAt
                          ? enquiry.createdAt.toDate()
                          : enquiry.createdAt instanceof Date
                          ? enquiry.createdAt
                          : null
                      )}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Updated At</span>
                      <p className="mt-1 text-sm text-gray-900">{formatTimestamp(
                        enquiry.updatedAt && typeof enquiry.updatedAt === 'object' && 'toDate' in enquiry.updatedAt
                          ? enquiry.updatedAt.toDate()
                          : enquiry.updatedAt instanceof Date
                          ? enquiry.updatedAt
                          : null
                      )}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Enquiry Details */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-900">Enquiry Details</h2>
                  <div className="flex space-x-2">
                    {!isEditingDetails && (
                      <button
                        onClick={() => setIsEditingDetails(true)}
                        className="text-sm font-bold px-4 py-2 rounded-xl transition-colors"
                        style={{ color: '#1C4B46' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#0F2B26';
                          e.currentTarget.style.backgroundColor = '#E6F3F1';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#1C4B46';
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        {enquiryDetails ? 'Edit' : 'Add Details'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-6">
                {isEditingDetails ? (
                  <div className="space-y-4">
                    <textarea
                      value={enquiryDetails}
                      onChange={(e) => setEnquiryDetails(e.target.value)}
                      placeholder="Enter enquiry details..."
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300/50 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:border-transparent placeholder-gray-500 text-sm text-gray-900 bg-white/80 backdrop-blur-sm transition-all duration-200 hover:shadow-md resize-none"
                      style={{ 
                        '--tw-ring-color': '#1C4B46'
                      } as React.CSSProperties}
                    />
                    <div className="flex space-x-3">
                      <button
                        onClick={handleSaveDetails}
                        disabled={isSavingDetails}
                        className="text-white font-bold px-6 py-2 rounded-xl transition-colors duration-200 disabled:opacity-50"
                        style={{ backgroundColor: isSavingDetails ? '#8DA7A3' : '#1C4B46' }}
                        onMouseEnter={(e) => !isSavingDetails && (e.currentTarget.style.backgroundColor = '#164037')}
                        onMouseLeave={(e) => !isSavingDetails && (e.currentTarget.style.backgroundColor = '#1C4B46')}
                      >
                        {isSavingDetails ? 'Saving...' : 'Save Details'}
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingDetails(false);
                          setEnquiryDetails(enquiry.enquiryDetails || '');
                        }}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-6 py-2 rounded-xl transition-colors duration-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="min-h-[120px]">
                    {enquiryDetails ? (
                      <div>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">{enquiryDetails}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No enquiry details added yet. Click &quot;Add Details&quot; to enter custom details.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Doctor Remarks */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-white to-orange-50/30 border-b border-gray-200/50">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-900">Doctor Remarks</h2>
                  {!isEditingDocRemarks && (
                    <button
                      onClick={() => setIsEditingDocRemarks(true)}
                      className="text-sm font-bold px-4 py-2 rounded-xl transition-colors"
                      style={{ color: '#1C4B46' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#0F2B26';
                        e.currentTarget.style.backgroundColor = '#E6F3F1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#1C4B46';
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      {docRemarks ? 'Edit Remarks' : 'Add Remarks'}
                    </button>
                  )}
                </div>
              </div>
              <div className="p-6">
                {isEditingDocRemarks ? (
                  <div className="space-y-4">
                    <textarea
                      value={docRemarks}
                      onChange={(e) => setDocRemarks(e.target.value)}
                      placeholder="Enter doctor's remarks about this enquiry..."
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300/50 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:border-transparent placeholder-gray-500 text-sm text-gray-900 bg-white/80 backdrop-blur-sm transition-all duration-200 hover:shadow-md resize-none"
                      style={{ 
                        '--tw-ring-color': '#1C4B46'
                      } as React.CSSProperties}
                    />
                    <div className="flex space-x-3">
                      <button
                        onClick={handleSaveDocRemarks}
                        disabled={isSavingDocRemarks}
                        className="text-white font-bold px-6 py-2 rounded-xl transition-colors duration-200 disabled:opacity-50"
                        style={{ backgroundColor: isSavingDocRemarks ? '#8DA7A3' : '#1C4B46' }}
                        onMouseEnter={(e) => !isSavingDocRemarks && (e.currentTarget.style.backgroundColor = '#164037')}
                        onMouseLeave={(e) => !isSavingDocRemarks && (e.currentTarget.style.backgroundColor = '#1C4B46')}
                      >
                        {isSavingDocRemarks ? 'Saving...' : 'Save Remarks'}
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingDocRemarks(false);
                          setDocRemarks(enquiry.docRemarks || '');
                        }}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-6 py-2 rounded-xl transition-colors duration-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="min-h-[100px]">
                    {docRemarks ? (
                      <div>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">{docRemarks}</p>
                        {enquiry.docRemarksAt && (
                          <div className="mt-3 p-3 bg-orange-50 rounded-xl border border-orange-200">
                            <p className="text-xs text-orange-700">
                              Remarks added at: {formatTimestamp(
                                enquiry.docRemarksAt && typeof enquiry.docRemarksAt === 'object' && 'toDate' in enquiry.docRemarksAt
                                  ? enquiry.docRemarksAt.toDate()
                                  : enquiry.docRemarksAt instanceof Date
                                  ? enquiry.docRemarksAt
                                  : null
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No doctor remarks added yet. Click &quot;Add Remarks&quot; to enter doctor's observations.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Timeline */}
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50">
              <h2 className="text-xl font-bold text-gray-900">Timeline</h2>
            </div>
            <div className="p-6">
              <div className="flow-root">
                <ul className="-mb-8">
                  {timeline.map((event, eventIdx) => (
                    <li key={event.id}>
                      <div className="relative pb-8">
                        {eventIdx !== timeline.length - 1 ? (
                          <span
                            className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                            aria-hidden="true"
                          />
                        ) : null}
                        <div className="relative flex space-x-3">
                          <div>
                            <span
                              className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                                event.status === 'completed'
                                  ? 'bg-green-500'
                                  : event.status === 'current'
                                  ? 'bg-blue-500'
                                  : 'bg-gray-300'
                              }`}
                            >
                              {event.status === 'completed' ? (
                                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              ) : event.status === 'current' ? (
                                <div className="w-3 h-3 bg-white rounded-full" />
                              ) : (
                                <div className="w-3 h-3 bg-gray-500 rounded-full" />
                              )}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1 pt-1.5">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{event.title}</p>
                              <p className="mt-0.5 text-sm text-gray-500">{event.description}</p>
                              {event.timestamp && (
                                <p className="mt-0.5 text-xs text-black">{formatTimestamp(event.timestamp)}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Mark as Completed Button */}
              {enquiry.status && ['pending', 'in_progress'].includes(enquiry.status) && (
                <div className="mt-6 pt-6 border-t border-gray-200/50">
                  <button
                    onClick={handleMarkAsCompleted}
                    disabled={isMarkingCompleted}
                    className="w-full flex items-center justify-center px-4 py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-50"
                    style={{ 
                      backgroundColor: isMarkingCompleted ? '#8DA7A3' : '#10B981',
                      color: 'white'
                    }}
                    onMouseEnter={(e) => !isMarkingCompleted && (e.currentTarget.style.backgroundColor = '#059669')}
                    onMouseLeave={(e) => !isMarkingCompleted && (e.currentTarget.style.backgroundColor = '#10B981')}
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {isMarkingCompleted ? 'Marking as Completed...' : 'Mark as Completed'}
                  </button>
                </div>
              )}
              
              {/* Reminder Buttons */}
              {enquiry.status && ['in_progress', 'completed', 'cancelled'].includes(enquiry.status) && (
                <div className="mt-6 pt-6 border-t border-gray-200/50">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Set Reminder</h3>
                  
                  {enquiry.reminderScheduledAt ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <svg className="w-5 h-5 text-blue-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <div>
                              <span className="text-sm font-medium text-blue-800">
                                Reminder active for {enquiry.reminderDuration} hours
                              </span>
                              <p className="text-xs text-blue-600 mt-1">
                                {(() => {
                                  if (!enquiry.reminderScheduledAt || !enquiry.reminderDuration) return 'Will return to pending status automatically';
                                  
                                  const reminderTime = typeof enquiry.reminderScheduledAt === 'object' && 'toDate' in enquiry.reminderScheduledAt
                                    ? enquiry.reminderScheduledAt.toDate()
                                    : enquiry.reminderScheduledAt instanceof Date
                                    ? enquiry.reminderScheduledAt
                                    : null;

                                  if (!reminderTime) return 'Will return to pending status automatically';

                                  const now = new Date();
                                  const expiryTime = new Date(reminderTime.getTime() + (enquiry.reminderDuration * 60 * 60 * 1000));
                                  const timeRemaining = expiryTime.getTime() - now.getTime();
                                  
                                  if (timeRemaining > 0) {
                                    const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
                                    const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
                                    
                                    if (days > 0) {
                                      return `Time remaining: ${days}d ${hours}h`;
                                    } else if (hours > 0) {
                                      return `Time remaining: ${hours}h ${minutes}m`;
                                    } else {
                                      return `Time remaining: ${minutes}m`;
                                    }
                                  } else {
                                    return 'Reminder expired - will be reset soon';
                                  }
                                })()}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={handleCancelReminder}
                            disabled={isSettingReminder}
                            className="text-red-600 hover:text-red-900 text-sm font-medium px-3 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <button
                        onClick={() => handleSetReminder(24)}
                        disabled={isSettingReminder}
                        className="w-full flex items-center justify-center px-4 py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-50"
                        style={{ 
                          backgroundColor: isSettingReminder ? '#8DA7A3' : '#1C4B46',
                          color: 'white'
                        }}
                        onMouseEnter={(e) => !isSettingReminder && (e.currentTarget.style.backgroundColor = '#164037')}
                        onMouseLeave={(e) => !isSettingReminder && (e.currentTarget.style.backgroundColor = '#1C4B46')}
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Remind me in 1 day
                      </button>
                      
                      <button
                        onClick={() => handleSetReminder(72)}
                        disabled={isSettingReminder}
                        className="w-full flex items-center justify-center px-4 py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-50"
                        style={{ 
                          backgroundColor: isSettingReminder ? '#8DA7A3' : '#1C4B46',
                          color: 'white'
                        }}
                        onMouseEnter={(e) => !isSettingReminder && (e.currentTarget.style.backgroundColor = '#164037')}
                        onMouseLeave={(e) => !isSettingReminder && (e.currentTarget.style.backgroundColor = '#1C4B46')}
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Remind me in 3 days
                      </button>
                      
                      <button
                        onClick={() => handleSetReminder(120)}
                        disabled={isSettingReminder}
                        className="w-full flex items-center justify-center px-4 py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-50"
                        style={{ 
                          backgroundColor: isSettingReminder ? '#8DA7A3' : '#1C4B46',
                          color: 'white'
                        }}
                        onMouseEnter={(e) => !isSettingReminder && (e.currentTarget.style.backgroundColor = '#164037')}
                        onMouseLeave={(e) => !isSettingReminder && (e.currentTarget.style.backgroundColor = '#1C4B46')}
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Remind me in 5 days
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reminder Expired Popup */}
      {showReminderExpiredPopup && expiredEnquiry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-bounce-in">
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 px-6 py-4 animate-pulse">
              <div className="flex items-center">
                <svg className="w-6 h-6 text-white mr-3 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <h3 className="text-lg font-bold text-white">⚠️ Reminder Expired</h3>
              </div>
            </div>
            
            <div className="p-6">
              <div className="mb-4">
                <h4 className="text-lg font-semibold text-gray-900 mb-2">
                  🔔 Enquiry is Still Pending
                </h4>
                <p className="text-gray-600 mb-3">
                  The reminder timer has expired and this enquiry has been automatically returned to pending status. Please review and take action.
                </p>
                
                <div className="bg-gray-50 rounded-lg p-4 space-y-2 border-l-4 border-orange-400">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-600">Visitor:</span>
                    <span className="text-sm text-gray-900 font-semibold">{expiredEnquiry.enquirerName || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-600">Patient:</span>
                    <span className="text-sm text-gray-900 font-semibold">{expiredEnquiry.patientName || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-600">Mobile:</span>
                    <span className="text-sm text-gray-900 font-semibold">{expiredEnquiry.enquirerMobile || 'N/A'}</span>
                  </div>
                  {expiredEnquiry.enquiryDetails && (
                    <div className="pt-2 border-t border-gray-200">
                      <span className="text-sm font-medium text-gray-600">Details:</span>
                      <p className="text-sm text-gray-900 mt-1">{expiredEnquiry.enquiryDetails}</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    // Record dismissal in localStorage
                    if (expiredEnquiry?.id) {
                      try {
                        const localStorageKey = `reminder_popup_shown_${expiredEnquiry.id}`;
                        localStorage.setItem(localStorageKey, new Date().getTime().toString());
                      } catch (error) {
                        console.warn('Could not update localStorage:', error);
                      }
                    }
                    setShowReminderExpiredPopup(false);
                    setExpiredEnquiry(null);
                  }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-4 py-2 rounded-lg transition-colors duration-200"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => {
                    // Record dismissal in localStorage
                    if (expiredEnquiry?.id) {
                      try {
                        const localStorageKey = `reminder_popup_shown_${expiredEnquiry.id}`;
                        localStorage.setItem(localStorageKey, new Date().getTime().toString());
                      } catch (error) {
                        console.warn('Could not update localStorage:', error);
                      }
                    }
                    setShowReminderExpiredPopup(false);
                    setExpiredEnquiry(null);
                    // Optionally redirect to the enquiries list
                    router.push('/admin/enquiries');
                  }}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200"
                >
                  View All Enquiries
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EnquiryDetailsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading enquiry details...</p>
        </div>
      </div>
    }>
      <EnquiryDetailsPageContent />
    </Suspense>
  );
}