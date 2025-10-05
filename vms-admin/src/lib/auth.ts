import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User, Auth } from 'firebase/auth';
import { initFirebase } from './firebase';

// Initialize Firebase Auth
let auth: Auth | null = null;

if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
  const { app } = initFirebase({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  });
  
  if (app) {
    auth = getAuth(app);
  }
}

const provider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  if (!auth) throw new Error('Auth not initialized');
  
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
};

export const signOutUser = async () => {
  if (!auth) throw new Error('Auth not initialized');
  
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const onAuthStateChange = (callback: (user: User | null) => void) => {
  if (!auth) return () => {};
  
  return onAuthStateChanged(auth, callback);
};

export { auth };