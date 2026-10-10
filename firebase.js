// ============================================
// MATH CLASS PORTAL — FIREBASE CONFIGURATION
// File: firebase.js
// ============================================

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

import {
  getDatabase
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

import {
  getStorage
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-storage.js";

// Your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDQ3bYoj549-7hFeieHHMAValS757IWsTY",
  authDomain: "study-c3017.firebaseapp.com",
  projectId: "study-c3017",
  storageBucket: "study-c3017.firebasestorage.app",
  messagingSenderId: "533271518437",
  appId: "1:533271518437:web:378781c3d8da4574b0480c",
  measurementId: "G-PYCYLLF5E2"
};

// Initialise Firebase
const app = initializeApp(firebaseConfig);

// Initialise Firebase services
export const auth = getAuth(app);

export const db = getDatabase(app);

export const storage = getStorage(app);

// Keep the user's sign-in persistent
export const persistenceReady = setPersistence(
  auth,
  browserLocalPersistence
);

// Export the Firebase application
export default app;
