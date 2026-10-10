// ============================================
// MATH CLASS PORTAL — APPLICATION
// Stage 1: Authentication foundation
// ============================================

import {
  auth,
  db,
  persistenceReady
} from "./firebase.js";

import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

import {
  ref,
  get,
  set,
  update
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

// ============================================
// ROLE CONFIGURATION
// ============================================

const TEACHER_UID = "YNdqDJRyZ1hFAtqrJeZJYScldfc2";

// Add approved administrator UIDs here.
const ADMIN_UIDS = [];

// ============================================
// DOM HELPERS
// ============================================

const $ = (id) => document.getElementById(id);

const authScreen = $("authScreen");
const dashboardScreen = $("dashboardScreen");
const authForm = $("authForm");

let authMode = "login";
let currentUser = null;
let currentProfile = null;
let busy = false;

// ============================================
// UI HELPERS
// ============================================

function showMessage(message, type = "error") {
  const box = $("authMessage");

  box.textContent = message;
  box.classList.remove("hidden", "error", "success");

  box.classList.add(type);
}

function clearMessage() {
  const box = $("authMessage");

  box.textContent = "";
  box.classList.add("hidden");
  box.classList.remove("error", "success");
}

function setBusy(state) {
  busy = state;

  const button = $("submitButton");

  button.disabled = state;
  button.style.opacity = state ? "0.6" : "1";

  $("submitText").textContent = state
    ? "Please wait..."
    : authMode === "login"
      ? "Sign In"
      : "Create Account";
}

function showLoginScreen() {
  authScreen.classList.remove("hidden");
  dashboardScreen.classList.add("hidden");
}

function showDashboardScreen() {
  authScreen.classList.add("hidden");
  dashboardScreen.classList.remove("hidden");
}

function getFriendlyError(error) {
  const messages = {
    "auth/email-already-in-use":
      "An account with this email already exists.",

    "auth/invalid-email":
      "Please enter a valid email address.",

    "auth/weak-password":
      "Your password is too weak. Use at least 6 characters.",

    "auth/invalid-credential":
      "The email or password is incorrect.",

    "auth/user-not-found":
      "No account was found for this email address.",

    "auth/wrong-password":
      "The email or password is incorrect.",

    "auth/too-many-requests":
      "Too many attempts. Please wait before trying again.",

    "auth/network-request-failed":
      "Network error. Check your internet connection.",

    "auth/operation-not-allowed":
      "Email/password authentication is not enabled in Firebase.",

    "auth/invalid-api-key":
      "The Firebase API key is invalid. Check firebase.js.",

    "PERMISSION_DENIED":
      "Firebase denied access. Check your Realtime Database Security Rules."
  };

  return messages[error.code] ||
    error.message ||
    "An unexpected error occurred.";
}

// ============================================
// ROLE DETECTION
// ============================================

function detectRole(uid) {
  if (uid === TEACHER_UID) {
    return "teacher";
  }

  if (ADMIN_UIDS.includes(uid)) {
    return "admin";
  }

  return "student";
}

// ============================================
// AUTHENTICATION TABS
// ============================================

function showAuthMode(mode) {
  authMode = mode;
  clearMessage();

  const registering = mode === "register";

  $("nameGroup").classList.toggle("hidden", !registering);

  $("loginTab").classList.toggle("active", !registering);
  $("registerTab").classList.toggle("active", registering);

  $("formTitle").textContent = registering
    ? "Create your account"
    : "Welcome back";

  $("formSubtitle").textContent = registering
    ? "Join your mathematics classroom."
    : "Sign in to continue learning.";

  $("password").autocomplete = registering
    ? "new-password"
    : "current-password";

  $("submitText").textContent = registering
    ? "Create Account"
    : "Sign In";
}

$("loginTab").addEventListener("click", () => {
  showAuthMode("login");
});

$("registerTab").addEventListener("click", () => {
  showAuthMode("register");
});

// ============================================
// CREATE ACCOUNT
// ============================================

async function registerAccount() {
  const displayName = $("displayName").value.trim();
  const email = $("email").value.trim();
  const password = $("password").value;

  if (displayName.length < 2) {
    throw new Error("Please enter a name with at least 2 characters.");
  }

  if (displayName.length > 50) {
    throw new Error("Your name must be 50 characters or fewer.");
  }

  if (password.length < 6) {
    throw new Error("Your password must contain at least 6 characters.");
  }

  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  const user = credential.user;

  // Update the Firebase Authentication display name.
  await updateProfile(user, {
    displayName
  });

  const role = detectRole(user.uid);

  const profile = {
    uid: user.uid,
    email: user.email || email,
    displayName,
    rollNumber: 0,
    role,
    createdAt: Date.now()
  };

  // Attempt profile creation separately.
  // A profile-write failure should not hide the signed-in app.
  try {
    await set(ref(db, `users/${user.uid}`), profile);
  } catch (error) {
    console.error("Profile creation failed:", error);

    showMessage(
      "Your account was created, but the profile could not be saved. " +
      "Check your Realtime Database Security Rules.",
      "error"
    );
  }

  return user;
}

// ============================================
// SIGN IN
// ============================================

async function loginAccount() {
  const email = $("email").value.trim();
  const password = $("password").value;

  const credential = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  return credential.user;
}

// ============================================
// AUTH FORM SUBMISSION
// ============================================

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (busy) return;

  clearMessage();
  setBusy(true);

  try {
    await persistenceReady;

    if (authMode === "register") {
      await registerAccount();
    } else {
      await loginAccount();
    }

    // Firebase's authentication listener will display the dashboard.
  } catch (error) {
    console.error("Authentication error:", error);

    showMessage(getFriendlyError(error), "error");
  } finally {
    setBusy(false);
  }
});

