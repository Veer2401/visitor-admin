"use client";

import React, { useEffect, useState } from 'react';
import { initFirebase, db, VISITS_COLLECTION } from '../lib/firebase';
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
import type { Visit, TimestampField } from '../lib/types';

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
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    const q = query(col(db, VISITS_COLLECTION), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
      const items: Visit[] = [];
      snapshot.forEach((docSnap: DocumentSnapshot<DocumentData>) => items.push({ id: docSnap.id, ...docSnap.data() } as Visit));
      setVisits(items);
      setLoading(false);
    });
    return () => unsub();
  }, []);

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
    if (!db) return;
    const payload: Partial<Visit> = {
      visitorName: 'New Visitor',
      visitorMobile: '',
      patientName: '',
      status: 'checked_in',
      createdAt: serverTimestamp()
    };
    await addDoc(col(db, VISITS_COLLECTION), payload);
  }

  async function handleDelete(id?: string) {
    if (!db || !id) return;
    await deleteDoc(doc(db, VISITS_COLLECTION, id));
  }

  async function handleToggleCheckout(v: Visit) {
    if (!db || !v.id) return;
    const ref = doc(db, VISITS_COLLECTION, v.id);
    const updates: Partial<Visit> = { updatedAt: serverTimestamp() };
    if (v.status === 'checked_in') {
      updates.status = 'checked_out';
      updates.checkOutTime = serverTimestamp();
    } else {
      updates.status = 'checked_in';
      updates.checkOutTime = null;
    }
    await updateDoc(ref, updates);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Visits</h2>
        <div className="flex gap-2">
          <button onClick={handleAdd} className="px-3 py-1 bg-blue-600 text-white rounded">Add</button>
        </div>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full table-auto border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="px-2 py-2">Visitor</th>
                <th className="px-2 py-2">Mobile</th>
                <th className="px-2 py-2">Patient</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Check In</th>
                <th className="px-2 py-2">Check Out</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id} className="border-b">
                  <td className="px-2 py-2">{v.visitorName || '-'}</td>
                  <td className="px-2 py-2">{v.visitorMobile || '-'}</td>
                  <td className="px-2 py-2">{v.patientName || '-'}</td>
                  <td className="px-2 py-2">{v.status || '-'}</td>
                  <td className="px-2 py-2">{formatTimestamp(v.checkInTime)}</td>
                  <td className="px-2 py-2">{formatTimestamp(v.checkOutTime)}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => handleToggleCheckout(v)} className="px-2 py-1 bg-green-600 text-white rounded">Toggle</button>
                      <button onClick={() => handleDelete(v.id)} className="px-2 py-1 bg-red-600 text-white rounded">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
