import { auth, db } from './firebase-config.js';

import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js';

import {
  ref,
  get,
  onValue,
  set,
  update,
  push
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js';

import { initializeAdmin } from './admin.js';
import { initializeTeacher } from './teacher.js';
import { initializeStudent } from './student.js';

export const ADMIN_UID = 'YNdqDJRyZ1hFAtqrJeZJYScldfc2';

export let currentUser = null;
export let currentRole = null;
export let currentProfile = {};

export const $ = id => document.getElementById(id);

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);

export const formatDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

export const getLocalDate = () => {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
};

export const toArray = value => value
  ? Object.entries(value).map(([id, data]) => ({ id, ...(data || {}) }))
  : [];

let toastTimeout;
let authGeneration = 0;
let profileListener = null;
let sharedAnnouncementListener = null;
let sharedAnnouncementCallback = null;
let sharedAnnouncementValue = [];
let studentModuleInitialized = false;
let teacherModuleInitialized = false;
let adminModuleInitialized = false;

const routeMetadata = {
  home: ['YOUR LEARNING SPACE', 'Dashboard', 'Your progress and classroom updates.'],
  profile: ['YOUR ACCOUNT', 'My Profile', 'Manage your classroom details.'],
  notices: ['STAY INFORMED', 'Notice Board', 'Updates and important classroom information.'],
  tracker: ['BUILD YOUR HABITS', 'Daily Study Tracker', 'Log your work and share proof with your teacher.'],
  chat: ['CLASSROOM COMMUNITY', 'Class Chat', 'Learn together and help each other.'],
  doubts: ['PERSONAL SUPPORT', 'Ask a Doubt', 'A private conversation with your teacher.'],
  'admin-home': ['SYSTEM ADMINISTRATION', 'Admin Dashboard', 'Monitor classroom activity and access.'],
  'admin-panel': ['ACCESS CONTROL', 'Role Manager', 'Assign teacher permissions to trusted accounts.'],
  'admin-chat': ['COMMUNITY SAFETY', 'Chat Moderator', 'Moderate global classroom messages.'],
  'teacher-home': ['TEACHER WORKSPACE', 'Teacher Dashboard', 'Manage student progress and classroom communication.'],
  'teacher-notices': ['CLASSROOM UPDATES', 'Announcements', 'Publish regular or urgent notices.'],
  verification: ['STUDENT PROGRESS', 'Study Log Verification', 'Review and verify daily student submissions.'],
  'teacher-doubts': ['STUDENT SUPPORT', 'Doubt Inbox', 'Select a student and reply to their questions.']
};

const navigationByRole = {
  student: [
    ['home', 'Overview', 'fa-house'],
    ['profile', 'My Profile', 'fa-user'],
    ['notices', 'Notice Board', 'fa-bullhorn'],
    ['tracker', 'Daily Tracker', 'fa-chart-line'],
    ['chat', 'Class Chat', 'fa-comments'],
    ['doubts', 'Ask a Doubt', 'fa-circle-question']
  ],
  teacher: [
    ['teacher-home', 'Overview', 'fa-house'],
    ['teacher-notices', 'Announcements', 'fa-bullhorn'],
    ['verification', 'Study Logs', 'fa-clipboard-check'],
    ['teacher-doubts', 'Doubt Inbox', 'fa-inbox'],
    ['chat', 'Class Chat', 'fa-comments'],
    ['notices', 'Notice Board', 'fa-list']
  ],
  admin: [
    ['admin-home', 'Overview', 'fa-gauge-high'],
    ['admin-panel', 'Role Manager', 'fa-user-shield'],
    ['admin-chat', 'Chat Moderator', 'fa-shield-halved'],
    ['verification', 'Study Logs', 'fa-clipboard-check'],
    ['teacher-doubts', 'Doubt Inbox', 'fa-inbox'],
    ['teacher-notices', 'Announcements', 'fa-bullhorn']
  ]
};

const allowedRoutes = {
  student: ['home', 'profile', 'notices', 'tracker', 'chat', 'doubts'],
  teacher: ['teacher-home', 'teacher-notices', 'verification', 'teacher-doubts', 'chat', 'notices'],
  admin: ['admin-home', 'admin-panel', 'admin-chat', 'verification', 'teacher-doubts', 'teacher-notices']
};

export function showToast(message, type = 'info') {
  const element = $('toast');
  if (!element) return;

  element.textContent = message;
  element.className = `toast ${type}`;
  clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    element.classList.add('hidden');
  }, 4000);
}

export function setLoading(visible, message = 'Loading StudySpace...') {
  const screen = $('loadingScreen');
  if (!screen) return;
  $('loadingText').textContent = message;
  screen.classList.toggle('hidden', !visible);
}

