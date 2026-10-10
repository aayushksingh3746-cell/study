import {
  initializeApp,
  getApps,
  getApp
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js';

import {
  getAuth
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js';

import {
  getDatabase
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js';

import {
  getStorage
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDQ3bYoj549-7hFeieHHMAValS757IWsTY',
  authDomain: 'study-c3017.firebaseapp.com',
  projectId: 'study-c3017',
  storageBucket: 'study-c3017.firebasestorage.app',
  messagingSenderId: '533271518437',
  appId: '1:533271518437:web:378781c3d8da4574b0480c',
  measurementId: 'G-PYCYLLF5E2'
};

const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);

export default app;
