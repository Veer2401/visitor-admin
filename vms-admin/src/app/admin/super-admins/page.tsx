"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { initFirebase, db } from '../../../lib/firebase';
import { signInWithGoogle, signOutUser, onAuthStateChange } from '../../../lib/auth';
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

// Static list of super admins
const SUPER_ADMINS = [
  "Ganesh Khandekar",
  "Ritesh Shah",
  "Madhukar Borawade"
];

export default function SuperAdminsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
              width={256}
              height={256}
              quality={100}
              priority
              className="h-32 w-auto"
            />
          </div>
          
          <div className="w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Super Admins</h1>
              <p className="text-gray-600 mb-8 text-sm leading-relaxed">Sign in to view super admins</p>
              
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
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-red-50 to-pink-50">
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
                <h1 className="text-3xl font-bold text-gray-900">Super Admins</h1>
                <p className="mt-1 text-sm text-gray-600">View system super administrators</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link 
                href="/admin/doctors" 
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors duration-200"
              >
                Back to Doctors
              </Link>
              <Link 
                href="/admin" 
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors duration-200"
              >
                Back to Dashboard
              </Link>
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

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Super Admins List */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-white to-red-50/30 border-b border-gray-200/50">
            <h2 className="text-xl font-bold text-gray-900">System Super Administrators ({SUPER_ADMINS.length})</h2>
          </div>
          
          <div className="divide-y divide-gray-200">
            {SUPER_ADMINS.map((adminName, index) => (
              <div key={index} className="px-6 py-4 flex items-center hover:bg-gray-50">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-4">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{adminName}</h3>
                    <p className="text-sm text-gray-500">Super Administrator</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}