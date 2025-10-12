"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { initFirebase, db, DOCTORS_COLLECTION } from '../../../lib/firebase';
import { signInWithGoogle, signOutUser, onAuthStateChange } from '../../../lib/auth';
import {
  collection as col,
  onSnapshot,
  query,
  addDoc,
  deleteDoc,
  doc,
  QuerySnapshot,
  DocumentData,
  DocumentSnapshot
} from 'firebase/firestore';
import type { Doctor } from '../../../lib/types';
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

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctorName, setDoctorName] = useState('Dr. ');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db || !user) {
      console.log('Doctors useEffect early return:', { db: !!db, user: !!user });
      setLoading(false);
      return;
    }
    
    console.log('Setting up doctors listener for collection:', DOCTORS_COLLECTION);
    const q = query(col(db, DOCTORS_COLLECTION));
    const unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      console.log('Doctors snapshot received, size:', snapshot.size);
      const items: Doctor[] = [];
      snapshot.forEach((docSnap: DocumentSnapshot<DocumentData>) => {
        const data = { id: docSnap.id, ...docSnap.data() } as Doctor;
        console.log('Doctor document:', data);
        items.push(data);
      });
      console.log('Setting doctors:', items);
      setDoctors(items);
      setLoading(false);
    }, (error) => {
      console.error('Firestore error:', error);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!db || isSubmitting || !user || !doctorName.trim() || doctorName.trim() === 'Dr.') {
      return;
    }

    setIsSubmitting(true);
    try {
      console.log('User:', user);
      console.log('Database:', db);
      
      const payload = {
        doctorName: doctorName.trim()
      };
      
      console.log('Attempting to add doctor with payload:', payload);
      await addDoc(col(db, DOCTORS_COLLECTION), payload);
      console.log('Doctor added successfully');
      setDoctorName('Dr. '); // Reset to default prefix
    } catch (error) {
      console.error('Detailed error adding doctor:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to add doctor: ${errorMessage}`);
    }
    setIsSubmitting(false);
  };

  const handleDoctorNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Ensure it always starts with "Dr. "
    if (!value.startsWith('Dr. ')) {
      setDoctorName('Dr. ');
      return;
    }
    
    setDoctorName(value);
  };

  const handleDelete = async (id?: string) => {
    if (!db || !id) return;
    
    if (window.confirm('Are you sure you want to delete this doctor?')) {
      try {
        await deleteDoc(doc(db, DOCTORS_COLLECTION, id));
      } catch (error) {
        console.error('Error deleting doctor:', error);
        alert('Failed to delete doctor. Please try again.');
      }
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
      setDoctors([]);
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
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Doctors Management</h1>
              <p className="text-gray-600 mb-8 text-sm leading-relaxed">Sign in to manage doctors</p>
              
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
                <h1 className="text-3xl font-bold text-gray-900">Doctors Management</h1>
                <p className="mt-1 text-sm text-gray-600">Add and manage doctors in the system</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
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
        {/* Add Doctor Form */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 mb-8 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50">
            <h2 className="text-xl font-bold text-gray-900">Add New Doctor</h2>
          </div>
          <form onSubmit={handleSubmit} className="p-6">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label htmlFor="doctorName" className="block text-sm font-semibold text-gray-700 mb-1">
                  Doctor Name
                </label>
                <input
                  type="text"
                  id="doctorName"
                  value={doctorName}
                  onChange={handleDoctorNameChange}
                  placeholder="Dr. Enter doctor name"
                  className="w-full px-3 py-2 border border-gray-300/50 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:border-transparent placeholder-gray-500 text-sm text-gray-900 bg-white/80 backdrop-blur-sm transition-all duration-200 hover:shadow-md"
                  style={{ 
                    '--tw-ring-color': '#2563eb'
                  } as React.CSSProperties}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !doctorName.trim() || doctorName.trim() === 'Dr.'}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2 rounded-xl transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Adding...' : 'Add Doctor'}
              </button>
            </div>
          </form>
        </div>

        {/* Doctors List */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-white to-blue-50/30 border-b border-gray-200/50">
            <h2 className="text-xl font-bold text-gray-900">All Doctors ({doctors.length})</h2>
          </div>
          
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-4 border-t-blue-600"></div>
              <p className="mt-4 text-gray-600 font-medium">Loading doctors...</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {doctors.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <div className="flex flex-col items-center">
                    <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <p className="text-lg font-medium text-gray-900 mb-1">No doctors found</p>
                    <p className="text-sm text-gray-500">Add your first doctor using the form above.</p>
                  </div>
                </div>
              ) : (
                doctors.map((doctor) => (
                  <div key={doctor.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-4">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{doctor.doctorName}</h3>
                        <p className="text-sm text-gray-500">Doctor</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(doctor.id)}
                      className="text-red-600 hover:text-red-900 text-sm font-bold px-3 py-1 rounded-lg hover:bg-red-50 transition-colors duration-200"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}