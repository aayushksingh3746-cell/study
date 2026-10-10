// ============================================================
// MATH CLASS — VIRTUAL LEARNING PORTAL
// File: app.js
// Firebase SDK: 10.5.0 Modular
// ============================================================

import { auth, db } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

import {
  ref,
  get,
  set,
  update,
  onValue
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  profilePath: "users",
  loadingTimeout: 12000,
  allowedRoles: ["student", "teacher", "admin"],
  defaultRole: "student"
};

// ============================================================
// APPLICATION STATE
// ============================================================

const state = {
  user: null,
  profile: null,
  role: null,
  initialized: false,
  loading: false,
  online: navigator.onLine,
  currentPage: "dashboard",
  unsubscribeConnection: null,
  authGeneration: 0
};

// ============================================================
// DOM HELPERS
// ============================================================

const $ = (selector, root = document) =>
  root.querySelector(selector);

const $$ = (selector, root = document) =>
  [...root.querySelectorAll(selector)];

function findElement(...selectors) {
  for (const selector of selectors) {
    const element = $(selector);
    if (element) return element;
  }

  return null;
}

// ============================================================
// SAFE ASYNC OPERATIONS
// ============================================================

function withTimeout(promise, timeout = CONFIG.loadingTimeout) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("The request took too long. Please try again."));
      }, timeout);
    })
  ]);
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

// ============================================================
// LOADING SCREEN
// ============================================================

function showLoading(message = "Loading your classroom...") {
  state.loading = true;

  const loader = findElement(
    "#loadingScreen",
    "#globalLoader",
    "#appLoader",
    "[data-loading-screen]"
  );

  if (loader) {
    loader.hidden = false;
    loader.style.display = "flex";
    loader.setAttribute("aria-live", "polite");

    const text = findElement(
      "#loadingText",
      "#loaderText",
      "[data-loading-text]"
    );

    if (text) text.textContent = message;
  }

  document.body.classList.add("app-loading");
}

function hideLoading() {
  state.loading = false;

  const loader = findElement(
    "#loadingScreen",
    "#globalLoader",
    "#appLoader",
    "[data-loading-screen]"
  );

  if (loader) {
    loader.hidden = true;
    loader.style.display = "none";
  }

  document.body.classList.remove("app-loading");
}

// Always release the loader if initialization fails.
window.setTimeout(() => {
  if (state.loading) {
    hideLoading();

    if (!state.initialized) {
      showFatalError(
        "The classroom could not finish loading. Check your connection and refresh the page."
      );
    }
  }
}, CONFIG.loadingTimeout + 3000);

// ============================================================
// NOTIFICATIONS
// ============================================================

function ensureToastContainer() {
  let container = findElement(
    "#toastContainer",
    "#toast-container",
    "[data-toast-container]"
  );

  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "false");

    Object.assign(container.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      zIndex: "10000",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      maxWidth: "min(380px, calc(100vw - 32px))"
    });

    document.body.appendChild(container);
  }

  return container;
}

function toast(message, type = "info", duration = 3500) {
  const container = ensureToastContainer();
  const item = document.createElement("div");

  const styles = {
    success: {
      background: "#F0FDF4",
      color: "#166534",
      border: "#BBF7D0"
    },
    error: {
      background: "#FEF2F2",
      color: "#991B1B",
      border: "#FECACA"
    },
    warning: {
      background: "#FFFBEB",
      color: "#92400E",
      border: "#FDE68A"
    },
    info: {
      background: "#EFF6FF",
      color: "#1E40AF",
      border: "#BFDBFE"
    }
  };

  const palette = styles[type] || styles.info;

  Object.assign(item.style, {
    padding: "13px 16px",
    borderRadius: "10px",
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    boxShadow: "0 8px 24px rgba(15,23,42,.08)",
    fontSize: "14px",
    lineHeight: "1.5",
    fontWeight: "500",
    overflowWrap: "anywhere",
    opacity: "0",
    transform: "translateY(8px)",
    transition: "opacity 200ms ease, transform 200ms ease"
  });

  item.textContent = message;
  container.appendChild(item);

  requestAnimationFrame(() => {
    item.style.opacity = "1";
    item.style.transform = "translateY(0)";
  });

  window.setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(8px)";

    window.setTimeout(() => item.remove(), 250);
  }, duration);
}

// ============================================================
// ERROR HANDLING
// ============================================================

function readableError(error) {
  const code = error?.code || "";

  const messages = {
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/user-not-found": "No account was found with this email.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password": "Your password must be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your internet connection.",
    "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase.",
    "auth/invalid-api-key": "Firebase configuration is invalid.",
    "PERMISSION_DENIED": "Access denied by Firebase security rules."
  };

  return messages[code] ||
    error?.message ||
    "Something went wrong. Please try again.";
}

