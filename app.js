import { auth, db } from './firebase-config.js';

import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js';

import {
  ref,
  get,
  set,
  update
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js';

import { initAdmin } from './admin.js';
import { initTeacher } from './teacher.js';
import { initStudent } from './student.js';

const ADMIN_UID = 'YNdqDJRyZ1hFAtqrJeZJYScldfc2';

const $ = id => document.getElementById(id);

const state = {
  user: null,
  profile: null,
  role: null,
  authMode: 'login',
  activePage: null,
  initialized: {
    admin: false,
    teacher: false,
    student: false
  }
};

let toastTimer = null;
let authListenerStarted = false;
let authSubmissionInProgress = false;

/* -------------------------------------------------------
   PRELOADER
------------------------------------------------------- */

function hidePreloader() {
  const loader = $('loadingScreen');

  if (loader) {
    loader.classList.add('loader-done');
    loader.setAttribute('aria-hidden', 'true');
  }

  if (typeof window.__hideClassroomLoader === 'function') {
    window.__hideClassroomLoader();
  }
}

function updateLoadingText(message) {
  const element = $('loadingText');
  if (element) element.textContent = message;
}

// Never allow an initialization failure to cover the screen indefinitely.
const emergencyLoaderTimer = window.setTimeout(hidePreloader, 10000);

window.addEventListener('error', event => {
  console.error('Classroom JavaScript error:', event.error || event.message);
  hidePreloader();
});

window.addEventListener('unhandledrejection', event => {
  console.error('Unhandled classroom promise rejection:', event.reason);
  hidePreloader();
});

/* -------------------------------------------------------
   HELPERS
------------------------------------------------------- */

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function showToast(message, type = 'info') {
  const toast = $('toast');
  if (!toast) return;

  const icons = {
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation',
    info: 'fa-circle-info'
  };

  const colors = {
    success: 'text-emerald-300',
    error: 'text-rose-300',
    info: 'text-indigo-300'
  };

  toast.innerHTML = `
    <div class="flex items-start gap-3">
      <i class="fa-solid ${icons[type] || icons.info} ${colors[type] || colors.info} mt-1"></i>
      <span>${escapeHTML(message)}</span>
    </div>
  `;

  toast.classList.remove('hidden');

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

function setAuthMessage(message, isError = false) {
  const element = $('authMessage');
  if (!element) return;

  element.textContent = message;
  element.className = isError
    ? 'text-sm text-center text-rose-300'
    : 'text-sm text-center muted';
}

function setDashboardMessage(message) {
  const element = $('dashboardMessage');
  if (element) element.textContent = message || '';
}

function setButtonBusy(button, busy, busyText = 'Please wait...') {
  if (!button) return;

  if (busy) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.disabled = true;
    button.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin mr-2"></i>
      ${escapeHTML(busyText)}
    `;
  } else {
    button.disabled = false;

    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatTime(timestamp) {
  if (!timestamp) return '';

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function getFriendlyError(error) {
  const code = error?.code || '';

  const messages = {
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'No account was found with this email.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/weak-password': 'Please use a stronger password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase.',
    'auth/unauthorized-domain': 'This website domain is not authorised in Firebase Authentication.',
    'PERMISSION_DENIED': 'Firebase denied access. Please check your database rules.'
  };

  return messages[code] || error?.message || 'Something went wrong. Please try again.';
}

/* -------------------------------------------------------
   GLOBAL API FOR THE OTHER MODULES
------------------------------------------------------- */

window.classroom = {
  get user() {
    return state.user;
  },

  get profile() {
    return state.profile;
  },

  get role() {
    return state.role;
  },

  escapeHTML,
  showToast,
  formatTime,
  localDateString,
  setDashboardMessage,

  async refreshProfile() {
    if (!state.user) return null;

    const snapshot = await get(ref(db, `users/${state.user.uid}`));

    state.profile = snapshot.exists() ? snapshot.val() : null;

    return state.profile;
  }
};

/* -------------------------------------------------------
   AUTH SCREEN
------------------------------------------------------- */

function showLoginScreen() {
  $('authScreen')?.classList.remove('hidden');
  $('authScreen')?.classList.add('flex');
  $('appShell')?.classList.add('hidden');
}

function showAppScreen() {
  $('authScreen')?.classList.add('hidden');
  $('authScreen')?.classList.remove('flex');
  $('appShell')?.classList.remove('hidden');
}

function setAuthMode(mode) {
  state.authMode = mode === 'register' ? 'register' : 'login';

  const isRegister = state.authMode === 'register';

  $('nameGroup')?.classList.toggle('hidden', !isRegister);

  if ($('displayName')) {
    $('displayName').required = isRegister;
  }

  if ($('password')) {
    $('password').autocomplete = isRegister
      ? 'new-password'
      : 'current-password';
  }

  const loginTab = $('loginTab');
  const registerTab = $('registerTab');

  if (loginTab) {
    loginTab.className = isRegister
      ? 'secondary-btn'
      : 'primary-btn';
  }

  if (registerTab) {
    registerTab.className = isRegister
      ? 'primary-btn'
      : 'secondary-btn';
  }

  if ($('submitText')) {
    $('submitText').textContent = isRegister
      ? 'Create account'
      : 'Sign in';
  }

  setAuthMessage('');
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  if (authSubmissionInProgress) return;

  const email = $('email')?.value.trim();
  const password = $('password')?.value;
  const displayName = $('displayName')?.value.trim();

  if (!email || !password) {
    setAuthMessage('Enter your email address and password.', true);
    return;
  }

  if (state.authMode === 'register' && !displayName) {
    setAuthMessage('Enter your full name.', true);
    return;
  }

  const button = $('submitButton');

  authSubmissionInProgress = true;
  setButtonBusy(button, true, 'Connecting...');
  setAuthMessage('');

  try {
    if (state.authMode === 'register') {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const uid = credential.user.uid;

      const initialProfile = {
        displayName,
        email,
        role: uid === ADMIN_UID ? 'admin' : 'student',
        rollNumber: 0,
        createdAt: Date.now()
      };

      try {
        await set(ref(db, `users/${uid}`), initialProfile);
      } catch (databaseError) {
        // Auth creation has already succeeded. Sign out rather than
        // leave the user in a half-configured session.
        console.error('Could not create the user profile:', databaseError);

        await signOut(auth);

        throw new Error(
          'Your account was created, but your profile could not be saved. Check your Firebase Database rules and try signing in again.'
        );
      }

      showToast('Your account has been created.', 'success');
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      showToast('Welcome back!', 'success');
    }

  } catch (error) {
    console.error('Authentication failed:', error);
    setAuthMessage(getFriendlyError(error), true);

  } finally {
    authSubmissionInProgress = false;
    setButtonBusy(button, false);
  }
}

async function handlePasswordReset() {
  const email = $('email')?.value.trim();

  if (!email) {
    setAuthMessage('Enter your email address first.', true);
    $('email')?.focus();
    return;
  }

  const button = $('forgotPassword');

  if (button) button.disabled = true;

  try {
    await sendPasswordResetEmail(auth, email);
    setAuthMessage('If an account exists for this address, a reset email will be sent.');
  } catch (error) {
    console.error('Password reset failed:', error);
    setAuthMessage(getFriendlyError(error), true);
  } finally {
    if (button) button.disabled = false;
  }
}

/* -------------------------------------------------------
   PROFILE AND ROLE INITIALISATION
------------------------------------------------------- */

async function hydrateUser(user) {
  updateLoadingText('Loading your classroom...');

  let profile = null;

  try {
    const snapshot = await get(ref(db, `users/${user.uid}`));

    if (snapshot.exists()) {
      profile = snapshot.val();
    } else {
      // Support an authenticated account without a database profile.
      // The server-side rules must still enforce who can write this path.
      profile = {
        displayName: user.displayName || user.email?.split('@')[0] || 'Student',
        email: user.email || '',
        role: user.uid === ADMIN_UID ? 'admin' : 'student',
        rollNumber: 0,
        createdAt: Date.now()
      };

      await set(ref(db, `users/${user.uid}`), profile);
    }

    // This specific UID is recognised as the administrator in the UI.
    // Database rules must independently protect administrator privileges.
    if (user.uid === ADMIN_UID) {
      profile.role = 'admin';

      if (snapshot.exists() && snapshot.val().role !== 'admin') {
        await update(ref(db, `users/${user.uid}`), {
          role: 'admin'
        });
      }
    }

  } catch (error) {
    console.error('Profile loading failed:', error);

    // Do not trap the user behind the preloader if the database is
    // unavailable. Show a limited session and explain the problem.
    profile = {
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      email: user.email || '',
      role: user.uid === ADMIN_UID ? 'admin' : 'student',
      rollNumber: 0
    };

    showToast(
      'Your account is signed in, but your profile could not be loaded. Some features may be unavailable.',
      'error'
    );
  }

  state.user = user;
  state.profile = profile;
  state.role = user.uid === ADMIN_UID
    ? 'admin'
    : (profile.role || 'student');

  window.classroom.user = user;

  updateUserInterface();

  showAppScreen();

  // Ensure the loader disappears before optional dashboard modules run.
  hidePreloader();

  clearTimeout(emergencyLoaderTimer);

  initialiseRoleModules();

  const preferredPage = state.role === 'admin'
    ? 'admin-panel'
    : state.role === 'teacher'
      ? 'teacher-dashboard'
      : 'profile';

  setPage(preferredPage);
}

function updateUserInterface() {
  const profile = state.profile || {};
  const displayName =
    profile.displayName ||
    state.user?.displayName ||
    state.user?.email?.split('@')[0] ||
    'User';

  if ($('userName')) {
    $('userName').textContent = displayName;
  }

  if ($('userRole')) {
    $('userRole').textContent = state.role || 'student';
  }

  if ($('userAvatar')) {
    $('userAvatar').textContent =
      displayName.trim().charAt(0).toUpperCase() || 'U';
  }

  if ($('profileName')) {
    $('profileName').value = profile.displayName || displayName;
  }

  if ($('profileRoll')) {
    $('profileRoll').value = profile.rollNumber ?? 0;
  }

  if ($('profileEmail')) {
    $('profileEmail').value = state.user?.email || '';
  }

  const teacherPages = [
    'teacher-dashboard',
    'doubt-inbox'
  ];

  const studentPages = [
    'profile',
    'notices',
    'tracker',
    'class-chat',
    'ask-doubt'
  ];

  document.querySelectorAll('[data-page]').forEach(button => {
    const page = button.dataset.page;

    let visible = studentPages.includes(page);

    if (state.role === 'teacher') {
      visible = visible || teacherPages.includes(page);
    }

    if (state.role === 'admin') {
      visible = page === 'admin-panel';
    }

    button.classList.toggle('hidden', !visible);
  });
}

/* -------------------------------------------------------
   ROLE MODULES
------------------------------------------------------- */

function safeInitialise(label, callback) {
  try {
    const result = callback();

    if (result && typeof result.catch === 'function') {
      result.catch(error => {
        console.error(`${label} initialisation failed:`, error);
        showToast(`${label} could not be fully loaded.`, 'error');
        hidePreloader();
      });
    }
  } catch (error) {
    console.error(`${label} initialisation failed:`, error);
    showToast(`${label} could not be fully loaded.`, 'error');
  }
}

function initialiseRoleModules() {
  if (!state.user) return;

  if (!state.initialized.student) {
    state.initialized.student = true;

    safeInitialise('Student features', () => {
      initStudent(state.user);
    });
  }

  if (state.role === 'teacher' && !state.initialized.teacher) {
    state.initialized.teacher = true;

    safeInitialise('Teacher dashboard', () => {
      initTeacher(state.user);
    });
  }

  if (state.role === 'admin' && !state.initialized.admin) {
    state.initialized.admin = true;

    safeInitialise('Admin dashboard', () => {
      initAdmin(state.user);
    });
  }
}

/* -------------------------------------------------------
   SPA NAVIGATION
------------------------------------------------------- */

const pageInformation = {
  profile: {
    title: 'Your profile',
    subtitle: 'Manage your classroom information'
  },
  notices: {
    title: 'Class notices',
    subtitle: 'Announcements and learning materials'
  },
  tracker: {
    title: 'Study tracker',
    subtitle: 'Track your daily learning progress'
  },
  'class-chat': {
    title: 'Class chat',
    subtitle: 'Discuss maths with your classmates'
  },
  'ask-doubt': {
    title: 'Ask a doubt',
    subtitle: 'Private communication with your teacher'
  },
  'teacher-dashboard': {
    title: 'Teacher dashboard',
    subtitle: 'Announcements and student verification'
  },
  'doubt-inbox': {
    title: 'Doubt inbox',
    subtitle: 'Private student conversations'
  },
  'admin-panel': {
    title: 'Admin panel',
    subtitle: 'Manage roles and classroom moderation'
  }
};

function setPage(page) {
  const pageElement = $(`page-${page}`);

  if (!pageElement || pageElement.classList.contains('hidden') &&
      !document.querySelector(`[data-page="${page}"]:not(.hidden)`)) {
    // A section may be accessible directly after the role has changed,
    // but unavailable pages should not be shown.
    if (!pageElement || !document.querySelector(`[data-page="${page}"]:not(.hidden)`)) {
      return;
    }
  }

  if (state.role === 'student' &&
      ['teacher-dashboard', 'doubt-inbox', 'admin-panel'].includes(page)) {
    return;
  }

  if (state.role === 'teacher' && page === 'admin-panel') {
    return;
  }

  if (state.role === 'admin' && page !== 'admin-panel') {
    return;
  }

  document.querySelectorAll('.page-section').forEach(section => {
    section.classList.add('hidden');
  });

  pageElement.classList.remove('hidden');

  document.querySelectorAll('[data-page]').forEach(button => {
    button.classList.toggle('active', button.dataset.page === page);
  });

  const info = pageInformation[page] || {
    title: 'Classroom',
    subtitle: ''
  };

  if ($('pageTitle')) $('pageTitle').textContent = info.title;
  if ($('pageSubtitle')) $('pageSubtitle').textContent = info.subtitle;

  state.activePage = page;

  closeMobileSidebar();
}

function openMobileSidebar() {
  $('sidebar')?.classList.add('sidebar-open');
  $('sidebarBackdrop')?.classList.add('visible');
}

function closeMobileSidebar() {
  $('sidebar')?.classList.remove('sidebar-open');
  $('sidebarBackdrop')?.classList.remove('visible');
}

/* -------------------------------------------------------
   PROFILE FORM
------------------------------------------------------- */

async function saveProfile(event) {
  event.preventDefault();

  if (!state.user) return;

  const displayName = $('profileName')?.value.trim();
  const rollValue = $('profileRoll')?.value;

  if (!displayName) {
    showToast('Please enter your name.', 'error');
    return;
  }

  const rollNumber = Number(rollValue || 0);

  if (!Number.isInteger(rollNumber) || rollNumber < 0) {
    showToast('Please enter a valid roll number.', 'error');
    return;
  }

  const button = $('profileForm')?.querySelector('button[type="submit"]');

  setButtonBusy(button, true, 'Saving...');

  try {
    await update(ref(db, `users/${state.user.uid}`), {
      displayName,
      rollNumber,
      email: state.user.email || ''
    });

    state.profile = {
      ...state.profile,
      displayName,
      rollNumber,
      email: state.user.email || ''
    };

    updateUserInterface();

    showToast('Profile updated successfully.', 'success');

  } catch (error) {
    console.error('Profile update failed:', error);
    showToast(getFriendlyError(error), 'error');

  } finally {
    setButtonBusy(button, false);
  }
}

/* -------------------------------------------------------
   SIGN OUT
------------------------------------------------------- */

async function handleLogout() {
  const button = $('logoutButton');

  setButtonBusy(button, true, 'Signing out...');

  try {
    await signOut(auth);
    showToast('You have signed out.', 'success');
  } catch (error) {
    console.error('Sign out failed:', error);
    showToast(getFriendlyError(error), 'error');
  } finally {
    setButtonBusy(button, false);
  }
}

/* -------------------------------------------------------
   AUTHENTICATION STATE
------------------------------------------------------- */

function startAuthenticationListener() {
  if (authListenerStarted) return;

  authListenerStarted = true;
  updateLoadingText('Checking your account...');

  onAuthStateChanged(
    auth,

    async user => {
      try {
        if (user) {
          await hydrateUser(user);
        } else {
          state.user = null;
          state.profile = null;
          state.role = null;
          state.activePage = null;

          showLoginScreen();

          hidePreloader();
          clearTimeout(emergencyLoaderTimer);
        }
      } catch (error) {
        console.error('Authentication state processing failed:', error);

        // Crucial: do not leave the user looking at an endless loader.
        hidePreloader();
        clearTimeout(emergencyLoaderTimer);

        if (auth.currentUser) {
          showAppScreen();
          showToast(
            'Some classroom features could not load. Check your connection and Firebase permissions.',
            'error'
          );
        } else {
          showLoginScreen();
        }
      }
    },

    error => {
      console.error('Firebase authentication listener failed:', error);

      hidePreloader();
      clearTimeout(emergencyLoaderTimer);

      showLoginScreen();

      setAuthMessage(
        'Authentication could not be checked. Please reload the page or check your connection.',
        true
      );
    }
  );
}

/* -------------------------------------------------------
   STARTUP
------------------------------------------------------- */

function initialiseInterface() {
  $('loginTab')?.addEventListener('click', () => setAuthMode('login'));

  $('registerTab')?.addEventListener('click', () => setAuthMode('register'));

  $('authForm')?.addEventListener('submit', handleAuthSubmit);

  $('forgotPassword')?.addEventListener('click', handlePasswordReset);

  $('logoutButton')?.addEventListener('click', handleLogout);

  $('profileForm')?.addEventListener('submit', saveProfile);

  $('menuButton')?.addEventListener('click', openMobileSidebar);

  $('sidebarBackdrop')?.addEventListener('click', closeMobileSidebar);

  document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => {
      setPage(button.dataset.page);
    });
  });

  // The initial auth state callback controls the actual screen.
  setAuthMode('login');

  if ($('studyDate') && !$('studyDate').value) {
    $('studyDate').value = localDateString();
  }
}

function startApp() {
  try {
    initialiseInterface();
    startAuthenticationListener();
  } catch (error) {
    console.error('Application startup failed:', error);

    hidePreloader();
    clearTimeout(emergencyLoaderTimer);

    showLoginScreen();

    setAuthMessage(
      'The application could not start correctly. Check your JavaScript imports and reload.',
      true
    );
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp, { once: true });
} else {
  startApp();
                  }
