import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User, Auth } from 'firebase/auth';
import { initFirebase } from './firebase';

// Initialize Firebase Auth
let auth: Auth | null = null;

const initializeAuth = () => {
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
};

// Initialize auth immediately
initializeAuth();

const provider = new GoogleAuthProvider();
provider.addScope('email');
provider.addScope('profile');

// Types for custom claims
export interface UserClaims {
  role?: 'super_admin' | 'branch_admin' | 'staff';
  branchId?: string;
  email?: string;
}

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
    // Sign out from Firebase
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const onAuthStateChange = (callback: (user: User | null) => void) => {
  if (!auth) return () => {};
  
  // Listen to Firebase auth state changes
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    callback(user);
  });
  
  return unsubscribe;
};

export const getCurrentUser = () => {
  return auth?.currentUser || null;
};

export const getCurrentUserToken = async () => {
  if (!auth?.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken();
  } catch (error) {
    console.error('Error getting user token:', error);
    return null;
  }
};

export const getUserClaims = async (): Promise<UserClaims | null> => {
  if (!auth?.currentUser) return null;
  try {
    const tokenResult = await auth.currentUser.getIdTokenResult();
    return {
      role: tokenResult.claims.role as 'super_admin' | 'branch_admin' | 'staff',
      branchId: tokenResult.claims.branchId as string,
      email: tokenResult.claims.email as string,
    };
  } catch (error) {
    console.error('Error getting user claims:', error);
    return null;
  }
};

export const isSuperAdmin = async (): Promise<boolean> => {
  const claims = await getUserClaims();
  return claims?.role === 'super_admin';
};

export const isBranchAdmin = async (): Promise<boolean> => {
  const claims = await getUserClaims();
  return claims?.role === 'branch_admin';
};

export const isStaff = async (): Promise<boolean> => {
  const claims = await getUserClaims();
  return claims?.role === 'staff';
};

export const getUserBranchId = async (): Promise<string | null> => {
  const claims = await getUserClaims();
  return claims?.branchId || null;
};

export { auth };