// ============================================
// PASSWORD RESET
// ============================================

$("forgotPassword").addEventListener("click", async () => {
  const email = $("email").value.trim();

  if (!email) {
    showMessage(
      "Enter your email address first, then select Forgot password.",
      "error"
    );

    $("email").focus();
    return;
  }

  clearMessage();

  try {
    await sendPasswordResetEmail(auth, email);

    showMessage(
      "If the account exists, a password-reset email has been sent.",
      "success"
    );
  } catch (error) {
    console.error("Password reset error:", error);

    showMessage(getFriendlyError(error), "error");
  }
});

// ============================================
// LOAD USER PROFILE
// ============================================

async function loadUserProfile(user) {
  const role = detectRole(user.uid);

  // Safe local fallback: the dashboard can appear immediately.
  const fallbackProfile = {
    uid: user.uid,
    email: user.email || "",
    displayName:
      role === "teacher"
        ? "Math Teacher"
        : user.displayName || "Student",
    rollNumber: 0,
    role
  };

  currentProfile = fallbackProfile;

  // Show the dashboard without waiting for the database.
  renderDashboard(user, fallbackProfile);

  try {
    const snapshot = await get(ref(db, `users/${user.uid}`));

    if (snapshot.exists()) {
      const databaseProfile = snapshot.val() || {};

      // Role is determined by trusted local configuration,
      // not by a role value supplied by the profile.
      currentProfile = {
        ...fallbackProfile,
        ...databaseProfile,
        uid: user.uid,
        email: user.email || databaseProfile.email || "",
        role
      };
    } else {
      // Create a missing profile.
      // Failure is reported, but does not block the dashboard.
      await set(ref(db, `users/${user.uid}`), fallbackProfile);

      currentProfile = fallbackProfile;
    }
  } catch (error) {
    console.error("Could not load Firebase profile:", error);

    // Keep the dashboard usable even if the database is unavailable.
    $("dashboardMessage").textContent =
      "Signed in successfully. Your profile could not be loaded from " +
      "the database, so some features may be unavailable.";
  }

  renderDashboard(user, currentProfile);
}

// ============================================
// RENDER DASHBOARD
// ============================================

function renderDashboard(user, profile) {
  const role = detectRole(user.uid);

  const displayName =
    role === "teacher"
      ? "Math Teacher"
      : profile.displayName || user.displayName || "Student";

  $("userName").textContent = displayName;
  $("userEmail").textContent = user.email || "No email available";

  $("userAvatar").textContent =
    displayName.trim().charAt(0).toUpperCase() || "S";

  $("userRole").textContent = role.toUpperCase();

  showDashboardScreen();
}

// ============================================
// SIGN OUT
// ============================================

$("logoutButton").addEventListener("click", async () => {
  try {
    await signOut(auth);

    currentUser = null;
    currentProfile = null;

    clearMessage();
    showLoginScreen();
  } catch (error) {
    console.error("Sign-out error:", error);

    $("dashboardMessage").textContent =
      "Sign-out failed. Please try again.";
  }
});

// ============================================
// AUTHENTICATION STATE
// ============================================

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    currentProfile = null;
    showLoginScreen();
    return;
  }

  // Display the dashboard immediately; profile retrieval follows.
  const fallbackProfile = {
    uid: user.uid,
    email: user.email || "",
    displayName:
      detectRole(user.uid) === "teacher"
        ? "Math Teacher"
        : user.displayName || "Student",
    rollNumber: 0,
    role: detectRole(user.uid)
  };

  renderDashboard(user, fallbackProfile);

  await loadUserProfile(user);
});

// ============================================
// INITIAL SCREEN
// ============================================

// Explicitly show the login screen while Firebase initialises.
// No database request is required to reveal it.
showLoginScreen();

console.log("Math Class Portal authentication module loaded.");
