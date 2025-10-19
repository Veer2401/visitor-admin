"use client";

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { initFirebase, db, VISITS_COLLECTION, STAFF_COLLECTION, DOCTORS_COLLECTION } from '../../../../lib/firebase';
import { signInWithGoogle, signOutUser, onAuthStateChange } from '../../../../lib/auth';
import {
  collection as col,
  onSnapshot,
  query,
  doc,
  updateDoc,
  arrayUnion,
  serverTimestamp
} from 'firebase/firestore';
import type { Visit, Staff, Doctor } from '../../../../lib/types';
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

function VisitDetailsContent() {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [visitDetails, setVisitDetails] = useState('');
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [showStaffDropdown, setShowStaffDropdown] = useState(false);
  const [showDoctorDropdown, setShowDoctorDropdown] = useState(false);
  const [isAssigningStaff, setIsAssigningStaff] = useState(false);
  const [isAssigningDoctor, setIsAssigningDoctor] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [showPredefinedOptions, setShowPredefinedOptions] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [docRemarks, setDocRemarks] = useState('');
  const [isEditingDocRemarks, setIsEditingDocRemarks] = useState(false);
  const [isSavingDocRemarks, setIsSavingDocRemarks] = useState(false);
  
  const searchParams = useSearchParams();
  const visitId = searchParams.get('id');

  // Predefined visit purpose options
  const predefinedOptions = [
    "To Deliver Medicines",
    "To Meet Dr",
    "To Meet Admin", 
    "For Billing Purpose",
    "For Payment Purpose",
    "Regular Check-up",
    "Emergency Visit",
    "Other"
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch staff and doctors data
  useEffect(() => {
    if (!db || !user) return;
    
    // Fetch staff
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

    // Fetch doctors
    const doctorsQuery = query(col(db, DOCTORS_COLLECTION));
    const unsubDoctors = onSnapshot(doctorsQuery, (snapshot) => {
      const items: Doctor[] = [];
      snapshot.forEach((docSnap) => 
        items.push({ id: docSnap.id, ...docSnap.data() } as Doctor)
      );
      setDoctors(items);
    }, (error) => {
      console.error('Error fetching doctors:', error);
    });
    
    return () => {
      unsubStaff();
      unsubDoctors();
    };
  }, [user]);

  useEffect(() => {
    if (!db || !user || !visitId) {
      setLoading(false);
      return;
    }
    
    // Listen to specific visit data
    const visitRef = doc(db, VISITS_COLLECTION, visitId);
    const unsubVisit = onSnapshot(visitRef, (doc) => {
      if (doc.exists()) {
        const visitData = { id: doc.id, ...doc.data() } as Visit;
        setVisit(visitData);
        setVisitDetails(visitData.visitDetails || '');
        setDocRemarks(visitData.docRemarks || '');
      } else {
        setVisit(null);
      }
      setLoading(false);
    });
    
    return () => {
      unsubVisit();
    };
  }, [user, visitId]);

  const generateTimeline = (visit: Visit, currentUser: User | null): TimelineEvent[] => {
    if (!visit) return [];

    const timeline: TimelineEvent[] = [];

    // 1. Visitor checked in
    timeline.push({
      id: 'checkin',
      title: 'Visitor Checked In',
      description: `${visit.visitorName || 'Visitor'} checked in to visit ${visit.patientName || 'patient'}`,
      timestamp: visit.checkInTime ? 
        (typeof visit.checkInTime === 'object' && 'toDate' in visit.checkInTime ? 
          visit.checkInTime.toDate() : 
          visit.checkInTime instanceof Date ? visit.checkInTime : null
        ) : null,
      status: 'completed'
    });

    const getActorDisplayName = (updaterEmail?: string | null, currentUser?: User | null) => {
      // Prefer current signed-in user's displayName if they match the updaterEmail
      if (currentUser && updaterEmail && currentUser.email === updaterEmail) {
        const name = currentUser.displayName || '';
        if (name && name.trim().length > 0) return name;
      }

      // Derive readable name from the email local-part (never show full email)
      if (updaterEmail) {
        const local = updaterEmail.split('@')[0] || '';
        const parts = local.split(/[_\.\-]+/).filter(Boolean);
        if (parts.length > 0) {
          return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        }
      }

      return 'Unknown';
    };

    // 2. Attended by staff (if assigned)
    if (visit.attendedBy) {
      timeline.push({
        id: 'attended',
        title: 'Attended by Staff',
        description: `${visit.attendedBy}`,
        timestamp: visit.attendedAt ? 
          (typeof visit.attendedAt === 'object' && 'toDate' in visit.attendedAt ? 
            visit.attendedAt.toDate() : 
            visit.attendedAt instanceof Date ? visit.attendedAt : null
          ) : null,
        status: 'completed'
      });
    }

    // 3. Doctor assigned (if assigned)
    if (visit.assignedDoctor) {
      timeline.push({
        id: 'doctor_assigned',  
        title: 'Doctor Assigned',
        description: `Assigned to ${visit.assignedDoctor}`,
        timestamp: visit.assignedDoctorAt ? 
          (typeof visit.assignedDoctorAt === 'object' && 'toDate' in visit.assignedDoctorAt ? 
            visit.assignedDoctorAt.toDate() : 
            visit.assignedDoctorAt instanceof Date ? visit.assignedDoctorAt : null
          ) : null,
        status: 'completed'
      });
    }

    // 3.5. Doctor remarks (if provided)
    if (visit.docRemarks) {
      timeline.push({
        id: 'doctor_remarks',
        title: 'Doctor Remarks',
        description: `${visit.docRemarks}`,
        timestamp: visit.docRemarksAt ? 
          (typeof visit.docRemarksAt === 'object' && 'toDate' in visit.docRemarksAt ? 
            visit.docRemarksAt.toDate() : 
            visit.docRemarksAt instanceof Date ? visit.docRemarksAt : null
          ) : null,
        status: 'completed'
      });
    }

    // 4. Purpose of visit (if details provided)
    if (visit.visitDetails) {
      const actor = getActorDisplayName(visit.userEmail || null, user);
      timeline.push({
        id: 'purpose',
        title: 'Purpose of Visit',
        description: `${actor}: Purpose: ${visit.visitDetails}`,
        timestamp: visit.updatedAt ? 
          (typeof visit.updatedAt === 'object' && 'toDate' in visit.updatedAt ? 
            visit.updatedAt.toDate() : 
            visit.updatedAt instanceof Date ? visit.updatedAt : null
          ) : null,
        status: 'completed'
      });
    }

    // Add visit details history entries (if any)
    if (visit.visitDetailsHistory && Array.isArray(visit.visitDetailsHistory)) {
      type HistoryEntry = { text: string; at: Date | null; byName: string };
      const history: HistoryEntry[] = visit.visitDetailsHistory.slice().map((h): HistoryEntry => ({
        text: h.text || '',
        at: h.at && typeof h.at === 'object' && 'toDate' in h.at ? h.at.toDate() : (h.at instanceof Date ? h.at : null),
        byName: h.byName || getActorDisplayName(h.byEmail || null, user)
      }));

      history.forEach((h: HistoryEntry, idx: number) => {
        timeline.push({
          id: `visit_history_${idx}`,
          title: 'Visit Details (edited)',
          description: `${h.byName}: ${h.text}`,
          timestamp: h.at,
          status: 'completed'
        });
      });
    }

    // 5. Current status or checkout/checkin events
    // Determine display based on admin checkout status, not visitor checkout
    if (visit.adminCheckOutTime) {
      // Admin has checked out - visit is finalized
      
      // Show visitor checkout if it exists and happened before admin checkout
      if (visit.visitorCheckOutTime) {
        timeline.push({
          id: 'visitor_checkout',
          title: 'Visitor Checked Out',
          description: 'Visitor left the facility',
          timestamp: visit.visitorCheckOutTime ? 
            (typeof visit.visitorCheckOutTime === 'object' && 'toDate' in visit.visitorCheckOutTime ? 
              visit.visitorCheckOutTime.toDate() : 
              visit.visitorCheckOutTime instanceof Date ? visit.visitorCheckOutTime : null
            ) : null,
          status: 'completed'
        });
      }

      // Show admin checkout as final step
      timeline.push({
        id: 'admin_checkout',
        title: 'Admin Checked Out',
        description: 'Visit finalized and checked out by admin',
        timestamp: visit.adminCheckOutTime ? 
          (typeof visit.adminCheckOutTime === 'object' && 'toDate' in visit.adminCheckOutTime ? 
            visit.adminCheckOutTime.toDate() : 
            visit.adminCheckOutTime instanceof Date ? visit.adminCheckOutTime : null
          ) : null,
        status: 'completed'
      });
    } else {
      // Admin has not checked out yet - visit is still active from admin perspective
      
      // Show visitor checkout as an intermediate step if it exists
      if (visit.visitorCheckOutTime) {
        timeline.push({
          id: 'visitor_checkout',
          title: 'Visitor Checked Out',
          description: 'Visitor left the facility (awaiting admin finalization)',
          timestamp: visit.visitorCheckOutTime ? 
            (typeof visit.visitorCheckOutTime === 'object' && 'toDate' in visit.visitorCheckOutTime ? 
              visit.visitorCheckOutTime.toDate() : 
              visit.visitorCheckOutTime instanceof Date ? visit.visitorCheckOutTime : null
            ) : null,
          status: 'completed'
        });
      }
      
      // Show current active status
      timeline.push({
        id: 'current_status',
        title: visit.visitorCheckOutTime ? 'Pending Admin Checkout' : 'Visit in Progress',
        description: visit.visitorCheckOutTime 
          ? 'Visitor has left, awaiting administrative finalization' 
          : 'Visit is currently active',
        timestamp: visit.updatedAt ? 
          (typeof visit.updatedAt === 'object' && 'toDate' in visit.updatedAt ? 
            visit.updatedAt.toDate() : 
            visit.updatedAt instanceof Date ? visit.updatedAt : null
          ) : null,
        status: 'current'
      });
    }

    return timeline;
  };

  const formatTimestamp = (timestamp: Date | null) => {
    if (!timestamp) return 'N/A';
    return timestamp.toLocaleString();
  };

  const handleSaveDetails = async () => {
    if (!db || !visitId || !user) return;

    setIsSavingDetails(true);
    try {
      const visitRef = doc(db, VISITS_COLLECTION, visitId);
      const actorName = (user.displayName && user.displayName.trim()) ? user.displayName : (user.email ? user.email.split('@')[0] : 'Unknown');
      await updateDoc(visitRef, {
        visitDetails: visitDetails,
        updatedAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email || '',
        visitDetailsHistory: arrayUnion({ text: visitDetails, at: serverTimestamp(), byName: actorName, byEmail: user.email || '' })
      });
      setIsEditingDetails(false);
      setShowDoctorDropdown(false); // Close doctor dropdown after saving
    } catch (error) {
      console.error('Error saving visit details:', error);
      alert('Failed to save visit details. Please try again.');
    }
    setIsSavingDetails(false);
  };

  const handleSaveDocRemarks = async () => {
    if (!db || !visitId || !user) return;

    setIsSavingDocRemarks(true);
    try {
      const visitRef = doc(db, VISITS_COLLECTION, visitId);
      await updateDoc(visitRef, {
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

  const handleAssignDoctor = async (doctorName: string) => {
    if (!db || !visitId || !user || !visit) return;

    setIsAssigningDoctor(true);
    try {
      const visitRef = doc(db, VISITS_COLLECTION, visitId);
      await updateDoc(visitRef, {
        assignedDoctor: `Dr. ${doctorName}`, // Store with Dr. prefix
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

  const handleAssignStaff = async (staffName: string) => {
    if (!db || !visitId || !user || !visit) return;

    setIsAssigningStaff(true);
    try {
      const visitRef = doc(db, VISITS_COLLECTION, visitId);
      await updateDoc(visitRef, {
        attendedBy: staffName,
        attendedAt: serverTimestamp(),
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

  const handleCheckOut = async () => {
    if (!db || !visitId || !user || !visit) return;

    setIsCheckingOut(true);
    try {
      const visitRef = doc(db, VISITS_COLLECTION, visitId);
      
      const updates: Partial<Visit> = {
        adminCheckOutTime: serverTimestamp(),
        updatedAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email || ''
      };

      // If no visitor checkout time exists, assume visitor just left and set it
      if (!visit.visitorCheckOutTime) {
        updates.visitorCheckOutTime = serverTimestamp();
      }

      // Always set main status to checked_out when admin checks out
      updates.status = 'checked_out';

      // Keep legacy checkOutTime for compatibility
      updates.checkOutTime = serverTimestamp();

      await updateDoc(visitRef, updates);
    } catch (error) {
      console.error('Error checking out visit:', error);
      alert('Failed to check out visit. Please try again.');
    }
    setIsCheckingOut(false);
  };

  const handleCheckIn = async () => {
    if (!db || !visitId || !user || !visit) return;

    setIsCheckingOut(true); // Using same loading state for consistency
    try {
      const visitRef = doc(db, VISITS_COLLECTION, visitId);
      
      const updates: Partial<Visit> = {
        adminCheckInTime: serverTimestamp(),
        adminCheckOutTime: null, // Clear admin checkout time
        checkOutTime: null, // Clear legacy check-out time for compatibility
        updatedAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email || ''
      };
      
      // Only update main status to checked_in if visitor is also checked in
      // If visitor is still checked out, don't change the main status
      if (!visit.visitorCheckOutTime) {
        updates.status = 'checked_in';
      }
      
      await updateDoc(visitRef, updates);
    } catch (error) {
      console.error('Error checking in visit:', error);
      alert('Failed to check in visit. Please try again.');
    }
    setIsCheckingOut(false);
  };

  const handlePredefinedOptionSelect = (option: string) => {
    if (option === "Other") {
      setVisitDetails('');
      setShowPredefinedOptions(false);
      setIsEditingDetails(true);
      setSelectedOptions([]);
    } else {
      // Toggle selection for multi-select
      setSelectedOptions(prev => {
        if (prev.includes(option)) {
          // Remove if already selected
          return prev.filter(item => item !== option);
        } else {
          // Add if not selected
          return [...prev, option];
        }
      });
    }
  };

  const handleSaveSelectedOptions = async () => {
    if (selectedOptions.length === 0 || !db || !visitId || !user) return;
    
    // Combine selected options with bullet points
    const combinedDetails = selectedOptions.join('\n• ');
    const newDetails = '• ' + combinedDetails;
    
    // If there are existing details, append new ones
    const finalDetails = visitDetails 
      ? visitDetails + '\n' + newDetails
      : newDetails;
    
    try {
      // Save to Firebase immediately
      const visitRef = doc(db, VISITS_COLLECTION, visitId);
      await updateDoc(visitRef, {
        visitDetails: finalDetails,
        updatedAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email || ''
      });

      setVisitDetails(finalDetails);
      setShowPredefinedOptions(false);
      setSelectedOptions([]);
      
      // If "To Meet Dr" is selected, show doctor dropdown
      if (selectedOptions.includes("To Meet Dr")) {
        setShowDoctorDropdown(true);
      }
    } catch (error) {
      console.error('Error saving selected options:', error);
      alert('Failed to save selected options. Please try again.');
    }
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
      setVisit(null);
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'checked_in':
        return <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-green-100 text-green-800">Checked In</span>;
      case 'checked_out':
        return <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-gray-100 text-gray-800">Checked Out</span>;
      default:
        return <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-yellow-100 text-yellow-800">{status}</span>;
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

  if (!visitId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No visit ID provided</p>
          <Link href="/admin" className="text-blue-600 hover:text-blue-800 mt-2 inline-block">
            Back to Visits
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
          <p className="text-gray-600">Loading visit details...</p>
        </div>
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Visit not found</p>
          <Link href="/admin" className="text-blue-600 hover:text-blue-800 mt-2 inline-block">
            Back to Visits
          </Link>
        </div>
      </div>
    );
  }

  const timeline = generateTimeline(visit, user);

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
                <h1 className="text-3xl font-bold text-gray-900">Visit Details</h1>
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <div className="mb-6">
          <Link
            href="/admin"
            className="inline-flex items-center text-gray-600 hover:text-gray-900 transition-colors duration-200"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Visits
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Visit Info */}
          <div className="space-y-6">
            {/* Visit Information */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-white to-green-50/30 border-b border-gray-200/50">
                <h2 className="text-xl font-bold text-gray-900">Visit Information</h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-500">Status</span>
                    <div className="flex items-center space-x-3">
                      {getStatusBadge(visit.status || 'checked_in')}
                      {visit.status === 'checked_in' && !visit.attendedBy && (
                        <div className="relative">
                          <button
                            onClick={() => setShowStaffDropdown(!showStaffDropdown)}
                            disabled={isAssigningStaff}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1 rounded-lg text-xs transition-colors duration-200 disabled:opacity-50 flex items-center space-x-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span>Assign Staff</span>
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
                      {/* Always show Assign Doctor button for checked-in visits */}
                      {visit.status === 'checked_in' && (
                        <div className="relative">
                          <button
                            onClick={() => setShowDoctorDropdown(!showDoctorDropdown)}
                            disabled={isAssigningDoctor}
                            className={`font-bold px-3 py-1 rounded-lg text-xs transition-colors duration-200 disabled:opacity-50 flex items-center space-x-1 ${
                              visit.assignedDoctor 
                                ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>{visit.assignedDoctor ? 'Change Doctor' : 'Assign Doctor'}</span>
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
                      <span className="text-sm font-medium text-gray-500">Patient Name</span>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{visit.patientName || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Visitor Name</span>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{visit.visitorName || 'N/A'}</p>
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Visitor Mobile</span>
                    <p className="mt-1 text-sm font-semibold text-gray-900">{visit.visitorMobile || 'N/A'}</p>
                  </div>
                  {visit.attendedBy && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Attended By</span>
                      <p className="mt-1 text-sm font-semibold text-green-700">{visit.attendedBy}</p>
                    </div>
                  )}
                  {visit.assignedDoctor && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Assigned Doctor</span>
                      <p className="mt-1 text-sm font-semibold text-blue-700">{visit.assignedDoctor}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-500">Check-in Time</span>
                      <p className="mt-1 text-sm text-gray-900">{formatTimestamp(
                        visit.checkInTime && typeof visit.checkInTime === 'object' && 'toDate' in visit.checkInTime
                          ? visit.checkInTime.toDate()
                          : visit.checkInTime instanceof Date
                          ? visit.checkInTime
                          : null
                      )}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500">Check-out Time</span>
                      <p className="mt-1 text-sm text-gray-900">{formatTimestamp(
                        visit.checkOutTime && typeof visit.checkOutTime === 'object' && 'toDate' in visit.checkOutTime
                          ? visit.checkOutTime.toDate()
                          : visit.checkOutTime instanceof Date
                          ? visit.checkOutTime
                          : null
                      )}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Visit Details */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-white to-green-50/30 border-b border-gray-200/50">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-900">Visit Details</h2>
                  <div className="flex space-x-2">
                    {/* Always show Assign Doctor button for checked-in visits */}
                    {visit.status === 'checked_in' && (
                      <div className="relative">
                        <button
                          onClick={() => setShowDoctorDropdown(!showDoctorDropdown)}
                          disabled={isAssigningDoctor}
                          className={`text-sm font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50 flex items-center space-x-2 ${
                            visit.assignedDoctor 
                              ? 'bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>{visit.assignedDoctor ? 'Change Doctor' : 'Assign Doctor'}</span>
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
                    {!isEditingDetails && (
                      <button
                        onClick={() => setShowPredefinedOptions(!showPredefinedOptions)}
                        className="text-sm font-bold px-4 py-2 rounded-xl transition-colors bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        {visitDetails ? 'Add More Options' : 'Quick Options'}
                      </button>
                    )}
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
                        {visitDetails ? 'Edit' : 'Add Details'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-6">
                {/* Predefined Options Dropdown */}
                {showPredefinedOptions && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Select Visit Purpose(s) - You can select multiple:</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {predefinedOptions.map((option) => (
                        <div
                          key={option}
                          onClick={() => handlePredefinedOptionSelect(option)}
                          className={`cursor-pointer p-3 rounded-xl border transition-all duration-200 text-sm font-medium flex items-center space-x-3 ${
                            selectedOptions.includes(option)
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-700 hover:text-blue-700'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                            selectedOptions.includes(option)
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-gray-300'
                          }`}>
                            {selectedOptions.includes(option) && (
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <span>{option}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between mt-4">
                      <button
                        onClick={() => {
                          setShowPredefinedOptions(false);
                          setSelectedOptions([]);
                        }}
                        className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                      {selectedOptions.length > 0 && (
                        <button
                          onClick={handleSaveSelectedOptions}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                        >
                          Add Selected ({selectedOptions.length})
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Doctor Selection for "To Meet Dr" */}
                {visitDetails === "To Meet Dr" && showDoctorDropdown && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Select Doctor to Meet:</h3>
                    <div className="space-y-2">
                      {doctors.length === 0 ? (
                        <div className="p-3 rounded-xl border border-gray-200 text-sm text-gray-500">
                          No doctors available. Please add doctors first.
                        </div>
                      ) : (
                        doctors.map((doctor) => (
                          <button
                            key={doctor.id}
                            onClick={() => handleAssignDoctor(doctor.doctorName || 'Unknown Doctor')}
                            disabled={isAssigningDoctor}
                            className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 text-sm font-medium text-gray-700 hover:text-blue-700 disabled:opacity-50"
                          >
                            {doctor.doctorName || 'Unknown Doctor'}
                          </button>
                        ))
                      )}
                    </div>
                    <button
                      onClick={() => setShowDoctorDropdown(false)}
                      className="mt-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {isEditingDetails ? (
                  <div className="space-y-4">
                    <textarea
                      value={visitDetails}
                      onChange={(e) => setVisitDetails(e.target.value)}
                      placeholder="Enter visit purpose or details..."
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
                          setVisitDetails(visit.visitDetails || '');
                          setShowPredefinedOptions(false);
                        }}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-6 py-2 rounded-xl transition-colors duration-200"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="min-h-[120px]">
                    {visitDetails ? (
                      <div>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">{visitDetails}</p>
                        {/* Show assigned doctor for "To Meet Dr" */}
                        {visitDetails === "To Meet Dr" && visit.assignedDoctor && (
                          <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
                            <p className="text-sm font-semibold text-blue-900">
                              Assigned to: {visit.assignedDoctor}
                            </p>
                            {visit.assignedDoctorAt && (
                              <p className="text-xs text-blue-700 mt-1">
                                Assigned at: {formatTimestamp(
                                  visit.assignedDoctorAt && typeof visit.assignedDoctorAt === 'object' && 'toDate' in visit.assignedDoctorAt
                                    ? visit.assignedDoctorAt.toDate()
                                    : visit.assignedDoctorAt instanceof Date
                                    ? visit.assignedDoctorAt
                                    : null
                                )}
                              </p>
                            )}
                          </div>
                        )}
                        {/* Save button for predefined options */}
                        {predefinedOptions.includes(visitDetails) && visitDetails !== visit.visitDetails && (
                          <div className="mt-4">
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
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No visit details added yet. Click &quot;Quick Options&quot; to select from predefined purposes or &quot;Add Details&quot; to enter custom details.</p>
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
                      placeholder="Enter doctor&apos;s remarks about this visit..."
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
                          setDocRemarks(visit.docRemarks || '');
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
                        {visit.docRemarksAt && (
                          <div className="mt-3 p-3 bg-orange-50 rounded-xl border border-orange-200">
                            <p className="text-xs text-orange-700">
                              Remarks added at: {formatTimestamp(
                                visit.docRemarksAt && typeof visit.docRemarksAt === 'object' && 'toDate' in visit.docRemarksAt
                                  ? visit.docRemarksAt.toDate()
                                  : visit.docRemarksAt instanceof Date
                                  ? visit.docRemarksAt
                                  : null
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No doctor remarks added yet. Click &quot;Add Remarks&quot; to enter doctor&apos;s observations.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Timeline */}
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-white to-green-50/30 border-b border-gray-200/50">
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
              
              {/* Check Out Button - Only show if admin hasn't checked out yet */}
              {!visit.adminCheckOutTime && (
                <div className="mt-6 pt-6 border-t border-gray-200/50">
                  <button
                    onClick={handleCheckOut}
                    disabled={isCheckingOut}
                    className="w-full flex items-center justify-center px-4 py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-50"
                    style={{ 
                      backgroundColor: isCheckingOut ? '#8DA7A3' : '#DC2626',
                      color: 'white'
                    }}
                    onMouseEnter={(e) => !isCheckingOut && (e.currentTarget.style.backgroundColor = '#B91C1C')}
                    onMouseLeave={(e) => !isCheckingOut && (e.currentTarget.style.backgroundColor = '#DC2626')}
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    {isCheckingOut ? 'Checking Out...' : 'Check Out Visit'}
                  </button>
                </div>
              )}

              {/* Check In Button - Only show if admin has checked out */}
              {visit.adminCheckOutTime && (
                <div className="mt-6 pt-6 border-t border-gray-200/50">
                  <button
                    onClick={handleCheckIn}
                    disabled={isCheckingOut}
                    className="w-full flex items-center justify-center px-4 py-3 rounded-xl font-medium transition-all duration-200 disabled:opacity-50"
                    style={{ 
                      backgroundColor: isCheckingOut ? '#8DA7A3' : '#16A34A',
                      color: 'white'
                    }}
                    onMouseEnter={(e) => !isCheckingOut && (e.currentTarget.style.backgroundColor = '#15803D')}
                    onMouseLeave={(e) => !isCheckingOut && (e.currentTarget.style.backgroundColor = '#16A34A')}
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    {isCheckingOut ? 'Checking In...' : 'Check In Visit'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VisitDetailsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading visit details...</p>
        </div>
      </div>
    }>
      <VisitDetailsContent />
    </Suspense>
  );
}