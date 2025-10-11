"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { initFirebase, db, VISITS_COLLECTION, ENQUIRIES_COLLECTION } from '../../../lib/firebase';
import { signInWithGoogle, signOutUser, onAuthStateChange } from '../../../lib/auth';
import {
  collection as col,
  onSnapshot,
  query,
  orderBy,
  DocumentData,
  DocumentSnapshot,
  where
} from 'firebase/firestore';
import type { Visit, Enquiry, TimestampField } from '../../../lib/types';
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

interface AnalyticsData {
  totalVisitorsEverCreated: number;
  totalEnquiriesEverCreated: number;
  weeklyData: { day: string; visits: number; enquiries: number }[];
  lastVisitedPatients: { name: string; date: string }[];
  frequentVisitors: { name: string; count: number }[];
  peakHours: { hour: string; count: number }[];
}

export default function AnalyticsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'visits' | 'enquiries'>('visits');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    totalVisitorsEverCreated: 0,
    totalEnquiriesEverCreated: 0,
    weeklyData: [],
    lastVisitedPatients: [],
    frequentVisitors: [],
    peakHours: []
  });

  // Notifications states
  const [pendingEnquiries, setPendingEnquiries] = useState<Enquiry[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db || !user) {
      setLoading(false);
      return;
    }
    
    // Listen to visits data
    const visitsQuery = query(col(db, VISITS_COLLECTION), orderBy('createdAt', 'desc'));
    const unsubVisits = onSnapshot(visitsQuery, (snapshot) => {
      const items: Visit[] = [];
      snapshot.forEach((docSnap: DocumentSnapshot<DocumentData>) => 
        items.push({ id: docSnap.id, ...docSnap.data() } as Visit)
      );
      setVisits(items);
    });

    // Listen to enquiries data
    const enquiriesQuery = query(col(db, ENQUIRIES_COLLECTION), orderBy('createdAt', 'desc'));
    const unsubEnquiries = onSnapshot(enquiriesQuery, (snapshot) => {
      const items: Enquiry[] = [];
      snapshot.forEach((docSnap: DocumentSnapshot<DocumentData>) => 
        items.push({ id: docSnap.id, ...docSnap.data() } as Enquiry)
      );
      setEnquiries(items);
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

    setLoading(false);
    
    return () => {
      unsubVisits();
      unsubEnquiries();
      unsubPending();
    };
  }, [user]);

  // Process analytics data
  useEffect(() => {
    const processAnalyticsData = () => {
      // Get current counts
      const currentVisitsCount = visits.length;
      const currentEnquiriesCount = enquiries.length;
      
      // Get stored cumulative counts from localStorage
      const storedVisitsTotal = localStorage.getItem('totalVisitsEverCreated');
      const storedEnquiriesTotal = localStorage.getItem('totalEnquiriesEverCreated');
      
      // Parse stored values or use current count as initial value
      let cumulativeVisits = storedVisitsTotal ? parseInt(storedVisitsTotal, 10) : currentVisitsCount;
      let cumulativeEnquiries = storedEnquiriesTotal ? parseInt(storedEnquiriesTotal, 10) : currentEnquiriesCount;
      
      // Update cumulative counts if current count is higher (meaning new items were added)
      if (currentVisitsCount > cumulativeVisits) {
        cumulativeVisits = currentVisitsCount;
        localStorage.setItem('totalVisitsEverCreated', cumulativeVisits.toString());
      }
      
      if (currentEnquiriesCount > cumulativeEnquiries) {
        cumulativeEnquiries = currentEnquiriesCount;
        localStorage.setItem('totalEnquiriesEverCreated', cumulativeEnquiries.toString());
      }
      // Generate weekly data for the last 7 days
      const weeklyData = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        
        // Count visits for this day
        const visitCount = visits.filter(visit => {
          if (!visit.date) return false;
          let visitDate: Date;
          if (typeof visit.date === 'object' && 'toDate' in visit.date) {
            visitDate = visit.date.toDate();
          } else if (visit.date instanceof Date) {
            visitDate = visit.date;
          } else {
            return false;
          }
          return visitDate.toDateString() === date.toDateString();
        }).length;

        // Count enquiries for this day
        const enquiryCount = enquiries.filter(enquiry => {
          if (!enquiry.createdAt) return false;
          let enquiryDate: Date;
          if (typeof enquiry.createdAt === 'object' && 'toDate' in enquiry.createdAt) {
            enquiryDate = enquiry.createdAt.toDate();
          } else if (enquiry.createdAt instanceof Date) {
            enquiryDate = enquiry.createdAt;
          } else {
            return false;
          }
          return enquiryDate.toDateString() === date.toDateString();
        }).length;

        return { day: dayName, visits: visitCount, enquiries: enquiryCount };
      });

      // Last visited patients (most recent visits)
      const recentVisits = visits
        .filter(visit => visit.patientName && visit.date)
        .sort((a, b) => {
          const getTimestamp = (visit: Visit) => {
            if (!visit.date) return 0;
            if (typeof visit.date === 'object' && 'toDate' in visit.date) {
              return visit.date.toDate().getTime();
            } else if (visit.date instanceof Date) {
              return visit.date.getTime();
            }
            return 0;
          };
          return getTimestamp(b) - getTimestamp(a);
        });

      const uniquePatients = new Set<string>();
      const lastVisitedPatients = recentVisits
        .filter(visit => {
          if (uniquePatients.has(visit.patientName!)) {
            return false;
          }
          uniquePatients.add(visit.patientName!);
          return true;
        })
        .slice(0, 5)
        .map(visit => {
          let dateStr = 'N/A';
          if (visit.date) {
            let visitDate: Date;
            if (typeof visit.date === 'object' && 'toDate' in visit.date) {
              visitDate = visit.date.toDate();
            } else if (visit.date instanceof Date) {
              visitDate = visit.date;
            } else {
              visitDate = new Date();
            }
            dateStr = visitDate.toLocaleDateString();
          }
          return { name: visit.patientName!, date: dateStr };
        });

      // Frequent visitors
      const visitorCounts: { [key: string]: number } = {};
      visits.forEach(visit => {
        if (visit.visitorName) {
          visitorCounts[visit.visitorName] = (visitorCounts[visit.visitorName] || 0) + 1;
        }
      });
      const frequentVisitors = Object.entries(visitorCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // Peak hours analysis
      const hourCounts: { [key: string]: number } = {};
      visits.forEach(visit => {
        if (!visit.checkInTime) return;
        let checkInDate: Date;
        if (typeof visit.checkInTime === 'object' && 'toDate' in visit.checkInTime) {
          checkInDate = visit.checkInTime.toDate();
        } else if (visit.checkInTime instanceof Date) {
          checkInDate = visit.checkInTime;
        } else {
          return;
        }
        const hour = checkInDate.getHours();
        const hourKey = `${hour}:00`;
        hourCounts[hourKey] = (hourCounts[hourKey] || 0) + 1;
      });
      const peakHours = Object.entries(hourCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 6)
        .map(([hour, count]) => ({ hour, count }));

      setAnalyticsData({
        totalVisitorsEverCreated: cumulativeVisits,
        totalEnquiriesEverCreated: cumulativeEnquiries,
        weeklyData,
        lastVisitedPatients,
        frequentVisitors,
        peakHours
      });
    };

    processAnalyticsData();
  }, [visits, enquiries]);

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
      setEnquiries([]);
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
              <Link
                href="/admin/analytics"
                className="flex items-center border-2 rounded-2xl px-6 py-4 shadow-xl scale-105 transition-all duration-300 group backdrop-blur-sm"
                style={{ 
                  backgroundColor: '#1C4B46',
                  borderColor: '#1C4B46'
                }}
              >
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-white/20">
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">View Analytics</h3>
                    <p className="text-sm text-white/80">View data insights and reports</p>
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
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
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

      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Analytics Tab Selection */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 mb-8 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Analytics Dashboard</h2>
              <div className="flex space-x-4">
                <button
                  onClick={() => setActiveTab('visits')}
                  className={`px-6 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
                    activeTab === 'visits'
                      ? 'text-white shadow-lg'
                      : 'text-gray-700 bg-white/60 hover:bg-white/80'
                  }`}
                  style={activeTab === 'visits' ? { backgroundColor: '#1C4B46' } : {}}
                >
                  <svg className="w-5 h-5 inline mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
                  </svg>
                  Visits Analytics
                </button>
                <button
                  onClick={() => setActiveTab('enquiries')}
                  className={`px-6 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
                    activeTab === 'enquiries'
                      ? 'text-white shadow-lg'
                      : 'text-gray-700 bg-white/60 hover:bg-white/80'
                  }`}
                  style={activeTab === 'enquiries' ? { backgroundColor: '#1C4B46' } : {}}
                >
                  <svg className="w-5 h-5 inline mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
                  </svg>
                  Enquiries Analytics
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Analytics Content */}
        {loading ? (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-4" style={{ borderTopColor: '#1C4B46' }}></div>
            <p className="mt-4 text-gray-600 font-medium">Loading analytics...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200/50 p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1C4B46' }}>
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                      </svg>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Visitors</dt>
                      <dd className="text-lg font-bold text-gray-900">{analyticsData.totalVisitorsEverCreated.toLocaleString()}</dd>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200/50 p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1C4B46' }}>
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                      </svg>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Enquiries</dt>
                      <dd className="text-lg font-bold text-gray-900">{analyticsData.totalEnquiriesEverCreated.toLocaleString()}</dd>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200/50 p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1C4B46' }}>
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        {activeTab === 'visits' ? 'Last Visited Patient' : 'Last Enquiry'}
                      </dt>
                      <dd className="text-lg font-bold text-gray-900 truncate">
                        {activeTab === 'visits' 
                          ? (analyticsData.lastVisitedPatients[0]?.name || 'N/A')
                          : (analyticsData.frequentVisitors[0]?.name || 'N/A')
                        }
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200/50 p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1C4B46' }}>
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                      </svg>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Peak Hour</dt>
                      <dd className="text-lg font-bold text-gray-900">
                        {analyticsData.peakHours[0]?.hour || 'N/A'}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            {/* Weekly Chart */}
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50">
                <h3 className="text-lg font-bold text-gray-900">Weekly Trend</h3>
              </div>
              <div className="p-6">
                <div className="h-64 flex items-end justify-between space-x-8">
                  {analyticsData.weeklyData.map((day, index) => {
                    const maxValue = Math.max(...analyticsData.weeklyData.map(d => 
                      activeTab === 'visits' ? d.visits : d.enquiries
                    ));
                    const value = activeTab === 'visits' ? day.visits : day.enquiries;
                    const height = maxValue > 0 ? (value / maxValue) * 200 : 0;
                    
                    return (
                      <div key={index} className="flex flex-col items-center">
                        <div className="flex flex-col items-center justify-end h-48">
                          <div 
                            className="w-8 rounded-t-lg transition-all duration-300 hover:opacity-80"
                            style={{ 
                              height: `${height}px`,
                              backgroundColor: activeTab === 'visits' ? '#1C4B46' : '#3B82F6',
                              minHeight: value > 0 ? '4px' : '0px'
                            }}
                          />
                        </div>
                        <div className="mt-2 text-xs font-medium text-gray-500">{day.day}</div>
                        <div className="text-xs font-bold text-gray-900">{value}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Data Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column */}
              <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50">
                  <h3 className="text-lg font-bold text-gray-900">
                    {activeTab === 'visits' ? 'Last Visited Patient' : 'Frequent Enquirers'}
                  </h3>
                </div>
                <div className="p-6">
                  <div className="space-y-3">
                    {(activeTab === 'visits' ? analyticsData.lastVisitedPatients : analyticsData.frequentVisitors)
                      .map((item: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl">
                        <div className="flex items-center">
                          {activeTab === 'enquiries' && (
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                                 style={{ backgroundColor: '#1C4B46' }}>
                              {index + 1}
                            </div>
                          )}
                          <span className={`text-sm font-medium text-gray-900 truncate ${activeTab === 'enquiries' ? 'ml-3' : ''}`}>
                            {item.name}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-gray-600">
                          {activeTab === 'visits' ? item.date : item.count}
                        </span>
                      </div>
                    ))}
                    {(activeTab === 'visits' ? analyticsData.lastVisitedPatients : analyticsData.frequentVisitors).length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p>No data available</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50">
                  <h3 className="text-lg font-bold text-gray-900">
                    {activeTab === 'visits' ? 'Peak Visiting Hours' : 'Peak Enquiry Hours'}
                  </h3>
                </div>
                <div className="p-6">
                  <div className="space-y-3">
                    {analyticsData.peakHours.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                               style={{ backgroundColor: '#1C4B46' }}>
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/>
                            </svg>
                          </div>
                          <span className="ml-3 text-sm font-medium text-gray-900">{item.hour}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-600">{item.count}</span>
                      </div>
                    ))}
                    {analyticsData.peakHours.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p>No data available</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}