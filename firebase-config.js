// Firebase SDK imports — Version 10.5.0
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  set,
  get,
  update,
  remove,
  push,
  onValue,
  query,
  orderByChild,
  equalTo,
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

// Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDQ3bYoj549-7hFeieHHMAValS757IWsTY",
  authDomain: "study-c3017.firebaseapp.com",
  databaseURL: "https://study-c3017-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "study-c3017",
  storageBucket: "study-c3017.firebasestorage.app",
  messagingSenderId: "533271518437",
  appId: "1:533271518437:web:378781c3d8da4574b0480c",
  measurementId: "G-PYCYLLF5E2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

// Export Firebase services
export {
  app,
  auth,
  db,
  storage,
  firebaseConfig,

  // Authentication
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  setPersistence,
  browserLocalPersistence,

  // Realtime Database
  ref,
  set,
  get,
  update,
  remove,
  push,
  onValue,
  query,
  orderByChild,
  equalTo,
  serverTimestamp,

  // Cloud Storage
  storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
};