function setAuthMode(mode) {
  const register = mode === 'register';

  $('loginModeBtn').className = register ? 'secondary-btn' : 'primary-btn';
  $('registerModeBtn').className = register ? 'primary-btn' : 'secondary-btn';

  $('authNameGroup').classList.toggle('hidden', !register);
  $('authName').required = register;

  $('authTitle').textContent = register ? 'Create your account' : 'Welcome back';
  $('authSubtitle').textContent = register
    ? 'Join your classroom in a few steps.'
    : 'Sign in to continue to your classroom.';

  $('authSubmit').textContent = register ? 'Create account' : 'Sign in';
  $('authPassword').autocomplete = register ? 'new-password' : 'current-password';
  $('authError').classList.add('hidden');

  $('authForm').dataset.mode = mode;
}

function getFriendlyError(error) {
  const messages = {
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'No account was found for this email.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/weak-password': 'Use a stronger password with at least 6 characters.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'PERMISSION_DENIED': 'Firebase denied this operation. Check your database rules.',
    'storage/unauthorized': 'Storage access denied. Check your storage rules.'
  };

  return messages[error?.code] || error?.message || 'Something went wrong. Please try again.';
}

function showAuthentication() {
  $('appShell').classList.add('hidden');
  $('authScreen').classList.remove('hidden');
}

function hideAuthentication() {
  $('authScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');
}

