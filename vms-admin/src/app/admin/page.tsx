"use client";

import React, { useEffect, useState } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<VisitFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((user) => {
      setUser(user);
      setAuthLoading(false);
      if (user) {
        // Set the user's email as default for new entries and maintain +91 prefix
        setFormData(prev => ({ 
          ...prev, 
          createdBy: user.email || '',
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
    if (!db || isSubmitting || !user) return;

    // Validate mobile number
    if (!formData.visitorMobile || formData.visitorMobile.length !== 14) {
      alert('Please enter a valid 10-digit mobile number');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = serverTimestamp();
      const payload: Partial<Visit> = {
        ...formData,
        createdAt: now,
        date: now,
        checkInTime: now,
        checkOutTime: formData.status === 'checked_out' ? now : null,
        updatedAt: now,
        signInMethod: 'google' // Add this to match your validation rules
      };
      
      await addDoc(col(db, VISITS_COLLECTION), payload);
      setFormData({ 
        patientName: '',
        visitorName: '',
        visitorMobile: '+91 ',
        createdBy: user.email || '',
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
    if (!db || !visitId) return;

    try {
      const ref = doc(db, VISITS_COLLECTION, visitId);
      await updateDoc(ref, {
        ...updatedData,
        updatedAt: serverTimestamp()
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
    if (!db || !visitId) return;

    try {
      const ref = doc(db, VISITS_COLLECTION, visitId);
      const updates: Partial<Visit> = { 
        status: newStatus,
        updatedAt: serverTimestamp() 
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
            <p className="text-gray-600 mb-8">Sign in to access the Visitor Management System</p>
            
            <button
              onClick={handleSignIn}
              className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
            
            <div className="mt-6 text-sm text-gray-500">
              <p>Only authorized users can access this dashboard.</p>
              <p>Contact your administrator if you need access.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Visitor Management Dashboard For Admin</h1>
              <p className="mt-1 text-sm text-gray-600">Manage and monitor all visitor entries</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                <span>Welcome, </span>
                <span className="font-medium">{user?.displayName || user?.email}</span>
              </div>
              <button
                onClick={handleSignOut}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Add New Entry Form */}
        <div className="bg-white rounded-lg shadow-sm border mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Add New Visit Entry</h2>
          </div>
          <form onSubmit={handleSubmit} className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
              <div className="min-w-0">
                <label htmlFor="patientName" className="block text-sm font-medium text-gray-700 mb-1">
                  Patient Name
                </label>
                <input
                  type="text"
                  id="patientName"
                  name="patientName"
                  value={formData.patientName}
                  onChange={handleInputChange}
                  placeholder="Enter patient name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-900 text-sm text-gray-900"
                  required
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="visitorName" className="block text-sm font-medium text-gray-700 mb-1">
                  Visitor Name
                </label>
                <input
                  type="text"
                  id="visitorName"
                  name="visitorName"
                  value={formData.visitorName}
                  onChange={handleInputChange}
                  placeholder="Enter visitor name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-900 text-sm text-gray-900"
                  required
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="visitorMobile" className="block text-sm font-medium text-gray-700 mb-1">
                  Visitor Mobile
                </label>
                <input
                  type="tel"
                  id="visitorMobile"
                  name="visitorMobile"
                  value={formData.visitorMobile}
                  onChange={handleInputChange}
                  placeholder="+91 1234567890"
                  className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400 text-sm text-gray-900"
                  required
                />
                {/* <p className="mt-1 text-xs text-gray-500">Format: +91 followed by 10 digits</p> */}
              </div>
              <div className="min-w-0">
                <label htmlFor="createdBy" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  id="createdBy"
                  name="createdBy"
                  value={formData.createdBy}
                  onChange={handleInputChange}
                  placeholder="Enter email address"
                  className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400 text-sm text-gray-900"
                  required
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
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
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-md font-medium transition-colors duration-200"
              >
                {isSubmitting ? 'Adding...' : 'Add Visit Entry'}
              </button>
            </div>
          </form>
        </div>

        {/* Visits Table */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">All Visits</h2>
            <p className="text-sm text-gray-600">Real-time visitor data from Firestore</p>
          </div>
          
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading visits...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-32 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient Name</th>
                    <th className="w-32 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visitor Name</th>
                    <th className="w-20 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visitor #</th>
                    <th className="w-36 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Visitor Mobile</th>
                    <th className="w-48 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="w-40 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="w-40 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-In Time</th>
                    <th className="w-40 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-Out Time</th>
                    <th className="w-28 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="w-40 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Updated At</th>
                    <th className="w-44 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {visits.map((visit, index) => (
                    <VisitRow
                      key={visit.id}
                      visit={visit}
                      index={index + 1}
                      onEdit={handleEdit}
                      onSave={handleSaveEdit}
                      onCancel={handleCancelEdit}
                      onDelete={handleDelete}
                      onStatusChange={handleStatusChange}
                      formatTimestamp={formatTimestamp}
                    />
                  ))}
                  {visits.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center">
                          <svg className="w-12 h-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <p className="text-lg font-medium text-gray-900 mb-1">No visits found</p>
                          <p className="text-sm text-gray-500">Add your first visit entry using the form above.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
      <tr className="bg-blue-50">
        <td className="w-32 px-6 py-4">
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
        <td className="w-32 px-6 py-4">
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
        <td className="w-20 px-6 py-4 text-sm text-gray-900">{index}</td>
        <td className="w-36 px-6 py-4">
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
        <td className="w-48 px-6 py-4">
          <input
            type="email"
            name="createdBy"
            defaultValue={visit.createdBy || ''}
            onChange={handleEditInputChange}
            placeholder="Enter email address"
            aria-label="Email"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
          />
        </td>
        <td className="w-40 px-6 py-4 text-sm text-gray-900">{formatTimestamp(visit.date)}</td>
        <td className="w-40 px-6 py-4 text-sm text-gray-900">{formatTimestamp(visit.checkInTime)}</td>
        <td className="w-40 px-6 py-4 text-sm text-gray-900">{formatTimestamp(visit.checkOutTime)}</td>
        <td className="w-28 px-6 py-4">
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
        <td className="w-40 px-6 py-4 text-sm text-gray-900">{formatTimestamp(visit.updatedAt)}</td>
        <td className="w-44 px-6 py-4">
          <div className="flex space-x-2">
            <button
              onClick={handleSave}
              className="text-green-600 hover:text-green-900 text-sm font-medium px-2 py-1 rounded hover:bg-green-50 transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="text-gray-600 hover:text-gray-900 text-sm font-medium px-2 py-1 rounded hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="w-32 px-6 py-4 text-sm font-medium text-gray-900 truncate" title={visit.patientName || '-'}>{visit.patientName || '-'}</td>
      <td className="w-32 px-6 py-4 text-sm text-gray-900 truncate" title={visit.visitorName || '-'}>{visit.visitorName || '-'}</td>
      <td className="w-20 px-6 py-4 text-sm text-gray-900">{index}</td>
      <td className="w-36 px-6 py-4 text-sm text-gray-900 truncate" title={visit.visitorMobile || '-'}>{visit.visitorMobile || '-'}</td>
      <td className="w-48 px-6 py-4 text-sm text-gray-900 truncate" title={visit.createdBy || '-'}>{visit.createdBy || '-'}</td>
      <td className="w-40 px-6 py-4 text-sm text-gray-900">{formatTimestamp(visit.date)}</td>
      <td className="w-40 px-6 py-4 text-sm text-gray-900">{formatTimestamp(visit.checkInTime)}</td>
      <td className="w-40 px-6 py-4 text-sm text-gray-900">{formatTimestamp(visit.checkOutTime)}</td>
      <td className="w-28 px-6 py-4">{getStatusBadge(visit.status || 'unknown')}</td>
      <td className="w-40 px-6 py-4 text-sm text-gray-900">{formatTimestamp(visit.updatedAt)}</td>
      <td className="w-44 px-6 py-4">
        <div className="flex space-x-2">
          <button
            onClick={() => visit.id && onEdit(visit.id)}
            className="text-blue-600 hover:text-blue-900 text-sm font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => visit.id && visit.status && onStatusChange(visit.id, visit.status === 'checked_in' ? 'checked_out' : 'checked_in')}
            className="text-purple-600 hover:text-purple-900 text-sm font-medium px-2 py-1 rounded hover:bg-purple-50 transition-colors"
          >
            {visit.status === 'checked_in' ? 'Check Out' : 'Check In'}
          </button>
          <button
            onClick={() => onDelete(visit.id)}
            className="text-red-600 hover:text-red-900 text-sm font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
