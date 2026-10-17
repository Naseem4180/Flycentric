import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
} from 'firebase/auth';

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: 'flycentric-4d4ab.firebaseapp.com',
  projectId: 'flycentric-4d4ab',
  storageBucket: 'flycentric-4d4ab.firebasestorage.app',
  messagingSenderId: '994438784413',
  appId: '1:994438784413:web:7ca1d1cb9067c625b33b74',
};

export function getFirebaseConfig() {
  try {
    const stored = localStorage.getItem('fc_firebase_config');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.apiKey) return parsed;
    }
  } catch (_) {}

  return {
    apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || '').trim() || localStorage.getItem('fc_firebase_api_key') || '',
    authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim() || localStorage.getItem('fc_firebase_auth_domain') || DEFAULT_FIREBASE_CONFIG.authDomain,
    projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim() || localStorage.getItem('fc_firebase_project_id') || DEFAULT_FIREBASE_CONFIG.projectId,
    storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim() || localStorage.getItem('fc_firebase_storage_bucket') || DEFAULT_FIREBASE_CONFIG.storageBucket,
    messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim() || localStorage.getItem('fc_firebase_messaging_sender_id') || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
    appId: (import.meta.env.VITE_FIREBASE_APP_ID || '').trim() || localStorage.getItem('fc_firebase_app_id') || DEFAULT_FIREBASE_CONFIG.appId,
  };
}

export function saveFirebaseConfig(config) {
  if (!config || typeof config !== 'object') return;
  localStorage.setItem('fc_firebase_config', JSON.stringify(config));
  if (config.apiKey) localStorage.setItem('fc_firebase_api_key', config.apiKey);
  if (config.authDomain) localStorage.setItem('fc_firebase_auth_domain', config.authDomain);
  if (config.projectId) localStorage.setItem('fc_firebase_project_id', config.projectId);
  if (config.storageBucket) localStorage.setItem('fc_firebase_storage_bucket', config.storageBucket);
  if (config.messagingSenderId) localStorage.setItem('fc_firebase_messaging_sender_id', config.messagingSenderId);
  if (config.appId) localStorage.setItem('fc_firebase_app_id', config.appId);
}

export function isFirebaseConfigured() {
  const cfg = getFirebaseConfig();
  return Boolean(cfg.apiKey && (cfg.authDomain || cfg.projectId));
}

let appInstance = null;
let authInstance = null;

export function getFirebaseAuth() {
  const config = getFirebaseConfig();
  if (!config.apiKey) {
    throw new Error('Firebase is not configured. Please provide Firebase API credentials.');
  }

  if (!getApps().length) {
    appInstance = initializeApp(config);
  } else {
    appInstance = getApp();
  }

  if (!authInstance) {
    authInstance = getAuth(appInstance);
  }
  return authInstance;
}

export async function loginWithGoogleFirebase() {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(auth, provider);
  const user = result.user;
  const idToken = await user.getIdToken();

  return {
    email: user.email,
    name: user.displayName || user.email?.split('@')[0] || 'Google User',
    googleId: user.uid,
    avatar_url: user.photoURL || null,
    idToken,
  };
}

export async function loginWithGoogleRedirect() {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithRedirect(auth, provider);
}

export async function checkGoogleRedirectResult() {
  try {
    const auth = getFirebaseAuth();
    const result = await getRedirectResult(auth);
    if (!result || !result.user) return null;
    const user = result.user;
    const idToken = await user.getIdToken();

    return {
      email: user.email,
      name: user.displayName || user.email?.split('@')[0] || 'Google User',
      googleId: user.uid,
      avatar_url: user.photoURL || null,
      idToken,
    };
  } catch (err) {
    console.error('[FirebaseGoogleRedirectResult]', err);
    throw err;
  }
}

export function formatAuthError(err) {
  if (!err) return '';
  const code = typeof err === 'object' && err.code ? err.code : '';
  const rawMsg = typeof err === 'object' && err.message ? err.message : String(err);

  // User cancelled or closed popup voluntarily
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return '';
  }

  // Popup blocked by browser
  if (code === 'auth/popup-blocked') {
    return 'Google sign-in popup was blocked by your browser. Please allow popups or use the direct sign-in button below.';
  }

  // Unauthorized domain in Firebase
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized for Google Sign-In in Firebase. Please add this domain to Authorized Domains in your Firebase Console.';
  }

  // Network error
  if (code === 'auth/network-request-failed') {
    return 'Network connection error. Please check your internet connection and try again.';
  }

  // Account issues
  if (code === 'auth/user-disabled') {
    return 'This account has been disabled. Please contact support.';
  }

  if (
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-login-credentials'
  ) {
    return 'Invalid email or password. Please verify your credentials and try again.';
  }

  if (code === 'auth/email-already-in-use') {
    return 'An account with this email address already exists. Please sign in instead.';
  }

  if (code === 'auth/weak-password') {
    return 'Password is too weak. Please use at least 8 characters.';
  }

  if (code === 'auth/too-many-requests') {
    return 'Too many sign-in attempts. Please wait a moment and try again.';
  }

  if (code === 'auth/operation-not-allowed') {
    return 'Google sign-in is currently disabled. Please contact support.';
  }

  if (code === 'auth/invalid-api-key') {
    return 'Firebase configuration error: Invalid API key.';
  }

  // Strip raw "Firebase: Error (auth/...)" wrapper if present
  const match = rawMsg.match(/Firebase:\s*Error\s*\(([^)]+)\)\.?/i);
  if (match) {
    const matchedCode = match[1];
    if (matchedCode === 'auth/popup-blocked') {
      return 'Google sign-in popup was blocked by your browser. Please allow popups or use the direct sign-in button below.';
    }
    const cleanWord = matchedCode
      .replace(/^auth\//, '')
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    return `Authentication error: ${cleanWord}.`;
  }

  return rawMsg;
}

export async function registerWithFirebaseEmail(email, password) {
  const auth = getFirebaseAuth();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await sendEmailVerification(credential.user);
  } catch (err) {
    console.warn('[Firebase] Email verification send:', err.message);
  }
  const idToken = await credential.user.getIdToken();
  return {
    user: credential.user,
    idToken,
  };
}

export async function loginWithFirebaseEmail(email, password) {
  const auth = getFirebaseAuth();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const idToken = await credential.user.getIdToken();
  return {
    user: credential.user,
    idToken,
  };
}

export async function logoutFirebase() {
  try {
    if (authInstance) {
      await signOut(authInstance);
    }
  } catch (_) {}
}
