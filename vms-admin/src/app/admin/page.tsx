"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { initFirebase, db, VISITS_COLLECTION } from '../../lib/firebase';
import { signInWithGoogle, signOutUser, onAuthStateChange } from '../../lib/auth';
import {
  collection as col,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  QuerySnapshot,
  DocumentData,
  DocumentSnapshot
} from 'firebase/firestore';
import type { Visit, VisitFormData, TimestampField } from '../../lib/types';
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

interface EditingVisit extends Visit {
  isEditing?: boolean;
}

const initialFormData: VisitFormData = {
  patientName: '',
  visitorName: '',
  visitorMobile: '+91 ',
  createdBy: '',
  status: 'checked_in'
};

export default function AdminPage() {
  const [visits, setVisits] = useState<EditingVisit[]>([]);
  const [filteredVisits, setFilteredVisits] = useState<EditingVisit[]>([]);
  const [paginatedVisits, setPaginatedVisits] = useState<EditingVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<VisitFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'checked_in' | 'checked_out'>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);

  // Date picker functions
    // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showDatePicker && !target.closest('.date-picker-container')) {
        setShowDatePicker(false);
      }
    };

    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDatePicker]);

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDisplayDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Get day of week (0 = Sunday, 1 = Monday, etc.) and convert to Monday = 0
    let startingDayOfWeek = firstDay.getDay();
    startingDayOfWeek = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1; // Convert Sunday to 6, others shift down

    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      const prevMonthDay = new Date(year, month, 1 - (startingDayOfWeek - i));
      days.push({ 
        date: prevMonthDay, 
        isCurrentMonth: false,
        day: prevMonthDay.getDate()
      });
    }
    
    // Add days of the current month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push({ 
        date: new Date(year, month, day), 
        isCurrentMonth: true,
        day: day
      });
    }
    
    // Add days from next month to fill the grid (6 rows × 7 days = 42 cells)
    const remainingCells = 42 - days.length;
    for (let day = 1; day <= remainingCells; day++) {
      const nextMonthDay = new Date(year, month + 1, day);
      days.push({ 
        date: nextMonthDay, 
        isCurrentMonth: false,
        day: day
      });
    }
    
    return days;
  };

  const handleDateSelect = (date: Date) => {
    const dateString = formatDate(date);
    setDateFilter(dateString);
    setShowDatePicker(false);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const isDateSelected = (date: Date) => {
    if (!dateFilter) return false;
    const selectedDate = new Date(dateFilter + 'T00:00:00');
    return date.getFullYear() === selectedDate.getFullYear() &&
           date.getMonth() === selectedDate.getMonth() &&
           date.getDate() === selectedDate.getDate();
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getFullYear() === today.getFullYear() &&
           date.getMonth() === today.getMonth() &&
           date.getDate() === today.getDate();
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user);
      setAuthLoading(false);
      if (user) {
        // Set default values for new entries and maintain +91 prefix
        setFormData(prev => ({ 
          ...prev, 
          visitorMobile: '+91 '
        }));
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db || !user) {
      setLoading(false);
      return;
    }
    
    const q = query(col(db, VISITS_COLLECTION), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      const items: EditingVisit[] = [];
      snapshot.forEach((docSnap: DocumentSnapshot<DocumentData>) => items.push({ id: docSnap.id, ...docSnap.data() } as EditingVisit));
      setVisits(items);
      setLoading(false);
    }, (error) => {
      console.error('Firestore error:', error);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Filter visits based on search and filter criteria
  useEffect(() => {
    let filtered = [...visits];

    // Search filter (searches in patient name, visitor name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(visit => 
        (visit.patientName?.toLowerCase().includes(query)) ||
        (visit.visitorName?.toLowerCase().includes(query)) ||
        (visit.visitorMobile?.toLowerCase().includes(query))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(visit => visit.status === statusFilter);
    }

    // Email filter
    if (emailFilter.trim()) {
      const emailQuery = emailFilter.toLowerCase().trim();
      filtered = filtered.filter(visit => 
        visit.createdByEmail?.toLowerCase().includes(emailQuery)
      );
    }

    // Date filter
    if (dateFilter) {
      const filterDate = new Date(dateFilter + 'T00:00:00'); // Ensure local date
      filtered = filtered.filter(visit => {
        if (!visit.date) return false;
        
        let visitDate: Date;
        if (typeof visit.date === 'object' && 'toDate' in visit.date && typeof visit.date.toDate === 'function') {
          visitDate = visit.date.toDate();
        } else if (visit.date instanceof Date) {
          visitDate = visit.date;
        } else {
          return false;
        }
        
        // Create local date for comparison (ignore time)
        const visitLocalDate = new Date(visitDate.getFullYear(), visitDate.getMonth(), visitDate.getDate());
        const filterLocalDate = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate());
        
        return visitLocalDate.getTime() === filterLocalDate.getTime();
      });
    }

    setFilteredVisits(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [visits, searchQuery, statusFilter, dateFilter, emailFilter]);

  // Pagination logic
  useEffect(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setPaginatedVisits(filteredVisits.slice(startIndex, endIndex));
  }, [filteredVisits, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredVisits.length / itemsPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top of table when page changes
    const tableElement = document.querySelector('.visits-table');
    if (tableElement) {
      tableElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const formatTimestamp = (timestamp: TimestampField) => {
    if (!timestamp) return '-';
    if (typeof timestamp === 'object' && 'toDate' in timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleString();
    }
    if (timestamp instanceof Date) {
      return timestamp.toLocaleString();
    }
    return String(timestamp);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Special handling for mobile number
    if (name === 'visitorMobile') {
      // Ensure it always starts with +91 
      if (!value.startsWith('+91 ')) {
        setFormData(prev => ({ ...prev, [name]: '+91 ' }));
        return;
      }
      
      // Extract only the digits after +91 
      const digits = value.slice(4).replace(/\D/g, '');
      
      // Limit to 10 digits
      if (digits.length <= 10) {
        setFormData(prev => ({ ...prev, [name]: '+91 ' + digits }));
      }
      return;
    }
    
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted with:', { formData, user: !!user, db: !!db });
    
    if (!db || isSubmitting || !user) {
      console.log('Early return:', { db: !!db, isSubmitting, user: !!user });
      return;
    }

    // Validate mobile number
    if (!formData.visitorMobile || formData.visitorMobile.length !== 14) {
      console.log('Mobile validation failed:', formData.visitorMobile);
      alert('Please enter a valid 10-digit mobile number');
      return;
    }

    // Validate email - must be a valid email or "none"/"None"
    const emailValue = formData.createdBy.trim();
    const isNone = emailValue.toLowerCase() === 'none';
    const isValidEmail = emailValue.includes('@') && emailValue.includes('.');
    
    if (!emailValue || (!isNone && !isValidEmail)) {
      console.log('Email validation failed:', { emailValue, isNone, isValidEmail });
      alert('Please enter a valid email address or type "none"');
      return;
    }

    console.log('All validations passed, submitting...');
    setIsSubmitting(true);
    try {
      const now = serverTimestamp();
      const payload: Partial<Visit> = {
        patientName: formData.patientName,
        visitorName: formData.visitorName,
        visitorMobile: formData.visitorMobile,
        status: formData.status,
        createdBy: user.uid, // Store user UID for Firestore rules
        createdByEmail: isNone ? 'None' : formData.createdBy, // Store email for display
        createdAt: now,
        date: now,
        checkInTime: now,
        checkOutTime: formData.status === 'checked_out' ? now : null,
        updatedAt: now,
        signInMethod: 'google',
        userId: user.uid, // Add user ID for Firestore rules
        userEmail: user.email || '' // Add user email for Firestore rules
      };
      
      console.log('Payload to submit:', payload);
      await addDoc(col(db, VISITS_COLLECTION), payload);
      console.log('Successfully added to Firestore');
      
      setFormData({ 
        patientName: '',
        visitorName: '',
        visitorMobile: '+91 ',
        createdBy: '',
        status: 'checked_in'
      });
    } catch (error) {
      console.error('Error adding visit:', error);
      alert('Failed to add visit. Please try again.');
    }
    setIsSubmitting(false);
  };

  const handleEdit = (visitId: string) => {
    setVisits(prev => prev.map(visit => 
      visit.id === visitId 
        ? { ...visit, isEditing: true }
        : { ...visit, isEditing: false }
    ));
  };

  const handleCancelEdit = (visitId: string) => {
    setVisits(prev => prev.map(visit => 
      visit.id === visitId 
        ? { ...visit, isEditing: false }
        : visit
    ));
  };

  const handleSaveEdit = async (visitId: string, updatedData: Partial<Visit>) => {
    if (!db || !visitId || !user) return;

    try {
      const ref = doc(db, VISITS_COLLECTION, visitId);
      await updateDoc(ref, {
        ...updatedData,
        updatedAt: serverTimestamp(),
        userId: user.uid, // Ensure user context for updates
        userEmail: user.email || ''
      });
      
      setVisits(prev => prev.map(visit => 
        visit.id === visitId 
          ? { ...visit, isEditing: false }
          : visit
      ));
    } catch (error) {
      console.error('Error updating visit:', error);
      alert('Failed to update visit. Please try again.');
    }
  };

  const handleDelete = async (id?: string) => {
    if (!db || !id) return;
    
    if (window.confirm('Are you sure you want to delete this visit?')) {
      try {
        await deleteDoc(doc(db, VISITS_COLLECTION, id));
      } catch (error) {
        console.error('Error deleting visit:', error);
        alert('Failed to delete visit. Please try again.');
      }
    }
  };

  const handleStatusChange = async (visitId: string, newStatus: 'checked_in' | 'checked_out') => {
    if (!db || !visitId || !user) return;

    try {
      const ref = doc(db, VISITS_COLLECTION, visitId);
      const updates: Partial<Visit> = { 
        status: newStatus,
        updatedAt: serverTimestamp(),
        userId: user.uid, // Ensure user context for updates
        userEmail: user.email || ''
      };
      
      if (newStatus === 'checked_out') {
        updates.checkOutTime = serverTimestamp();
      } else {
        updates.checkOutTime = null;
      }
      
      await updateDoc(ref, updates);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setDateFilter('');
    setEmailFilter('');
    setCurrentPage(1);
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
      setVisits([]);
    } catch (error) {
      console.error('Sign out failed:', error);
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
              width={128}
              height={128}
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
                width={64}
                height={64}
                className="h-16 w-auto mr-6"
              />
              <div className="mt-2">
                <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                {/* <p className="mt-1 text-sm text-gray-600">Manage and monitor all visitor entries</p> */}
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
          <div className="flex space-x-6">
            <Link
              href="/admin"
              className="flex items-center border-2 rounded-2xl px-6 py-4 shadow-xl scale-105 transition-all duration-300 group backdrop-blur-sm"
              style={{ 
                backgroundColor: '#1C4B46',
                borderColor: '#1C4B46'
              }}
            >
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-white/20">
                  <img 
                    src="/visits.png" 
                    alt="Visits" 
                    className="w-7 h-7 rounded-lg"
                  />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Visits</h3>
                  <p className="text-sm text-white/80">Check-in patients and manage visits</p>
                </div>
              </div>
            </Link>
            <Link
              href="/admin/enquiries"
              className="flex items-center border-2 border-gray-300/50 rounded-2xl px-6 py-4 hover:border-gray-400 hover:shadow-lg hover:scale-105 transition-all duration-300 group bg-white/80 backdrop-blur-sm"
            >
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg" style={{ backgroundColor: '#1C4B46' }}>
                  <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Enquiries</h3>
                  <p className="text-sm text-gray-600">Submit and track enquiries</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Add New Entry Form */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 mb-8 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50">
            <h2 className="text-xl font-bold text-gray-900">Add New Visit Entry</h2>
          </div>
          <form onSubmit={handleSubmit} className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="min-w-0">
                <label htmlFor="patientName" className="block text-sm font-semibold text-gray-700 mb-1">
                  Patient Name
                </label>
                <input
                  type="text"
                  id="patientName"
                  name="patientName"
                  value={formData.patientName}
                  onChange={handleInputChange}
                  placeholder="Enter patient name"
                  className="w-full px-3 py-2 border border-gray-300/50 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:border-transparent placeholder-gray-500 text-sm text-gray-900 bg-white/80 backdrop-blur-sm transition-all duration-200 hover:shadow-md"
                  style={{ 
                    '--tw-ring-color': '#1C4B46'
                  } as React.CSSProperties}
                  required
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="visitorName" className="block text-sm font-semibold text-gray-700 mb-1">
                  Visitor Name
                </label>
                <input
                  type="text"
                  id="visitorName"
                  name="visitorName"
                  value={formData.visitorName}
                  onChange={handleInputChange}
                  placeholder="Enter visitor name"
                  className="w-full px-3 py-2 border border-gray-300/50 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:border-transparent placeholder-gray-500 text-sm text-gray-900 bg-white/80 backdrop-blur-sm transition-all duration-200 hover:shadow-md"
                  style={{ 
                    '--tw-ring-color': '#1C4B46'
                  } as React.CSSProperties}
                  required
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="visitorMobile" className="block text-sm font-semibold text-gray-700 mb-1">
                  Visitor Mobile
                </label>
                <input
                  type="tel"
                  id="visitorMobile"
                  name="visitorMobile"
                  value={formData.visitorMobile}
                  onChange={handleInputChange}
                  placeholder="+91 1234567890"
                  className="w-full px-3 py-2 border border-gray-300/50 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:border-transparent placeholder-gray-500 text-sm text-gray-900 bg-white/80 backdrop-blur-sm transition-all duration-200 hover:shadow-md"
                  style={{ 
                    '--tw-ring-color': '#1C4B46'
                  } as React.CSSProperties}
                  required
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="createdBy" className="block text-sm font-semibold text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="text"
                  id="createdBy"
                  name="createdBy"
                  value={formData.createdBy}
                  onChange={handleInputChange}
                  placeholder="Enter email address or type 'none'"
                  className="w-full px-3 py-2 border border-gray-300/50 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:border-transparent placeholder-gray-500 text-sm text-gray-900 bg-white/80 backdrop-blur-sm transition-all duration-200 hover:shadow-md"
                  style={{ 
                    '--tw-ring-color': '#1C4B46'
                  } as React.CSSProperties}
                  required
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="status" className="block text-sm font-semibold text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300/50 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:border-transparent text-sm text-gray-900 bg-white/80 backdrop-blur-sm transition-all duration-200 hover:shadow-md"
                  style={{ 
                    '--tw-ring-color': '#1C4B46'
                  } as React.CSSProperties}
                >
                  <option value="checked_in">Checked In</option>
                  <option value="checked_out">Checked Out</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="text-white font-bold px-6 py-2 rounded-xl transition-colors duration-200 disabled:opacity-50"
                style={{ backgroundColor: isSubmitting ? '#8DA7A3' : '#1C4B46' }}
                onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = '#164037')}
                onMouseLeave={(e) => !isSubmitting && (e.currentTarget.style.backgroundColor = '#1C4B46')}
              >
                {isSubmitting ? 'Adding...' : 'Add Visit Entry'}
              </button>
            </div>
          </form>
        </div>

        {/* Search and Filter Section */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 mb-8">
          <div className="px-6 py-4 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50 rounded-t-3xl">
            <h2 className="text-xl font-bold text-gray-900">Search & Filter Visits</h2>
          </div>
          <div className="p-6 rounded-b-3xl">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
              {/* Search Box */}
              <div className="lg:col-span-2">
                <label htmlFor="search" className="block text-sm font-semibold text-gray-700 mb-1">
                  Search
                </label>
                <input
                  type="text"
                  id="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by patient name, visitor name, or mobile..."
                  className="w-full px-3 py-2 border border-gray-300/50 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:border-transparent placeholder-gray-500 text-sm text-gray-900 bg-white/80 backdrop-blur-sm transition-all duration-200 hover:shadow-md"
                  style={{ 
                    '--tw-ring-color': '#1C4B46'
                  } as React.CSSProperties}
                />
              </div>

              {/* Status Filter */}
              <div>
                <label htmlFor="statusFilter" className="block text-sm font-semibold text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="statusFilter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'checked_in' | 'checked_out')}
                  className="w-full px-3 py-2 border border-gray-300/50 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:border-transparent text-sm text-gray-900 bg-white/80 backdrop-blur-sm transition-all duration-200 hover:shadow-md"
                  style={{ 
                    '--tw-ring-color': '#1C4B46'
                  } as React.CSSProperties}
                >
                  <option value="all">All Status</option>
                  <option value="checked_in">Checked In</option>
                  <option value="checked_out">Checked Out</option>
                </select>
              </div>

              {/* Email Filter */}
              <div>
                <label htmlFor="emailFilter" className="block text-sm font-semibold text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="text"
                  id="emailFilter"
                  value={emailFilter}
                  onChange={(e) => setEmailFilter(e.target.value)}
                  placeholder="Filter by email..."
                  className="w-full px-3 py-2 border border-gray-300/50 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:border-transparent placeholder-gray-500 text-sm text-gray-900 bg-white/80 backdrop-blur-sm transition-all duration-200 hover:shadow-md"
                  style={{ 
                    '--tw-ring-color': '#1C4B46'
                  } as React.CSSProperties}
                />
              </div>

              {/* Date Filter */}
              <div className="relative date-picker-container">
                <label htmlFor="dateFilter" className="block text-sm font-semibold text-gray-700 mb-1">
                  Date
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="w-full px-3 py-2 border border-gray-300/50 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:border-transparent text-sm text-gray-900 bg-white/80 backdrop-blur-sm text-left flex items-center justify-between transition-all duration-200 hover:shadow-md"
                    style={{ 
                      '--tw-ring-color': '#1C4B46'
                    } as React.CSSProperties}
                  >
                    <span className={dateFilter ? 'text-gray-900' : 'text-gray-400'}>
                      {dateFilter ? formatDisplayDate(dateFilter) : 'Select date...'}
                    </span>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
                
                {showDatePicker && (
                  <>
                    {/* Backdrop */}
                    <div 
                      className="fixed inset-0 bg-black/20 z-[99998]"
                      onClick={() => setShowDatePicker(false)}
                    />
                    {/* Calendar Modal */}
                    <div className="fixed bg-white border border-gray-300 rounded-lg shadow-2xl z-[99999] p-4 min-w-[280px]"
                      style={{
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)'
                      }}
                    >
                      {/* Calendar Header */}
                      <div className="flex items-center justify-between mb-4">
                        <button
                          type="button"
                          onClick={() => navigateMonth('prev')}
                          className="p-1 hover:bg-gray-100 rounded"
                          aria-label="Previous month"
                        >
                          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <h3 className="text-sm font-medium text-gray-900">
                          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </h3>
                        <button
                          type="button"
                          onClick={() => navigateMonth('next')}
                          className="p-1 hover:bg-gray-100 rounded"
                          aria-label="Next month"
                        >
                          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                      
                      {/* Calendar Grid */}
                      <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
                          <div key={day} className="text-xs font-medium text-gray-500 text-center py-2">
                            {day}
                          </div>
                        ))}
                      </div>
                      
                      <div className="grid grid-cols-7 gap-1">
                        {getDaysInMonth(currentMonth).map((dayInfo, index) => {
                          const isSelected = isDateSelected(dayInfo.date);
                          const isTodayDate = isToday(dayInfo.date);
                          
                          return (
                            <button
                              key={index}
                              type="button"
                              onClick={() => handleDateSelect(dayInfo.date)}
                              className={`
                                w-8 h-8 text-xs rounded-full flex items-center justify-center transition-colors
                                ${!dayInfo.isCurrentMonth 
                                  ? 'text-gray-300 hover:text-gray-400' 
                                  : isSelected
                                    ? 'text-white font-medium'
                                    : isTodayDate
                                      ? 'text-white font-medium'
                                      : 'text-gray-700 hover:bg-gray-100'
                                }
                              `}
                              style={isSelected || isTodayDate ? { backgroundColor: '#1C4B46' } : {}}
                            >
                              {dayInfo.day}
                            </button>
                          );
                        })}
                      </div>
                      
                      {/* Clear button */}
                      {dateFilter && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <button
                            type="button"
                            onClick={() => {
                              setDateFilter('');
                              setShowDatePicker(false);
                            }}
                            className="w-full text-sm text-gray-600 hover:text-gray-800 py-1"
                          >
                            Clear selection
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Filter Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="text-sm text-gray-600">
                Showing {paginatedVisits.length} of {filteredVisits.length} visits
                {filteredVisits.length !== visits.length && (
                  <span className="text-gray-500"> (filtered from {visits.length} total)</span>
                )}
                {(searchQuery || statusFilter !== 'all' || dateFilter || emailFilter) && (
                  <span className="ml-2 text-blue-600">• Filters applied</span>
                )}
              </div>
              
              {/* Clear Filters Button */}
              {(searchQuery || statusFilter !== 'all' || dateFilter || emailFilter) && (
                <button
                  onClick={clearAllFilters}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-4 py-2 rounded-xl text-sm transition-colors duration-200 flex items-center"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear All Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Visits Table */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden visits-table">
          <div className="px-8 py-6 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  All Visits
                  <span className="ml-2 text-sm font-medium text-gray-600">
                    (Page {currentPage} of {totalPages || 1})
                  </span>
                </h2>
              </div>
              
              {/* Active Filters Display */}
              <div className="flex flex-wrap gap-2">
                {searchQuery && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Search: &quot;{searchQuery}&quot;
                  </span>
                )}
                {statusFilter !== 'all' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Status: {statusFilter === 'checked_in' ? 'Checked In' : 'Checked Out'}
                  </span>
                )}
                {emailFilter && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    Email: &quot;{emailFilter}&quot;
                  </span>
                )}
                {dateFilter && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                    Date: {new Date(dateFilter).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-4" style={{ borderTopColor: '#1C4B46' }}></div>
              <p className="mt-4 text-gray-600 font-medium">Loading visits...</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-3xl">
              <table className="min-w-full divide-y divide-gray-200/50 table-fixed bg-white/60 backdrop-blur-sm rounded-3xl overflow-hidden shadow-xl">
                <thead className="bg-gradient-to-r from-gray-50 to-blue-50/30">
                  <tr>
                    <th className="w-32 px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200/50">Patient Name</th>
                    <th className="w-32 px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200/50">Visitor Name</th>
                    <th className="w-20 px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200/50">Visitor #</th>
                    <th className="w-36 px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200/50">Visitor Mobile</th>
                    <th className="w-40 px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200/50">Date</th>
                    <th className="w-40 px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200/50">Check-In Time</th>
                    <th className="w-40 px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200/50">Check-Out Time</th>
                    <th className="w-28 px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200/50">Status</th>
                    <th className="w-40 px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200/50">Updated At</th>
                    <th className="w-44 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedVisits.map((visit, index) => (
                    <VisitRow
                      key={visit.id}
                      visit={visit}
                      index={((currentPage - 1) * itemsPerPage) + index + 1}
                      onEdit={handleEdit}
                      onSave={handleSaveEdit}
                      onCancel={handleCancelEdit}
                      onDelete={handleDelete}
                      onStatusChange={handleStatusChange}
                      formatTimestamp={formatTimestamp}
                    />
                  ))}
                  {paginatedVisits.length === 0 && !loading && (
                    <tr className="border-b border-gray-300">
                      <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center">
                          {visits.length === 0 ? (
                            // No visits at all
                            <>
                              <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                              <p className="text-lg font-medium text-gray-900 mb-1">No visits found</p>
                              <p className="text-sm text-gray-500">Add your first visit entry using the form above.</p>
                            </>
                          ) : (
                            // No visits match current filters
                            <>
                              <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                              <p className="text-lg font-medium text-gray-900 mb-1">No visits match your filters</p>
                              <p className="text-sm text-gray-500 mb-3">Try adjusting your search criteria or clear the filters.</p>
                              <button
                                onClick={clearAllFilters}
                                className="text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors duration-200"
                                style={{ backgroundColor: '#1C4B46' }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#164037'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1C4B46'}
                              >
                                Clear All Filters
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 mt-8 overflow-hidden">
            <div className="px-8 py-6">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-sm text-gray-600">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredVisits.length)} of {filteredVisits.length} visits
                </div>
                
                <div className="flex items-center space-x-2">
                  {/* Previous Button */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm font-bold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  
                  {/* Page Numbers */}
                  <div className="flex space-x-1">
                    {/* First page */}
                    {currentPage > 3 && (
                      <>
                        <button
                          onClick={() => handlePageChange(1)}
                          className="px-3 py-2 text-sm font-bold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          1
                        </button>
                        {currentPage > 4 && (
                          <span className="px-3 py-2 text-sm text-gray-500">...</span>
                        )}
                      </>
                    )}
                    
                    {/* Current page and neighbors */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNumber;
                      if (totalPages <= 5) {
                        pageNumber = i + 1;
                      } else if (currentPage <= 3) {
                        pageNumber = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNumber = totalPages - 4 + i;
                      } else {
                        pageNumber = currentPage - 2 + i;
                      }
                      
                      if (pageNumber < 1 || pageNumber > totalPages) return null;
                      
                      return (
                        <button
                          key={pageNumber}
                          onClick={() => handlePageChange(pageNumber)}
                          className={`px-3 py-2 text-sm font-bold rounded-lg border transition-colors ${
                            currentPage === pageNumber
                              ? 'text-white'
                              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                          style={currentPage === pageNumber ? { backgroundColor: '#1C4B46', borderColor: '#1C4B46' } : {}}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}
                    
                    {/* Last page */}
                    {currentPage < totalPages - 2 && (
                      <>
                        {currentPage < totalPages - 3 && (
                          <span className="px-3 py-2 text-sm text-gray-500">...</span>
                        )}
                        <button
                          onClick={() => handlePageChange(totalPages)}
                          className="px-3 py-2 text-sm font-bold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </div>
                  
                  {/* Next Button */}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm font-bold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface VisitRowProps {
  visit: EditingVisit;
  index: number;
  onEdit: (id: string) => void;
  onSave: (id: string, data: Partial<Visit>) => void;
  onCancel: (id: string) => void;
  onDelete: (id?: string) => void;
  onStatusChange: (id: string, status: 'checked_in' | 'checked_out') => void;
  formatTimestamp: (timestamp: TimestampField) => string;
}

function VisitRow({ visit, index, onEdit, onSave, onCancel, onDelete, onStatusChange, formatTimestamp }: VisitRowProps) {
  const [editData, setEditData] = useState<Partial<Visit>>({});

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Special handling for mobile number in edit mode
    if (name === 'visitorMobile') {
      // Ensure it always starts with +91 
      if (!value.startsWith('+91 ')) {
        setEditData(prev => ({ ...prev, [name]: '+91 ' }));
        return;
      }
      
      // Extract only the digits after +91 
      const digits = value.slice(4).replace(/\D/g, '');
      
      // Limit to 10 digits
      if (digits.length <= 10) {
        setEditData(prev => ({ ...prev, [name]: '+91 ' + digits }));
      }
      return;
    }
    
    setEditData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    if (visit.id) {
      onSave(visit.id, editData);
      setEditData({});
    }
  };

  const handleCancel = () => {
    if (visit.id) {
      onCancel(visit.id);
      setEditData({});
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'checked_in':
        return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Checked In</span>;
      case 'checked_out':
        return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">Checked Out</span>;
      default:
        return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">{status}</span>;
    }
  };

  if (visit.isEditing) {
    return (
      <tr className="bg-blue-50 border-b border-gray-300">
        <td className="w-32 px-6 py-4 border-r border-gray-300">
          <input
            type="text"
            name="patientName"
            defaultValue={visit.patientName || ''}
            onChange={handleEditInputChange}
            placeholder="Enter patient name"
            aria-label="Patient Name"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded placeholder-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
          />
        </td>
        <td className="w-32 px-6 py-4 border-r border-gray-300">
          <input
            type="text"
            name="visitorName"
            defaultValue={visit.visitorName || ''}
            onChange={handleEditInputChange}
            placeholder="Enter visitor name"
            aria-label="Visitor Name"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded placeholder-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
          />
        </td>
        <td className="w-20 px-6 py-4 text-sm text-gray-900 border-r border-gray-300">{index}</td>
        <td className="w-36 px-6 py-4 border-r border-gray-300">
          <input
            type="tel"
            name="visitorMobile"
            defaultValue={visit.visitorMobile || '+91 '}
            onChange={handleEditInputChange}
            placeholder="+91 1234567890"
            aria-label="Visitor Mobile"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
          />
        </td>
        <td className="w-40 px-6 py-4 text-sm text-gray-900 border-r border-gray-300">{formatTimestamp(visit.date)}</td>
        <td className="w-40 px-6 py-4 text-sm text-gray-900 border-r border-gray-300">{formatTimestamp(visit.checkInTime)}</td>
        <td className="w-40 px-6 py-4 text-sm text-gray-900 border-r border-gray-300">{formatTimestamp(visit.checkOutTime)}</td>
        <td className="w-28 px-6 py-4 border-r border-gray-300">
          <select
            name="status"
            defaultValue={visit.status || 'checked_in'}
            onChange={handleEditInputChange}
            aria-label="Status"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
          >
            <option value="checked_in">Checked In</option>
            <option value="checked_out">Checked Out</option>
          </select>
        </td>
        <td className="w-40 px-6 py-4 text-sm text-gray-900 border-r border-gray-300">{formatTimestamp(visit.updatedAt)}</td>
        <td className="w-44 px-6 py-4">
          <div className="flex space-x-2">
            <button
              onClick={handleSave}
              className="text-green-600 hover:text-green-900 text-sm font-bold px-2 py-1 rounded-lg hover:bg-green-50 transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="text-gray-600 hover:text-gray-900 text-sm font-bold px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50 border-b border-gray-300">
      <td className="w-32 px-6 py-4 text-sm font-medium text-gray-900 truncate border-r border-gray-300" title={visit.patientName || '-'}>{visit.patientName || '-'}</td>
      <td className="w-32 px-6 py-4 text-sm text-gray-900 truncate border-r border-gray-300" title={visit.visitorName || '-'}>{visit.visitorName || '-'}</td>
      <td className="w-20 px-6 py-4 text-sm text-gray-900 border-r border-gray-300">{index}</td>
      <td className="w-36 px-6 py-4 text-sm text-gray-900 truncate border-r border-gray-300" title={visit.visitorMobile || '-'}>{visit.visitorMobile || '-'}</td>
      <td className="w-40 px-6 py-4 text-sm text-gray-900 border-r border-gray-300">{formatTimestamp(visit.date)}</td>
      <td className="w-40 px-6 py-4 text-sm text-gray-900 border-r border-gray-300">{formatTimestamp(visit.checkInTime)}</td>
      <td className="w-40 px-6 py-4 text-sm text-gray-900 border-r border-gray-300">{formatTimestamp(visit.checkOutTime)}</td>
      <td className="w-28 px-6 py-4 border-r border-gray-300">{getStatusBadge(visit.status || 'unknown')}</td>
      <td className="w-40 px-6 py-4 text-sm text-gray-900 border-r border-gray-300">{formatTimestamp(visit.updatedAt)}</td>
      <td className="w-44 px-6 py-4">
        <div className="flex space-x-2">
          <button
            onClick={() => visit.id && onEdit(visit.id)}
            className="text-sm font-bold px-2 py-1 rounded-lg transition-colors"
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
            Edit
          </button>
          <button
            onClick={() => visit.id && visit.status && onStatusChange(visit.id, visit.status === 'checked_in' ? 'checked_out' : 'checked_in')}
            className="text-purple-600 hover:text-purple-900 text-sm font-bold px-2 py-1 rounded-lg hover:bg-purple-50 transition-colors"
          >
            {visit.status === 'checked_in' ? 'Check Out' : 'Check In'}
          </button>
          <button
            onClick={() => onDelete(visit.id)}
            className="text-red-600 hover:text-red-900 text-sm font-bold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
