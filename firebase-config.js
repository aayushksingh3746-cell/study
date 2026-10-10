// ============================================================
// MATH CLASS — FIREBASE CONFIGURATION
// Firebase Modular SDK 10.5.0
// ============================================================

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  get,
  set,
  update,
  remove,
  push,
  onValue,
  off,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-storage.js";

// ============================================================
// EXISTING FIREBASE PROJECT
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDQ3bYoj549-7hFeieHHMAValS757IWsTY",
  authDomain: "study-c3017.firebaseapp.com",
  databaseURL:
    "https://study-c3017-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "study-c3017",
  storageBucket: "study-c3017.firebasestorage.app",
  messagingSenderId: "533271518437",
  appId: "1:533271518437:web:378781c3d8da4574b0480c",
  measurementId: "G-PYCYLLF5E2"
};

// ============================================================
// INITIALIZE FIREBASE SERVICES
// ============================================================

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getDatabase(app);

const storage = getStorage(app);

// ============================================================
// EXPORT SHARED INSTANCES AND FUNCTIONS
// ============================================================

export {
  app,
  auth,
  db,
  storage,
  firebaseConfig,

  // Authentication
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,

  // Realtime Database
  ref,
  get,
  set,
  update,
  remove,
  push,
  onValue,
  off,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  serverTimestamp,

  // Cloud Storage
  storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
};