function showFatalError(message) {
  let panel = findElement("#fatalError", "[data-fatal-error]");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "fatalError";

    Object.assign(panel.style, {
      maxWidth: "520px",
      margin: "40px auto",
      padding: "24px",
      borderRadius: "12px",
      border: "1px solid #FECACA",
      background: "#FFFFFF",
      color: "#111827",
      textAlign: "center"
    });

    document.body.appendChild(panel);
  }

  panel.replaceChildren();

  const heading = document.createElement("h2");
  heading.textContent = "Unable to load classroom";

  const description = document.createElement("p");
  description.textContent = message;

  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Try again";

  Object.assign(retry.style, {
    border: "0",
    borderRadius: "8px",
    padding: "12px 18px",
    background: "#4F46E5",
    color: "#FFFFFF",
    cursor: "pointer"
  });

  retry.addEventListener("click", () => location.reload());

  panel.append(heading, description, retry);
  panel.hidden = false;
}

// ============================================================
// CONNECTION STATUS
// ============================================================

function setupConnectionMonitor() {
  const banner = ensureConnectionBanner();

  function updateConnectionStatus(online) {
    state.online = online;

    banner.hidden = online;
    banner.textContent = online
      ? ""
      : "Connection lost. Reconnecting to Firebase...";

    document.body.classList.toggle("offline", !online);

    window.dispatchEvent(new CustomEvent("mathclass:connection", {
      detail: { online }
    }));
  }

  window.addEventListener("online", () => {
    updateConnectionStatus(true);
    toast("Connection restored.", "success");
  });

  window.addEventListener("offline", () => {
    updateConnectionStatus(false);
    toast("You are offline. Changes may not be saved.", "warning");
  });

  updateConnectionStatus(navigator.onLine);
}

function ensureConnectionBanner() {
  let banner = findElement(
    "#connectionBanner",
    "[data-connection-banner]"
  );

  if (!banner) {
    banner = document.createElement("div");
    banner.id = "connectionBanner";

    Object.assign(banner.style, {
      position: "fixed",
      top: "0",
      left: "0",
      right: "0",
      zIndex: "9999",
      padding: "10px 16px",
      textAlign: "center",
      fontSize: "13px",
      background: "#FEF3C7",
      color: "#92400E"
    });

    document.body.prepend(banner);
  }

  banner.hidden = true;
  return banner;
}

// ============================================================
// USER PROFILE
// ============================================================