function renderNavigation() {
  const links = navigationByRole[currentRole] || navigationByRole.student;

  const createLink = ([page, label, icon]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sidebar-link ${window.currentPage === page ? 'active' : ''}`;
    button.dataset.page = page;
    button.innerHTML = `<i class="fa-solid ${icon}"></i><span>${escapeHTML(label)}</span>`;
    button.addEventListener('click', () => navigate(page));
    return button;
  };

  for (const navId of ['sidebarNav', 'mobileNav']) {
    const nav = $(navId);
    nav.replaceChildren();
    links.forEach(link => nav.appendChild(createLink(link)));
  }
}

function renderIdentity() {
  const name = currentProfile.displayName || 'New Student';
  const role = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
  const initial = name.trim().charAt(0).toUpperCase() || 'S';

  for (const id of ['headerName', 'sidebarName', 'mobileName']) {
    $(id).textContent = name;
  }

  for (const id of ['headerEmail', 'profileEmail']) {
    if ($(id)) $(id).textContent = id === 'profileEmail'
      ? (currentUser.email || '—')
      : (currentUser.email || '');
  }

  for (const id of ['sidebarRole', 'mobileRole']) {
    $(id).textContent = `${role} workspace`;
  }

  for (const id of ['sidebarAvatar', 'headerAvatar', 'mobileAvatar']) {
    $(id).textContent = initial;
  }

  $('footerYear').textContent = new Date().getFullYear();
}

export function navigate(page) {
  if (!currentUser || !(allowedRoutes[currentRole] || []).includes(page)) {
    showToast('You do not have permission to open that page.', 'error');
    return;
  }

  window.currentPage = page;

  document.querySelectorAll('.view').forEach(section => section.classList.add('hidden'));

  const target = $(`view-${page}`);
  if (target) target.classList.remove('hidden');

  const [eyebrow, title, description] = routeMetadata[page] || ['STUDYSPACE', 'Dashboard', ''];

  $('pageEyebrow').textContent = eyebrow;
  $('pageTitle').textContent = title;
  $('pageDescription').textContent = description;

  renderNavigation();
  closeMobileMenu();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  document.dispatchEvent(new CustomEvent('studyspace:route', {
    detail: { page, role: currentRole, uid: currentUser.uid }
  }));
}

function closeMobileMenu() {
  $('mobileSidebar').classList.add('hidden');
  $('mobileSidebarOverlay').classList.add('hidden');
}

function openMobileMenu() {
  $('mobileSidebar').classList.remove('hidden');
  $('mobileSidebarOverlay').classList.remove('hidden');
}

function detachProfileListener() {
  if (profileListener) {
    profileListener();
    profileListener = null;
  }
}

function detachSharedAnnouncementListener() {
  if (sharedAnnouncementListener) {
    sharedAnnouncementListener();
    sharedAnnouncementListener = null;
  }
}

function resetSession() {
  detachProfileListener();
  detachSharedAnnouncementListener();

  currentUser = null;
  currentRole = null;
  currentProfile = {};
  sharedAnnouncementValue = [];

  document.dispatchEvent(new CustomEvent('studyspace:logout'));
}

function bindSharedAnnouncements(generation) {
  detachSharedAnnouncementListener();

  sharedAnnouncementListener = onValue(ref(db, 'announcements'), snapshot => {
    if (generation !== authGeneration) return;

    sharedAnnouncementValue = Object.entries(snapshot.val() || {})
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    document.dispatchEvent(new CustomEvent('studyspace:announcements', {
      detail: sharedAnnouncementValue
    }));
  }, error => {
    console.error('Announcement listener failed:', error);
    showToast(getFriendlyError(error), 'error');
  });
}

export function getAnnouncements() {
  return [...sharedAnnouncementValue];
}

async function initializeAuthenticatedSession(user, generation) {
  currentUser = user;
  currentProfile = {};

  let profile = null;

  if (user.uid !== ADMIN_UID) {
    const snapshot = await get(ref(db, `users/${user.uid}`));
    profile = snapshot.val();

    if (!profile) {
      profile = {
        role: 'student',
        displayName: 'New Student',
        rollNumber: 0
      };

      await set(ref(db, `users/${user.uid}`), {
        ...profile,
        email: user.email || '',
        createdAt: Date.now()
      });
    }
  }

  if (generation !== authGeneration || auth.currentUser?.uid !== user.uid) return;

  if (user.uid === ADMIN_UID) {
    currentRole = 'admin';
    currentProfile = {
      ...(profile || {}),
      role: 'admin',
      displayName: profile?.displayName || 'Administrator',
      rollNumber: profile?.rollNumber ?? 0
    };
  } else {
    currentProfile = profile || {
      role: 'student',
      displayName: 'New Student',
      rollNumber: 0
    };

    currentRole = ['student', 'teacher'].includes(currentProfile.role)
      ? currentProfile.role
      : 'student';
  }

  renderIdentity();
  renderNavigation();
  hideAuthentication();

  bindSharedAnnouncements(generation);

  if (currentRole === 'student' && !studentModuleInitialized) {
    await initializeStudent();
    studentModuleInitialized = true;
  }

  if (currentRole === 'teacher' && !teacherModuleInitialized) {
    await initializeTeacher();
    teacherModuleInitialized = true;
  }

  if (currentRole === 'admin' && !adminModuleInitialized) {
    await initializeAdmin();
    adminModuleInitialized = true;
  }

  if (generation !== authGeneration || auth.currentUser?.uid !== user.uid) return;

  navigate({
    student: 'home',
    teacher: 'teacher-home',
    admin: 'admin-home'
  }[currentRole]);

  setLoading(false);
}

$('loginModeBtn').addEventListener('click', () => setAuthMode('login'));
$('registerModeBtn').addEventListener('click', () => setAuthMode('register'));

$('authForm').addEventListener('submit', async event => {
  event.preventDefault();

  const mode = $('authForm').dataset.mode || 'login';
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  const displayName = $('authName').value.trim();
  const button = $('authSubmit');

  $('authError').classList.add('hidden');

  if (mode === 'register' && !displayName) {
    $('authError').textContent = 'Please enter your display name.';
    $('authError').classList.remove('hidden');
    return;
  }

  button.disabled = true;
  button.textContent = mode === 'register' ? 'Creating account...' : 'Signing in...';

  try {
    if (mode === 'register') {
      const credential = await createUserWithEmailAndPassword(auth, email, password);

      await set(ref(db, `users/${credential.user.uid}`), {
        role: 'student',
        displayName: 'New Student',
        rollNumber: 0,
        email: credential.user.email || email,
        createdAt: Date.now()
      });

      if (displayName && displayName !== 'New Student') {
        await update(ref(db, `users/${credential.user.uid}`), {
          displayName: displayName.slice(0, 70)
        });
      }
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    console.error(error);
    $('authError').textContent = getFriendlyError(error);
    $('authError').classList.remove('hidden');
  } finally {
    button.disabled = false;
    button.textContent = mode === 'register' ? 'Create account' : 'Sign in';
  }
});

async function handleSignOut() {
  try {
    await signOut(auth);
  } catch (error) {
    showToast(getFriendlyError(error), 'error');
  }
}

$('logoutBtn').addEventListener('click', handleSignOut);
$('mobileLogoutBtn').addEventListener('click', handleSignOut);
$('mobileMenuBtn').addEventListener('click', openMobileMenu);
$('mobileMenuClose').addEventListener('click', closeMobileMenu);
$('mobileSidebarOverlay').addEventListener('click', closeMobileMenu);

document.addEventListener('click', event => {
  const button = event.target.closest('[data-goto]');
  if (button) navigate(button.dataset.goto);
});

onAuthStateChanged(auth, async user => {
  const generation = ++authGeneration;
  resetSession();

  if (!user) {
    showAuthentication();
    setLoading(false);
    return;
  }

  setLoading(true, 'Preparing your classroom...');

  try {
    await initializeAuthenticatedSession(user, generation);
  } catch (error) {
    console.error('Session initialization failed:', error);
    showToast(getFriendlyError(error), 'error');

    if (generation === authGeneration) {
      showAuthentication();
      setLoading(false);
    }
  }
});

window.addEventListener('offline', () => {
  showToast('You are offline. Some features may not work.', 'error');
});

window.addEventListener('online', () => {
  showToast('Connection restored.', 'success');
});

setAuthMode('login');
$('footerYear').textContent = new Date().getFullYear();
setLoading(true);
