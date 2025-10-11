"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { initFirebase, db, ENQUIRIES_COLLECTION } from '../../../lib/firebase';
import { signInWithGoogle, signOutUser, onAuthStateChange } from '../../../lib/auth';
import {
  collection as col,
  onSnapshot,
  query,
  orderBy,
  where,
  QuerySnapshot,
  DocumentData,
  DocumentSnapshot,
  updateDoc,
  doc,
  serverTimestamp
} from 'firebase/firestore';
import type { Enquiry } from '../../../lib/types';
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

export default function NotificationsPage() {
  const [pendingEnquiries, setPendingEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Listen for pending enquiries
  useEffect(() => {
    if (!db || !user) {
      setLoading(false);
      return;
    }
    
    const q = query(
      col(db, ENQUIRIES_COLLECTION), 
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    
    const unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      const items: Enquiry[] = [];
      snapshot.forEach((docSnap: DocumentSnapshot<DocumentData>) => 
        items.push({ id: docSnap.id, ...docSnap.data() } as Enquiry)
      );
      setPendingEnquiries(items);
      setLoading(false);
    }, (error) => {
      console.error('Firestore error for pending enquiries:', error);
      setLoading(false);
    });
    
    return () => unsub();
  }, [user]);

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
      setPendingEnquiries([]);
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const handleMarkAsCompleted = async (enquiryId: string) => {
    if (!db || !enquiryId || !user) return;

    try {
      const ref = doc(db, ENQUIRIES_COLLECTION, enquiryId);
      await updateDoc(ref, {
        status: 'completed',
        updatedAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email || ''
      });
    } catch (error) {
      console.error('Error updating enquiry status:', error);
      alert('Failed to update enquiry status. Please try again.');
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
            </div>
            
            {/* Notifications */}
            <div className="relative">
              <div className="relative p-3 text-black bg-gray-100 rounded-xl transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-300 flex items-center justify-center">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
                </svg>
                {pendingEnquiries.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
                    {pendingEnquiries.length}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Notifications Header */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 mb-8 overflow-hidden">
          <div className="px-8 py-6 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50">
            <div className="flex items-center space-x-3">
              <svg className="w-8 h-8 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
              </svg>
              <h2 className="text-2xl font-bold text-gray-900">
                Notifications
              </h2>
              <span className="text-lg text-gray-600">
                ({pendingEnquiries.length} pending)
              </span>
            </div>
          </div>
        </div>

        {/* Notifications Content */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
          <div className="px-8 py-6 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50">
            <h3 className="text-xl font-bold text-gray-900">Pending Enquiries</h3>
          </div>
          
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-4" style={{ borderTopColor: '#1C4B46' }}></div>
              <p className="mt-4 text-gray-600 font-medium">Loading notifications...</p>
            </div>
          ) : pendingEnquiries.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h4 className="text-lg font-medium text-gray-900 mb-2">All caught up!</h4>
              <p className="text-sm text-gray-500">No pending enquiries at the moment.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {pendingEnquiries.map((enquiry) => (
                <div
                  key={enquiry.id}
                  className="p-6 hover:bg-gray-50/50 transition-colors duration-200"
                >
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 w-3 h-3 bg-yellow-400 rounded-full mt-2"></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-lg font-semibold text-gray-900 mb-2">
                            {enquiry.patientName}'s Enquiry is pending
                          </h4>
                          <div className="space-y-1 text-sm text-gray-600">
                            <p><span className="font-medium">Visitor:</span> {enquiry.enquirerName}</p>
                            <p><span className="font-medium">Mobile:</span> {enquiry.enquirerMobile}</p>
                            <p><span className="font-medium">Patient:</span> {enquiry.patientName}</p>
                            <p><span className="font-medium">Created:</span> {
                              enquiry.createdAt && typeof enquiry.createdAt === 'object' && 'toDate' in enquiry.createdAt 
                                ? enquiry.createdAt.toDate().toLocaleDateString('en-US', { 
                                    weekday: 'short',
                                    year: 'numeric',
                                    month: 'short', 
                                    day: 'numeric', 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })
                                : 'Unknown time'
                            }</p>
                          </div>
                        </div>
                        <div className="flex flex-col space-y-2 ml-4">
                          <Link
                            href={`/admin/enquiries?highlight=${enquiry.id}`}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white transition-colors duration-200"
                            style={{ backgroundColor: '#1C4B46' }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#164037'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1C4B46'}
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            View Enquiry
                          </Link>
                          <button
                            onClick={() => handleMarkAsCompleted(enquiry.id!)}
                            className="inline-flex items-center px-4 py-2 border border-green-600 text-sm font-medium rounded-lg text-green-600 bg-white hover:bg-green-50 transition-colors duration-200"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Mark as Completed
                          </button>
                          <span className="inline-flex px-3 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            Pending
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {pendingEnquiries.length > 0 && (
            <div className="px-8 py-4 bg-gray-50/50 border-t border-gray-200">
              <Link
                href="/admin/enquiries"
                className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors duration-200"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                View All Enquiries
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}