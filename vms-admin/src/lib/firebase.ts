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
  Firestore
} from 'firebase/firestore';
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
  }
  return { app, db };
}

export { db, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, where };

// The Firestore collection name is lowercase 'visits' in the database
export const VISITS_COLLECTION = 'visits';
