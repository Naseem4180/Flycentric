import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
} from 'firebase/auth';

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAFaU3Vibd9OpGAXiLPl0sfuxxeQTtOUe0',
  authDomain: 'flycentric-4d4ab.firebaseapp.com',
  projectId: 'flycentric-4d4ab',
  storageBucket: 'flycentric-4d4ab.firebasestorage.app',
  messagingSenderId: '994438784413',
  appId: '1:994438784413:web:7ea1d1eb9067c625b33b74',
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
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || localStorage.getItem('fc_firebase_api_key') || DEFAULT_FIREBASE_CONFIG.apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || localStorage.getItem('fc_firebase_auth_domain') || DEFAULT_FIREBASE_CONFIG.authDomain,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || localStorage.getItem('fc_firebase_project_id') || DEFAULT_FIREBASE_CONFIG.projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || localStorage.getItem('fc_firebase_storage_bucket') || DEFAULT_FIREBASE_CONFIG.storageBucket,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || localStorage.getItem('fc_firebase_messaging_sender_id') || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || localStorage.getItem('fc_firebase_app_id') || DEFAULT_FIREBASE_CONFIG.appId,
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