async function getUserProfile(user) {
  const snapshot = await withTimeout(
    get(ref(db, `${CONFIG.profilePath}/${user.uid}`))
  );

  if (snapshot.exists()) {
    return snapshot.val();
  }

  // Existing account without a profile:
  // create a basic student profile.
  const profile = {
    uid: user.uid,
    name: user.displayName || "Student",
    email: user.email || "",
    role: CONFIG.defaultRole,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await withTimeout(
    set(ref(db, `${CONFIG.profilePath}/${user.uid}`), profile)
  );

  return profile;
}

function normalizeRole(profile) {
  const role = String(profile?.role || CONFIG.defaultRole)
    .trim()
    .toLowerCase();

  return CONFIG.allowedRoles.includes(role)
    ? role
    : CONFIG.defaultRole;
}

// ============================================================
// AUTHENTICATION FORM HELPERS
// ============================================================

function setFormBusy(form, busy) {
  if (!form) return;

  form.setAttribute("aria-busy", String(busy));

  $$('button[type="submit"], input[type="submit"]', form)
    .forEach(button => {
      if (busy) {
        if (!button.dataset.originalText) {
          button.dataset.originalText =
            button.textContent || button.value || "Submit";
        }

        button.disabled = true;

        if (button.tagName === "INPUT") {
          button.value = "Please wait...";
        } else {
          button.textContent = "Please wait...";
        }
      } else {
        button.disabled = false;

        const original = button.dataset.originalText;

        if (original) {
          if (button.tagName === "INPUT") {
            button.value = original;
          } else {
            button.textContent = original;
          }
        }
      }
    });
}

function getField(form, names) {
  for (const name of names) {
    const field =
      form.querySelector(`[name="${name}"]`) ||
      form.querySelector(`#${name}`);

    if (field) return field;
  }

  return null;
}

function getFormValue(form, names) {
  return String(getField(form, names)?.value || "").trim();
}

// ============================================================
// REGISTER
// ============================================================

async function handleRegister(event) {
  event.preventDefault();

  const form = event.currentTarget;

  const name = getFormValue(form, [
    "name",
    "fullName",
    "displayName",
    "studentName"
  ]);

  const email = getFormValue(form, ["email"]);
  const password = getField(form, ["password"])?.value || "";
  const confirmPassword =
    getField(form, ["confirmPassword", "passwordConfirm"])?.value;

  if (!email || !password) {
    toast("Please enter your email and password.", "warning");
    return;
  }

  if (password.length < 6) {
    toast("Password must contain at least 6 characters.", "warning");
    return;
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    toast("Your passwords do not match.", "warning");
    return;
  }

  setFormBusy(form, true);

  try {
    const credential = await withTimeout(
      createUserWithEmailAndPassword(auth, email, password)
    );

    if (name) {
      await updateProfile(credential.user, {
        displayName: name
      });
    }

    const profile = {
      uid: credential.user.uid,
      name: name || "Student",
      email: credential.user.email || email,
      role: CONFIG.defaultRole,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await withTimeout(
      set(ref(db, `${CONFIG.profilePath}/${credential.user.uid}`), profile)
    );

    toast("Your account has been created successfully.", "success");

    window.dispatchEvent(new CustomEvent("mathclass:registered", {
      detail: {
        uid: credential.user.uid,
        profile
      }
    }));

  } catch (error) {
    console.error("[Math Class] Registration failed:", error);
    toast(readableError(error), "error");
  } finally {
    setFormBusy(form, false);
  }
}

// ============================================================
// LOGIN
// ============================================================

async function handleLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const email = getFormValue(form, ["email"]);
  const password = getField(form, ["password"])?.value || "";

  if (!email || !password) {
    toast("Enter your email and password.", "warning");
    return;
  }

  setFormBusy(form, true);

  try {
    await withTimeout(
      signInWithEmailAndPassword(auth, email, password)
    );

    toast("Welcome back!", "success");

  } catch (error) {
    console.error("[Math Class] Login failed:", error);
    toast(readableError(error), "error");
  } finally {
    setFormBusy(form, false);
  }
}

// ============================================================
// PASSWORD RESET
// ============================================================

async function handlePasswordReset(event) {
  event.preventDefault();

  const emailField = findElement(
    "#resetEmail",
    "#loginEmail",
    'input[name="email"]',
    'input[type="email"]'
  );

  const email = emailField?.value?.trim();

  if (!email) {
    toast("Enter your email address first.", "warning");
    emailField?.focus();
    return;
  }

  try {
    await withTimeout(sendPasswordResetEmail(auth, email));
    toast("If an account exists for that email, a reset link has been sent.", "success");
  } catch (error) {
    console.error("[Math Class] Password reset failed:", error);
    toast(readableError(error), "error");
  }
}

// ============================================================
// AUTHENTICATION EVENT BINDINGS
// ============================================================

function bindAuthenticationForms() {
  const loginForms = $$(
    "#loginForm, [data-auth-form='login'], form[data-form='login']"
  );

  const registerForms = $$(
    "#registerForm, [data-auth-form='register'], form[data-form='register']"
  );

  loginForms.forEach(form => {
    form.addEventListener("submit", handleLogin);
  });

  registerForms.forEach(form => {
    form.addEventListener("submit", handleRegister);
  });

  $$(
    "#forgotPasswordBtn, [data-action='forgot-password']"
  ).forEach(button => {
    button.addEventListener("click", handlePasswordReset);
  });

  $$(
    "#logoutBtn, #signOutBtn, [data-action='logout']"
  ).forEach(button => {
    button.addEventListener("click", async () => {
      try {
        await signOut(auth);
        toast("You have been signed out.", "success");
      } catch (error) {
        toast(readableError(error), "error");
      }
    });
  });
}

// ============================================================
// VIEW MANAGEMENT
// ============================================================

function showAuthView() {
  const authView = findElement(
    "#authView",
    "#authScreen",
    "#authentication",
    "[data-view='auth']"
  );

  const appView = findElement(
    "#appView",
    "#dashboardView",
    "#application",
    "[data-view='app']"
  );

  if (authView) {
    authView.hidden = false;
    authView.style.display = "";
  }

  if (appView) {
    appView.hidden = true;
    appView.style.display = "none";
  }

  document.body.classList.add("unauthenticated");
  document.body.classList.remove("authenticated");
}

function showApplicationView() {
  const authView = findElement(
    "#authView",
    "#authScreen",
    "#authentication",
    "[data-view='auth']"
  );

  const appView = findElement(
    "#appView",
    "#dashboardView",
    "#application",
    "[data-view='app']"
  );

  if (authView) {
    authView.hidden = true;
    authView.style.display = "none";
  }

  if (appView) {
    appView.hidden = false;
    appView.style.display = "";
  }

  document.body.classList.remove("unauthenticated");
  document.body.classList.add("authenticated");
}

// ============================================================
// ROLE-BASED NAVIGATION
// ============================================================

function getAvailablePages(role) {
  const common = [
    "dashboard",
    "announcements",
    "profile"
  ];

  const studentPages = [
    "tracker",
    "history",
    "chat",
    "doubts"
  ];

  const teacherPages = [
    "action-center",
    "verification",
    "doubts",
    "student-insights"
  ];

  const adminPages = [
    "system-overview",
    "role-manager",
    "moderation",
    "system-status"
  ];

  if (role === "admin") {
    return [...common, ...adminPages];
  }

  if (role === "teacher") {
    return [...common, ...teacherPages];
  }

  return [...common, ...studentPages];
}

function canAccessPage(page, role) {
  return getAvailablePages(role).includes(page);
}

function updateRoleVisibility(role) {
  $$("[data-role-only]").forEach(element => {
    const roles = element.dataset.roleOnly
      .split(",")
      .map(value => value.trim().toLowerCase());

    element.hidden = !roles.includes(role);
  });

  $$("[data-role-hide]").forEach(element => {
    const roles = element.dataset.roleHide
      .split(",")
      .map(value => value.trim().toLowerCase());

    element.hidden = roles.includes(role);
  });

  $$("[data-role-label]").forEach(element => {
    element.textContent =
      role.charAt(0).toUpperCase() + role.slice(1);
  });
}

// ============================================================
// PAGE ROUTING
// ============================================================

function showPage(page) {
  if (!state.user || !state.role) {
    showAuthView();
    return;
  }

  if (!canAccessPage(page, state.role)) {
    toast("You do not have permission to open that page.", "error");
    page = "dashboard";
  }

  state.currentPage = page;

  $$("[data-page]").forEach(section => {
    const active = section.dataset.page === page;

    section.hidden = !active;
    section.classList.toggle("active", active);
    section.setAttribute("aria-hidden", String(!active));
  });

  $$("[data-route]").forEach(link => {
    const active = link.dataset.route === page;

    link.classList.toggle("active", active);

    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  const title = findElement(
    "#pageTitle",
    "[data-page-title]"
  );

  if (title) {
    const label = $$("[data-route]")
      .find(link => link.dataset.route === page);

    title.textContent = label?.textContent?.trim() ||
      page.replaceAll("-", " ").replace(/\b\w/g, char =>
        char.toUpperCase()
      );
  }

  window.dispatchEvent(new CustomEvent("mathclass:pagechange", {
    detail: {
      page,
      role: state.role,
      user: state.user
    }
  }));

  closeNavigationDrawer();
}

function bindNavigation() {
  document.addEventListener("click", event => {
    const link = event.target.closest("[data-route]");

    if (!link) return;

    event.preventDefault();

    const page = link.dataset.route;

    if (page) showPage(page);
  });

  $$(
    "#menuToggle, #sidebarToggle, [data-action='toggle-navigation']"
  ).forEach(button => {
    button.addEventListener("click", toggleNavigationDrawer);
  });

  $$(
    "#closeSidebar, [data-action='close-navigation']"
  ).forEach(button => {
    button.addEventListener("click", closeNavigationDrawer);
  });
}

function toggleNavigationDrawer() {
  document.body.classList.toggle("drawer-open");

  const drawer = findElement(
    "#sidebar",
    "#appSidebar",
    "[data-navigation-drawer]"
  );

  const open = document.body.classList.contains("drawer-open");

  drawer?.setAttribute("aria-expanded", String(open));
}

function closeNavigationDrawer() {
  document.body.classList.remove("drawer-open");

  const drawer = findElement(
    "#sidebar",
    "#appSidebar",
    "[data-navigation-drawer]"
  );

  drawer?.setAttribute("aria-expanded", "false");
}

// ============================================================
// USER PROFILE DISPLAY
// ============================================================

function updateUserInterface(user, profile, role) {
  const displayName =
    profile?.name ||
    user.displayName ||
    user.email?.split("@")[0] ||
    "Student";

  const email = profile?.email || user.email || "";

  $$(
    "#userName, #profileName, [data-user-name]"
  ).forEach(element => {
    element.textContent = displayName;
  });

  $$(
    "#userEmail, #profileEmail, [data-user-email]"
  ).forEach(element => {
    element.textContent = email;
  });

  $$(
    "#userAvatar, #profileAvatar, [data-user-avatar]"
  ).forEach(element => {
    element.textContent = displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0])
      .join("")
      .toUpperCase();
  });

  updateRoleVisibility(role);
}

// ============================================================
// MODULE INITIALIZATION
// ============================================================

async function initializeRoleModule(role) {
  const modulePaths = {
    student: "./student.js",
    teacher: "./teacher.js",
    admin: "./admin.js"
  };

  const path = modulePaths[role];

  if (!path) return;

  try {
    const module = await import(path);

    if (typeof module.init === "function") {
      await module.init({
        auth,
        db,
        user: state.user,
        profile: state.profile,
        role,
        toast,
        showPage,
        getState: () => ({ ...state })
      });
    }

    window.dispatchEvent(new CustomEvent("mathclass:module-ready", {
      detail: { role }
    }));

  } catch (error) {
    // A role module may not exist until the next development phase.
    console.warn(`[Math Class] ${role} module is not ready yet:`, error);

    window.dispatchEvent(new CustomEvent("mathclass:module-error", {
      detail: {
        role,
        message: error.message
      }
    }));
  }
}

// ============================================================
// AUTHENTICATION STATE
// ============================================================

async function handleAuthState(user) {
  const generation = ++state.authGeneration;

  showLoading(user ? "Loading your classroom..." : "Preparing sign in...");

  try {
    if (!user) {
      state.user = null;
      state.profile = null;
      state.role = null;

      showAuthView();

      state.initialized = true;
      hideLoading();

      window.dispatchEvent(new CustomEvent("mathclass:auth-ready", {
        detail: { user: null, role: null }
      }));

      return;
    }

    state.user = user;

    const profile = await getUserProfile(user);

    // Ignore stale requests when the auth state changes mid-request.
    if (generation !== state.authGeneration) return;

    state.profile = profile;
    state.role = normalizeRole(profile);

    showApplicationView();

    updateUserInterface(user, profile, state.role);

    await initializeRoleModule(state.role);

    if (generation !== state.authGeneration) return;

    state.initialized = true;

    showPage(
      canAccessPage(state.currentPage, state.role)
        ? state.currentPage
        : "dashboard"
    );

    window.dispatchEvent(new CustomEvent("mathclass:auth-ready", {
      detail: {
        user,
        profile: state.profile,
        role: state.role
      }
    }));

  } catch (error) {
    console.error("[Math Class] Application initialization failed:", error);

    if (generation !== state.authGeneration) return;

    state.initialized = true;

    if (user) {
      showApplicationView();

      toast(
        "Your account is signed in, but your profile could not be loaded. Check Firebase permissions and try again.",
        "error",
        6000
      );

      showFatalError(
        "We couldn't load your account profile. Verify your Realtime Database rules and internet connection, then refresh."
      );
    } else {
      showAuthView();
      toast(readableError(error), "error");
    }

  } finally {
    if (generation === state.authGeneration) {
      hideLoading();
    }
  }
}

// ============================================================
// GLOBAL ERROR SAFETY
// ============================================================

window.addEventListener("unhandledrejection", event => {
  console.error("[Math Class] Unhandled promise rejection:", event.reason);

  // Prevent silent failures from becoming invisible to the user.
  if (event.reason) {
    toast(
      "An operation failed. Please try again.",
      "error"
    );
  }
});

window.addEventListener("error", event => {
  console.error("[Math Class] JavaScript error:", event.error);
});

// ============================================================
// PUBLIC APPLICATION API
// ============================================================

window.MathClass = {
  toast,
  showLoading,
  hideLoading,
  showPage,
  signOut: () => signOut(auth),

  getState() {
    return {
      user: state.user,
      profile: state.profile,
      role: state.role,
      online: state.online,
      initialized: state.initialized,
      currentPage: state.currentPage
    };
  },

  refreshProfile: async () => {
    if (!auth.currentUser) {
      throw new Error("No user is signed in.");
    }

    const profile = await getUserProfile(auth.currentUser);

    state.profile = profile;
    state.role = normalizeRole(profile);

    updateUserInterface(auth.currentUser, profile, state.role);

    return profile;
  }
};

// ============================================================
// START APPLICATION
// ============================================================

function startApplication() {
  showLoading("Preparing your classroom...");

  setupConnectionMonitor();
  bindAuthenticationForms();
  bindNavigation();

  onAuthStateChanged(auth, handleAuthState, error => {
    console.error("[Math Class] Authentication listener failed:", error);

    state.initialized = true;
    hideLoading();

    showFatalError(
      "Authentication could not be initialized. Check your Firebase configuration and enabled sign-in methods."
    );
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApplication, {
    once: true
  });
} else {
  startApplication();
}
