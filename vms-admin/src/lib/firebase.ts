import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  where,
  Firestore,
  connectFirestoreEmulator
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

let app: FirebaseApp | undefined;
let db: Firestore | undefined;

export function initFirebase(config: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}) {
  if (!getApps().length) {
    app = initializeApp(config);
    db = getFirestore(app);
    
    // Initialize auth with the same app
    getAuth(app);
  } else {
    app = getApps()[0];
    db = getFirestore(app);
  }
  return { app, db };
}

export { db, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, where };

// Collection names
export const VISITS_COLLECTION = 'visits';
export const VISITORS_COLLECTION = 'visitors';
export const BRANCHES_COLLECTION = 'branches';
export const USERS_COLLECTION = 'users';
export const ENQUIRIES_COLLECTION = 'enquiries';
