"use client";

import React, { useEffect, useState } from 'react';
import { initFirebase, db, VISITORS_COLLECTION } from '../lib/firebase';
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
  DocumentSnapshot,
  where
} from 'firebase/firestore';
import type { Visitor, TimestampField } from '../lib/types';
import { getUserClaims, getCurrentUser, isSuperAdmin, isBranchAdmin, isStaff, getUserBranchId } from '../lib/auth';

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

export default function VisitsTable() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [userClaims, setUserClaims] = useState<any>(null);
  const [branchId, setBranchId] = useState<string | null>(null);

  useEffect(() => {
    // Get user claims and branch ID
    const loadUserInfo = async () => {
      const claims = await getUserClaims();
      setUserClaims(claims);
      
      // For testing purposes, set a default branch if no claims exist
      if (!claims || !claims.role) {
        // Temporary: Use a default branch for testing
        setBranchId('test-branch');
        setUserClaims({ role: 'staff', branchId: 'test-branch' });
      } else if (claims?.role === 'super_admin') {
        // Super admin can see all visitors
        setBranchId(null);
      } else {
        // Branch admin/staff can only see their branch visitors
        const userBranch = await getUserBranchId();
        setBranchId(userBranch || 'test-branch');
      }
    };
    
    loadUserInfo();
  }, []);

  useEffect(() => {
    if (!db || userClaims === null) return;
    
    let q;
    
    if (userClaims?.role === 'super_admin') {
      // Super admin sees all visitors
      q = query(col(db, VISITORS_COLLECTION), orderBy('createdAt', 'desc'));
    } else if (branchId) {
      // Branch admin/staff see only their branch visitors
      q = query(
        col(db, VISITORS_COLLECTION), 
        where('branchId', '==', branchId),
        orderBy('createdAt', 'desc')
      );
    } else {
      // For testing: show all visitors if no specific branch
      q = query(col(db, VISITORS_COLLECTION), orderBy('createdAt', 'desc'));
    }

    const unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      const items: Visitor[] = [];
      snapshot.forEach((docSnap: DocumentSnapshot<DocumentData>) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Visitor);
      });
      setVisitors(items);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching visitors:', error);
      setLoading(false);
    });
    
    return () => unsub();
  }, [userClaims, branchId]);

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

  async function handleAdd() {
    if (!db) {
      alert('Database not initialized');
      return;
    }

    // Use branchId if available, otherwise use default for testing
    const targetBranchId = branchId || 'test-branch';

    const currentUser = getCurrentUser();
    if (!currentUser) {
      alert('You must be logged in to add visitors');
      return;
    }

    const payload: Partial<Visitor> = {
      visitorName: 'New Visitor',
      visitorMobile: '',
      patientName: '',
      status: 'checked_in',
      branchId: targetBranchId,
      checkInTime: serverTimestamp(),
      createdAt: serverTimestamp(),
      createdBy: currentUser.uid
    };

    try {
      await addDoc(col(db, VISITORS_COLLECTION), payload);
      console.log('Visitor added successfully');
    } catch (error) {
      console.error('Error adding visitor:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to add visitor: ${errorMessage}`);
    }
  }

  async function handleDelete(id?: string) {
    if (!db || !id) return;

    const canDelete = await isSuperAdmin() || await isBranchAdmin();
    if (!canDelete) {
      alert('You do not have permission to delete visitors');
      return;
    }

    try {
      await deleteDoc(doc(db, VISITORS_COLLECTION, id));
    } catch (error) {
      console.error('Error deleting visitor:', error);
      alert('Failed to delete visitor. Please check your permissions.');
    }
  }

  async function handleToggleCheckout(v: Visitor) {
    if (!db || !v.id) return;

    const ref = doc(db, VISITORS_COLLECTION, v.id);
    const updates: Partial<Visitor> = { updatedAt: serverTimestamp() };
    
    if (v.status === 'checked_in') {
      updates.status = 'checked_out';
      updates.checkOutTime = serverTimestamp();
    } else {
      updates.status = 'checked_in';
      updates.checkOutTime = null;
    }

    try {
      await updateDoc(ref, updates);
    } catch (error) {
      console.error('Error updating visitor:', error);
      alert('Failed to update visitor status. Please check your permissions.');
    }
  }

  async function handleUpdateVisitor(v: Visitor, field: keyof Visitor, value: string) {
    if (!db || !v.id) return;

    const ref = doc(db, VISITORS_COLLECTION, v.id);
    const updates: Partial<Visitor> = { 
      [field]: value,
      updatedAt: serverTimestamp() 
    };

    try {
      await updateDoc(ref, updates);
    } catch (error) {
      console.error('Error updating visitor:', error);
      alert('Failed to update visitor. Please check your permissions.');
    }
  }

  const canAddVisitors = userClaims?.role === 'super_admin' || userClaims?.role === 'branch_admin' || userClaims?.role === 'staff';
  const canDeleteVisitors = userClaims?.role === 'super_admin' || userClaims?.role === 'branch_admin';

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Visitors</h2>
        <div className="flex gap-2 items-center">
          {userClaims && (
            <span className="text-sm text-gray-600">
              Role: {userClaims.role} {branchId && `| Branch: ${branchId}`}
            </span>
          )}
          {canAddVisitors && (
            <button onClick={handleAdd} className="px-3 py-1 bg-blue-600 text-white rounded">Add Visitor</button>
          )}
        </div>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : !userClaims ? (
        <div>Please log in to view visitors.</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full table-auto border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="px-2 py-2">Visitor</th>
                <th className="px-2 py-2">Mobile</th>
                <th className="px-2 py-2">Patient</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Branch</th>
                <th className="px-2 py-2">Check In</th>
                <th className="px-2 py-2">Check Out</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visitors.map((v) => (
                <tr key={v.id} className="border-b">
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={v.visitorName || ''}
                      onChange={(e) => handleUpdateVisitor(v, 'visitorName', e.target.value)}
                      placeholder="Visitor name"
                      className="w-full px-1 py-1 border rounded"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={v.visitorMobile || ''}
                      onChange={(e) => handleUpdateVisitor(v, 'visitorMobile', e.target.value)}
                      placeholder="Mobile number"
                      className="w-full px-1 py-1 border rounded"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={v.patientName || ''}
                      onChange={(e) => handleUpdateVisitor(v, 'patientName', e.target.value)}
                      placeholder="Patient name"
                      className="w-full px-1 py-1 border rounded"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <span className={`px-2 py-1 rounded text-sm ${
                      v.status === 'checked_in' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {v.status || '-'}
                    </span>
                  </td>
                  <td className="px-2 py-2">{v.branchId || '-'}</td>
                  <td className="px-2 py-2">{formatTimestamp(v.checkInTime)}</td>
                  <td className="px-2 py-2">{formatTimestamp(v.checkOutTime)}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleToggleCheckout(v)} 
                        className="px-2 py-1 bg-green-600 text-white rounded text-sm"
                      >
                        {v.status === 'checked_in' ? 'Check Out' : 'Check In'}
                      </button>
                      {canDeleteVisitors && (
                        <button 
                          onClick={() => handleDelete(v.id)} 
                          className="px-2 py-1 bg-red-600 text-white rounded text-sm"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visitors.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No visitors found. {canAddVisitors && 'Click "Add Visitor" to create your first entry.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
