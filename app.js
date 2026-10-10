// ============================================================
// MATH CLASS — VIRTUAL LEARNING PORTAL
// File: app.js
// Firebase Modular SDK 10.5.0
// ============================================================

import {
  auth,
  db,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  getIdTokenResult
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

import {
  ref,
  get,
  set,
  onValue
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = Object.freeze({
  profilePath: "users",
  loadingTimeout: 15000,
  allowedRoles: ["student", "teacher", "admin"],
  defaultRole: "student",
  maxNameLength: 100,
  minPasswordLength: 8
});

// ============================================================
// APPLICATION STATE
// ============================================================

const state = {
  user: null,
  profile: null,
  role: null,
  initialized: false,
  online: navigator.onLine,
  currentPage: "dashboard",
  authGeneration: 0,
  roleModule: null,
  roleModuleName: null,
  connectionUnsubscribe: null,
  startupError: null
};

let authListenerStarted = false;
let navigationBound = false;
let authFormsBound = false;
let connectionMonitorBound = false;

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

    if (element) {
      return element;
    }
  }

  return null;
}

// ============================================================
// ASYNC TIMEOUT
// ============================================================

/**
 * Stop waiting for an operation after a timeout.
 *
 * Important: Promise.race does not cancel the underlying
 * Firebase request. A timeout must never be treated as success.
 */
function withTimeout(
  promise,
  timeout = CONFIG.loadingTimeout,
  message = "The request took too long. Check your connection and try again."
) {
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      const error = new Error(message);
      error.code = "app/timeout";
      reject(error);
    }, timeout);
  });

  return Promise.race([
    Promise.resolve(promise),
    timeoutPromise
  ]).finally(() => {
    window.clearTimeout(timer);
  });
}

// ============================================================
// LOADING SCREEN
// ============================================================

function showLoading(message = "Preparing your classroom...") {
  const loader = $("#appLoader");
  const messageElement = $("#loaderMessage");
  const recovery = $("#loaderRecovery");

  if (loader) {
    loader.hidden = false;
    loader.style.display = "flex";
  }

  if (messageElement) {
    messageElement.textContent = message;
    messageElement.hidden = false;
  }

  if (recovery) {
    recovery.hidden = true;
  }
}

function hideLoading() {
  const loader = $("#appLoader");

  if (loader) {
    loader.hidden = true;
    loader.style.display = "none";
  }
}

function markApplicationStarted() {
  state.initialized = true;

  hideLoading();

  if (window.MathClassBoot?.markStarted) {
    window.MathClassBoot.markStarted();
  }
}

function showStartupError(message) {
  state.startupError = message;

  const loader = $("#appLoader");
  const messageElement = $("#loaderMessage");
  const recovery = $("#loaderRecovery");
  const errorElement = $("#loaderErrorMessage");

  if (loader) {
    loader.hidden = false;
    loader.style.display = "flex";
  }

  if (messageElement) {
    messageElement.hidden = true;
  }

  if (recovery) {
    recovery.hidden = false;
  }

  if (errorElement) {
    errorElement.textContent = message;
  }

  if (window.MathClassBoot?.showRecovery) {
    window.MathClassBoot.showRecovery(message);
  }
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function ensureToastContainer() {
  let container = $("#toastContainer");

  if (container) {
    return container;
  }

  container = document.createElement("div");
  container.id = "toastContainer";

  Object.assign(container.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "100000",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxWidth: "min(380px, calc(100vw - 32px))"
  });

  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-atomic", "false");

  document.body.appendChild(container);

  return container;
}

function toast(message, type = "info", duration = 3500) {
  const container = ensureToastContainer();
  const item = document.createElement("div");

  const palettes = {
    success: ["#F0FDF4", "#166534", "#BBF7D0"],
    error: ["#FEF2F2", "#991B1B", "#FECACA"],
    warning: ["#FFFBEB", "#92400E", "#FDE68A"],
    info: ["#EFF6FF", "#1E40AF", "#BFDBFE"]
  };

  const palette = palettes[type] || palettes.info;

  Object.assign(item.style, {
    padding: "13px 16px",
    borderRadius: "12px",
    border: `1px solid ${palette[2]}`,
    background: palette[0],
    color: palette[1],
    boxShadow: "0 8px 25px rgba(15,23,42,.10)",
    fontSize: "14px",
    lineHeight: "1.5",
    overflowWrap: "anywhere",
    opacity: "0",
    transform: "translateY(8px)",
    transition: "opacity .2s ease, transform .2s ease"
  });

  // Never interpret user-generated messages as HTML.
  item.textContent = String(message);

  container.appendChild(item);

  requestAnimationFrame(() => {
    item.style.opacity = "1";
    item.style.transform = "translateY(0)";
  });

  const safeDuration = Math.max(
    1000,
    Math.min(Number(duration) || 3500, 15000)
  );

  window.setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(8px)";

    window.setTimeout(() => {
      item.remove();

      if (
        container.isConnected &&
        container.childElementCount === 0
      ) {
        container.remove();
      }
    }, 250);
  }, safeDuration);
}

// ============================================================
// ERROR MESSAGES
// ============================================================

function readableError(error) {
  const code = String(error?.code || "");

  const messages = {
    "auth/invalid-email":
      "Please enter a valid email address.",

    "auth/user-not-found":
      "No account was found with those credentials.",

    "auth/wrong-password":
      "Incorrect email or password.",

    "auth/invalid-credential":
      "Incorrect email or password.",

    "auth/invalid-login-credentials":
      "Incorrect email or password.",

    "auth/email-already-in-use":
      "An account with this email already exists.",

    "auth/weak-password":
      "Your password must meet the minimum password requirements.",

    "auth/too-many-requests":
      "Too many attempts. Please try again later.",

    "auth/network-request-failed":
      "Network error. Check your internet connection.",

    "auth/operation-not-allowed":
      "Email and password sign-in is not enabled in Firebase.",

    "auth/invalid-api-key":
      "The Firebase API key is invalid.",

    "auth/unauthorized-domain":
      "This website domain is not authorized in Firebase.",

    "auth/requires-recent-login":
      "For security, sign in again before performing this action.",

    "auth/user-disabled":
      "This account has been disabled.",

    "auth/account-exists-with-different-credential":
      "An account already exists with a different sign-in method.",

    "app/timeout":
      "The request timed out. Check your connection and try again.",

    "app/profile-missing":
      "Your account profile is missing. Contact the administrator.",

    "app/invalid-role":
      "This account has an invalid role configuration.",

    "app/account-suspended":
      "This account has been suspended. Contact the administrator.",

    "PERMISSION_DENIED":
      "Firebase denied access. Check your database security rules.",

    "permission_denied":
      "Firebase denied access. Check your database security rules."
  };

  if (messages[code]) {
    return messages[code];
  }

  if (
    code.startsWith("auth/") &&
    ![
      "auth/invalid-email",
      "auth/user-not-found",
      "auth/wrong-password",
      "auth/invalid-credential"
    ].includes(code)
  ) {
    return "Authentication failed. Please try again or check your Firebase configuration.";
  }

  if (code === "PERMISSION_DENIED") {
    return messages.PERMISSION_DENIED;
  }

  // Do not expose internal stack traces to the user.
  if (!error?.code) {
    console.error("[Math Class] Unclassified error:", error);
  }

  return "Something went wrong. Please try again.";
}

// ============================================================
// AUTHENTICATION VIEWS
// ============================================================

function showAuthPanel(panelName = "login") {
  const panels = {
    login: $("#loginPanel"),
    register: $("#registerPanel"),
    forgot: $("#forgotPasswordPanel")
  };

  Object.entries(panels).forEach(([name, panel]) => {
    if (panel) {
      panel.hidden = name !== panelName;
    }
  });

  const authView = $("#authView");
  const appShell = $("#appShell");

  if (authView) {
    authView.hidden = false;
    authView.style.display = "";
  }

  if (appShell) {
    appShell.hidden = true;
  }

  document.body.classList.add("unauthenticated");
  document.body.classList.remove("authenticated");
}

function showAuthView() {
  showAuthPanel("login");

  const authView = $("#authView");
  const appShell = $("#appShell");

  if (authView) {
    authView.hidden = false;
    authView.style.display = "";
  }

  if (appShell) {
    appShell.hidden = true;
    appShell.style.display = "none";
  }

  closeNavigationDrawer();
}

function showApplicationView() {
  const authView = $("#authView");
  const appShell = $("#appShell");

  if (authView) {
    authView.hidden = true;
    authView.style.display = "none";
  }

  if (appShell) {
    appShell.hidden = false;
    appShell.style.display = "";
  }

  document.body.classList.remove("unauthenticated");
  document.body.classList.add("authenticated");
}

// ============================================================
// FORM HELPERS
// ============================================================

function fieldValue(form, selectors) {
  for (const selector of selectors) {
    const field = form?.querySelector(selector);

    if (field) {
      return String(field.value || "").trim();
    }
  }

  return "";
}

function setFormBusy(form, busy) {
  if (!form) {
    return;
  }

  form.setAttribute("aria-busy", String(busy));

  $$('button[type="submit"]', form).forEach(button => {
    if (busy) {
      if (!button.dataset.originalHTML) {
        button.dataset.originalHTML = button.innerHTML;
      }

      button.disabled = true;

      const label = $(".button-label", button);

      if (label) {
        label.textContent = "Please wait...";
      } else {
        button.textContent = "Please wait...";
      }
    } else {
      button.disabled = false;

      if (button.dataset.originalHTML) {
        button.innerHTML = button.dataset.originalHTML;
      }
    }
  });
}

function showFormMessage(selector, message, type = "error") {
  const element = $(selector);

  if (!element) {
    toast(message, type);
    return;
  }

  element.textContent = String(message);
  element.hidden = false;

  element.classList.toggle(
    "form-message-error",
    type === "error"
  );

  element.classList.toggle(
    "form-message-success",
    type === "success"
  );
}

function clearFormMessage(selector) {
  const element = $(selector);

  if (element) {
    element.textContent = "";
    element.hidden = true;

    element.classList.remove(
      "form-message-error",
      "form-message-success"
    );
  }
}

// ============================================================
// PROFILE HELPERS
// ============================================================

function createAppError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Load a user profile.
 *
 * The database rules must protect the role field against
 * unauthorized writes. Client-side role checks are not a
 * substitute for Firebase authorization rules.
 */
async function getUserProfile(user) {
  const profileRef = ref(
    db,
    `${CONFIG.profilePath}/${user.uid}`
  );

  const snapshot = await withTimeout(
    get(profileRef)
  );

  if (!snapshot.exists()) {
    throw createAppError(
      "app/profile-missing",
      "No profile exists for this account."
    );
  }

  const existing = snapshot.val();

  if (
    !existing ||
    typeof existing !== "object" ||
    Array.isArray(existing)
  ) {
    throw createAppError(
      "app/profile-missing",
      "The account profile is invalid."
    );
  }

  const role = String(
    existing.role || CONFIG.defaultRole
  ).toLowerCase();

  if (!CONFIG.allowedRoles.includes(role)) {
    throw createAppError(
      "app/invalid-role",
      "The account role is invalid."
    );
  }

  if (
    existing.status === "suspended" ||
    existing.status === "disabled" ||
    existing.disabled === true ||
    existing.suspended === true
  ) {
    throw createAppError(
      "app/account-suspended",
      "This account is not currently active."
    );
  }

  // If custom claims are configured for the project, use them
  // as an additional verification of privileged roles.
  //
  // This does not automatically assign claims. Claims must be
  // set by a trusted Firebase Admin SDK environment.
  if (role === "admin" || role === "teacher") {
    try {
      const tokenResult = await withTimeout(
        getIdTokenResult(user)
      );

      const claims = tokenResult.claims || {};

      const claimAuthorizesRole =
        role === "admin"
          ? claims.admin === true
          : claims.teacher === true || claims.admin === true;

      if (!claimAuthorizesRole) {
        throw createAppError(
          "app/invalid-role",
          "This account does not have the required trusted role claim."
        );
      }
    } catch (error) {
      if (error?.code === "app/invalid-role") {
        throw error;
      }

      throw createAppError(
        "app/invalid-role",
        "The privileged account could not be verified."
      );
    }
  }

  const name =
    String(
      existing.name ||
      existing.displayName ||
      user.displayName ||
      user.email?.split("@")[0] ||
      "Student"
    ).trim().slice(0, CONFIG.maxNameLength) || "Student";

  return {
    ...existing,
    uid: user.uid,
    name,
    displayName: String(
      existing.displayName ||
      existing.name ||
      user.displayName ||
      name
    ).slice(0, CONFIG.maxNameLength),
    email: existing.email || user.email || "",
    role,
    status: existing.status || "active"
  };
}

// ============================================================
// REGISTRATION
// ============================================================

async function handleRegister(event) {
  event.preventDefault();

  const form = event.currentTarget;

  if (form.dataset.submitting === "true") {
    return;
  }

  clearFormMessage("#registerFormMessage");

  const name = fieldValue(form, [
    '[name="displayName"]',
    "#registerName",
    '[name="name"]'
  ]);

  const email = fieldValue(form, [
    '[name="email"]',
    "#registerEmail"
  ]).toLowerCase();

  const password = fieldValue(form, [
    '[name="password"]',
    "#registerPassword"
  ]);

  const termsAccepted = $("#acceptTerms")?.checked;

  if (
    name.length < 2 ||
    name.length > CONFIG.maxNameLength
  ) {
    showFormMessage(
      "#registerFormMessage",
      `Your name must contain between 2 and ${CONFIG.maxNameLength} characters.`
    );
    return;
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    showFormMessage(
      "#registerFormMessage",
      "Please enter a valid email address."
    );
    return;
  }

  if (password.length < CONFIG.minPasswordLength) {
    showFormMessage(
      "#registerFormMessage",
      `Your password must contain at least ${CONFIG.minPasswordLength} characters.`
    );
    return;
  }

  if (!termsAccepted) {
    showFormMessage(
      "#registerFormMessage",
      "Please accept the classroom guidelines."
    );
    return;
  }

  form.dataset.submitting = "true";
  setFormBusy(form, true);

  let createdUser = null;

  try {
    const credential = await withTimeout(
      createUserWithEmailAndPassword(
        auth,
        email,
        password
      )
    );

    createdUser = credential.user;

    await withTimeout(
      updateProfile(createdUser, {
        displayName: name
      })
    );

    const timestamp = Date.now();

    const profile = {
      uid: createdUser.uid,
      name,
      displayName: name,
      email: createdUser.email || email,
      role: "student",
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // If this write fails, do not pretend registration is complete.
    await withTimeout(
      set(
        ref(db, `${CONFIG.profilePath}/${createdUser.uid}`),
        profile
      )
    );

    toast(
      "Your account has been created successfully.",
      "success"
    );

    window.dispatchEvent(
      new CustomEvent("mathclass:registered", {
        detail: {
          uid: createdUser.uid,
          profile
        }
      })
    );

  } catch (error) {
    console.error(
      "[Math Class] Registration failed:",
      error?.code || "unknown-error"
    );

    if (createdUser) {
      showFormMessage(
        "#registerFormMessage",
        "Your authentication account was created, but its profile could not be saved. Do not register again immediately. Check your connection and contact the administrator if the problem continues."
      );
    } else {
      showFormMessage(
        "#registerFormMessage",
        readableError(error)
      );
    }
  } finally {
    form.dataset.submitting = "false";
    setFormBusy(form, false);
  }
}

// ============================================================
// LOGIN
// ============================================================

async function handleLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;

  if (form.dataset.submitting === "true") {
    return;
  }

  clearFormMessage("#loginFormMessage");

  const email = fieldValue(form, [
    '[name="email"]',
    "#loginEmail"
  ]).toLowerCase();

  const password = fieldValue(form, [
    '[name="password"]',
    "#loginPassword"
  ]);

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password
  ) {
    showFormMessage(
      "#loginFormMessage",
      "Enter a valid email address and password."
    );
    return;
  }

  form.dataset.submitting = "true";
  setFormBusy(form, true);

  try {
    const persistence = $("#rememberSession")?.checked
      ? browserLocalPersistence
      : browserSessionPersistence;

    await withTimeout(
      setPersistence(auth, persistence)
    );

    await withTimeout(
      signInWithEmailAndPassword(
        auth,
        email,
        password
      )
    );

    toast("Welcome back!", "success");

  } catch (error) {
    console.error(
      "[Math Class] Login failed:",
      error?.code || "unknown-error"
    );

    showFormMessage(
      "#loginFormMessage",
      readableError(error)
    );
  } finally {
    form.dataset.submitting = "false";
    setFormBusy(form, false);
  }
}

// ============================================================
// PASSWORD RESET
// ============================================================

async function handlePasswordReset(event) {
  event.preventDefault();

  const form = event.currentTarget;

  if (form.dataset.submitting === "true") {
    return;
  }

  clearFormMessage("#forgotPasswordMessage");

  const email = fieldValue(form, [
    '[name="email"]',
    "#resetEmail"
  ]).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFormMessage(
      "#forgotPasswordMessage",
      "Enter a valid email address."
    );
    return;
  }

  form.dataset.submitting = "true";
  setFormBusy(form, true);

  try {
    await withTimeout(
      sendPasswordResetEmail(auth, email)
    );

    // Keep the message generic to avoid revealing whether
    // an email address belongs to a registered account.
    showFormMessage(
      "#forgotPasswordMessage",
      "If an account exists for this address, a password reset email has been sent.",
      "success"
    );

  } catch (error) {
    console.error(
      "[Math Class] Password reset failed:",
      error?.code || "unknown-error"
    );

    showFormMessage(
      "#forgotPasswordMessage",
      readableError(error)
    );
  } finally {
    form.dataset.submitting = "false";
    setFormBusy(form, false);
  }
}

// ============================================================
// PASSWORD VISIBILITY
// ============================================================

function bindPasswordToggle(buttonId, inputId) {
  const button = $(`#${buttonId}`);
  const input = $(`#${inputId}`);

  if (!button || !input) {
    return;
  }

  button.addEventListener("click", () => {
    const show = input.type === "password";

    input.type = show ? "text" : "password";

    button.setAttribute(
      "aria-pressed",
      String(show)
    );

    if (buttonId === "showLoginPassword") {
      button.textContent = show ? "Hide" : "Show";
    } else {
      button.setAttribute(
        "aria-label",
        show ? "Hide password" : "Show password"
      );
    }
  });
}

// ============================================================
// LOGOUT
// ============================================================

async function handleLogout() {
  try {
    await signOut(auth);

    toast("You have been signed out.", "success");

  } catch (error) {
    console.error(
      "[Math Class] Logout failed:",
      error?.code || "unknown-error"
    );

    toast(readableError(error), "error");
  }
}

// ============================================================
// AUTHENTICATION EVENT BINDINGS
// ============================================================

function bindAuthenticationForms() {
  if (authFormsBound) {
    return;
  }

  authFormsBound = true;

  $("#loginForm")?.addEventListener(
    "submit",
    handleLogin
  );

  $("#registerForm")?.addEventListener(
    "submit",
    handleRegister
  );

  $("#forgotPasswordForm")?.addEventListener(
    "submit",
    handlePasswordReset
  );

  $("#openRegisterButton")?.addEventListener(
    "click",
    () => showAuthPanel("register")
  );

  $("#openLoginButton")?.addEventListener(
    "click",
    () => showAuthPanel("login")
  );

  $("#forgotPasswordButton")?.addEventListener(
    "click",
    () => {
      const loginEmail = $("#loginEmail");
      const resetEmail = $("#resetEmail");

      if (
        loginEmail &&
        resetEmail &&
        loginEmail.value.trim()
      ) {
        resetEmail.value = loginEmail.value.trim();
      }

      showAuthPanel("forgot");
    }
  );

  $("#backToLoginButton")?.addEventListener(
    "click",
    () => showAuthPanel("login")
  );

  $("#sidebarLogoutButton")?.addEventListener(
    "click",
    handleLogout
  );

  bindPasswordToggle(
    "showLoginPassword",
    "loginPassword"
  );

  bindPasswordToggle(
    "showRegisterPassword",
    "registerPassword"
  );
}

// ============================================================
// PAGE ROUTING
// ============================================================

function normalizePage(page) {
  const value = String(page || "dashboard")
    .trim()
    .toLowerCase()
    .replace(/^#/, "");

  const aliases = {
    "study-tracker": "tracker",
    "daily-practice": "tracker",
    "study-history": "history",
    "class-chat": "chat",
    "doubt-inbox": "doubts",
    "role-manager": "roles",
    "system-overview": "dashboard",
    "system-status": "system"
  };

  return aliases[value] || value || "dashboard";
}

function getAvailablePages(role) {
  const common = [
    "dashboard",
    "announcements",
    "profile"
  ];

  if (role === "admin") {
    return [
      ...common,
      "roles",
      "moderation",
      "audit",
      "system"
    ];
  }

  if (role === "teacher") {
    return [
      ...common,
      "chat",
      "verification",
      "doubts",
      "student-insights"
    ];
  }

  return [
    ...common,
    "tracker",
    "history",
    "chat",
    "doubts"
  ];
}

function canAccessPage(page, role) {
  return getAvailablePages(role).includes(
    normalizePage(page)
  );
}

// ============================================================
// ROLE-BASED NAVIGATION VISIBILITY
// ============================================================

function updateRoleVisibility(role) {
  $$("[data-role]").forEach(element => {
    const roles = element.dataset.role
      .split(",")
      .map(value => value.trim().toLowerCase());

    element.hidden = !roles.includes(role);
  });

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

  const roleLabel = $("#sidebarRoleLabel");

  if (roleLabel) {
    roleLabel.textContent =
      role.charAt(0).toUpperCase() +
      role.slice(1) +
      " workspace";
  }
}

// ============================================================
// MODULE CONTAINER
// ============================================================

function ensureModuleContainer() {
  const pageContent = $("#pageContent");

  if (!pageContent) {
    console.warn(
      "[Math Class] #pageContent was not found."
    );

    return;
  }

  if (!$("#appView")) {
    const appView = document.createElement("div");

    appView.id = "appView";
    appView.className = "role-module-view";

    pageContent.appendChild(appView);
  }
}

// ============================================================
// PAGE DISPLAY
// ============================================================

function showPage(page) {
  if (!state.user || !state.role) {
    showAuthView();
    return;
  }

  let requestedPage = normalizePage(page);

  if (!canAccessPage(requestedPage, state.role)) {
    toast(
      "You do not have permission to open that page.",
      "error"
    );

    requestedPage = "dashboard";
  }

  state.currentPage = requestedPage;

  $$("[data-page]").forEach(section => {
    const active =
      normalizePage(section.dataset.page) === requestedPage;

    section.hidden = !active;
    section.classList.toggle("active", active);

    section.setAttribute(
      "aria-hidden",
      String(!active)
    );
  });

  $$("[data-route]").forEach(link => {
    const active =
      normalizePage(link.dataset.route) === requestedPage;

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
    const activeLink = $$("[data-route]").find(
      link =>
        normalizePage(link.dataset.route) === requestedPage
    );

    title.textContent =
      activeLink?.textContent?.trim() ||
      requestedPage
        .replace(/-/g, " ")
        .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  window.dispatchEvent(
    new CustomEvent("mathclass:pagechange", {
      detail: {
        page: requestedPage,
        role: state.role,
        user: state.user,
        profile: state.profile
      }
    })
  );

  closeNavigationDrawer();
}

// ============================================================
// MOBILE NAVIGATION
// ============================================================

function toggleNavigationDrawer() {
  const open =
    !document.body.classList.contains("drawer-open");

  document.body.classList.toggle(
    "drawer-open",
    open
  );

  $("#mobileMenuButton")?.setAttribute(
    "aria-expanded",
    String(open)
  );

  const scrim = $("#sidebarScrim");

  if (scrim) {
    scrim.hidden = !open;
  }
}

function closeNavigationDrawer() {
  document.body.classList.remove("drawer-open");

  $("#mobileMenuButton")?.setAttribute(
    "aria-expanded",
    "false"
  );

  const scrim = $("#sidebarScrim");

  if (scrim) {
    scrim.hidden = true;
  }
}

// ============================================================
// NAVIGATION EVENT BINDINGS
// ============================================================

function bindNavigation() {
  if (navigationBound) {
    return;
  }

  navigationBound = true;

  document.addEventListener("click", event => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const link = target.closest("[data-route]");

    if (!link) {
      return;
    }

    event.preventDefault();

    showPage(link.dataset.route);
  });

  $("#mobileMenuButton")?.addEventListener(
    "click",
    toggleNavigationDrawer
  );

  $("#sidebarScrim")?.addEventListener(
    "click",
    closeNavigationDrawer
  );

  $("#networkRetryButton")?.addEventListener(
    "click",
    () => {
      if (!navigator.onLine) {
        toast(
          "Your device is still offline.",
          "warning"
        );

        return;
      }

      window.location.reload();
    }
  );

  $("#pageRetryButton")?.addEventListener(
    "click",
    () => showPage(state.currentPage)
  );
}

// ============================================================
// USER INTERFACE
// ============================================================

function updateUserInterface(user, profile, role) {
  const name =
    profile?.name ||
    profile?.displayName ||
    user.displayName ||
    user.email?.split("@")[0] ||
    "Student";

  const email = profile?.email || user.email || "";

  const avatar = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join("")
    .toUpperCase();

  [
    "#userName",
    "#profileName",
    "#sidebarUserName",
    "[data-user-name]"
  ].forEach(selector => {
    $$(selector).forEach(element => {
      element.textContent = name;
    });
  });

  [
    "#userEmail",
    "#profileEmail",
    "#sidebarUserEmail",
    "[data-user-email]"
  ].forEach(selector => {
    $$(selector).forEach(element => {
      element.textContent = email;
    });
  });

  [
    "#userAvatar",
    "#profileAvatar",
    "#sidebarAvatar",
    "[data-user-avatar]"
  ].forEach(selector => {
    $$(selector).forEach(element => {
      element.textContent = avatar || "M";
    });
  });

  updateRoleVisibility(role);
}

// ============================================================
// ROLE MODULE INITIALIZATION
// ============================================================

async function initializeRoleModule(role, generation) {
  const paths = {
    student: "./student.js",
    teacher: "./teacher.js",
    admin: "./admin.js"
  };

  const path = paths[role];

  if (!path) {
    throw new Error(
      "No application module exists for this role."
    );
  }

  ensureModuleContainer();

  if (
    state.roleModule &&
    typeof state.roleModule.cleanup === "function"
  ) {
    try {
      await state.roleModule.cleanup();
    } catch (error) {
      console.warn(
        "[Math Class] Module cleanup warning:",
        error
      );
    }
  }

  state.roleModule = null;
  state.roleModuleName = null;

  const module = await import(path);

  // Ignore a module that finished loading after a newer
  // authentication event occurred.
  if (generation !== state.authGeneration) {
    return;
  }

  if (typeof module.init !== "function") {
    throw new Error(
      `The ${role} module does not export init().`
    );
  }

  state.roleModule = module;
  state.roleModuleName = role;

  await withTimeout(
    module.init({
      auth,
      db,
      database: db,
      user: state.user,
      profile: state.profile,
      userProfile: state.profile,
      role,
      toast,
      showPage,
      getState: () => ({ ...state })
    }),
    CONFIG.loadingTimeout
  );

  if (generation !== state.authGeneration) {
    if (typeof module.cleanup === "function") {
      await module.cleanup();
    }

    return;
  }

  window.dispatchEvent(
    new CustomEvent("mathclass:module-ready", {
      detail: { role }
    })
  );
}

// ============================================================
// CONNECTION MONITOR
// ============================================================

function updateConnectionStatus(online) {
  state.online = Boolean(online);

  const banner = $("#networkBanner");
  const message = $("#networkMessage");

  if (banner) {
    banner.hidden = state.online;
  }

  if (message) {
    message.textContent = state.online
      ? ""
      : "Connection lost. Reconnecting to Firebase...";
  }

  document.body.classList.toggle(
    "offline",
    !state.online
  );

  window.dispatchEvent(
    new CustomEvent("mathclass:connection", {
      detail: { online: state.online }
    })
  );
}

function setupConnectionMonitor() {
  if (connectionMonitorBound) {
    return;
  }

  connectionMonitorBound = true;

  window.addEventListener("online", () => {
    updateConnectionStatus(true);

    toast(
      "Connection restored.",
      "success"
    );
  });

  window.addEventListener("offline", () => {
    updateConnectionStatus(false);

    toast(
      "You are offline. Changes may not be saved.",
      "warning"
    );
  });

  updateConnectionStatus(navigator.onLine);

  try {
    state.connectionUnsubscribe = onValue(
      ref(db, ".info/connected"),
      snapshot => {
        const connected = snapshot.val() === true;

        if (connected) {
          console.info(
            "[Math Class] Connected to Realtime Database."
          );
        }
      },
      error => {
        console.warn(
          "[Math Class] Connection monitor warning:",
          error?.code || "unknown-error"
        );
      }
    );
  } catch (error) {
    console.warn(
      "[Math Class] Connection monitor unavailable:",
      error
    );
  }
}

// ============================================================
// AUTHENTICATION STATE
// ============================================================

async function handleAuthState(user) {
  const generation = ++state.authGeneration;

  state.startupError = null;

  try {
    if (!user) {
      state.user = null;
      state.profile = null;
      state.role = null;

      if (
        state.roleModule &&
        typeof state.roleModule.cleanup === "function"
      ) {
        try {
          await state.roleModule.cleanup();
        } catch (error) {
          console.warn(
            "[Math Class] Module cleanup warning:",
            error
          );
        }
      }

      state.roleModule = null;
      state.roleModuleName = null;

      showAuthView();

      markApplicationStarted();

      window.dispatchEvent(
        new CustomEvent("mathclass:auth-ready", {
          detail: {
            user: null,
            role: null
          }
        })
      );

      return;
    }

    showLoading("Loading your classroom...");

    state.user = user;

    const profile = await getUserProfile(user);

    if (generation !== state.authGeneration) {
      return;
    }

    state.profile = profile;
    state.role = profile.role;

    showApplicationView();

    updateUserInterface(
      user,
      profile,
      state.role
    );

    try {
      await initializeRoleModule(
        state.role,
        generation
      );
    } catch (moduleError) {
      if (generation !== state.authGeneration) {
        return;
      }

      console.error(
        `[Math Class] ${state.role} module failed:`,
        moduleError?.code || "unknown-error"
      );

      const pageError = $("#pageErrorState");
      const pageErrorMessage = $("#pageErrorMessage");

      if (pageError && pageErrorMessage) {
        pageError.hidden = false;

        pageErrorMessage.textContent =
          "Your account is signed in, but the dashboard could not load. " +
          readableError(moduleError);
      }

      toast(
        "Your account is signed in, but some dashboard features could not load.",
        "error",
        6000
      );

      window.dispatchEvent(
        new CustomEvent("mathclass:module-error", {
          detail: {
            role: state.role,
            message: readableError(moduleError)
          }
        })
      );
    }

    if (generation !== state.authGeneration) {
      return;
    }

    const initialPage = canAccessPage(
      state.currentPage,
      state.role
    )
      ? state.currentPage
      : "dashboard";

    showPage(initialPage);

    markApplicationStarted();

    window.dispatchEvent(
      new CustomEvent("mathclass:auth-ready", {
        detail: {
          user,
          profile: state.profile,
          role: state.role
        }
      })
    );

  } catch (error) {
    if (generation !== state.authGeneration) {
      return;
    }

    console.error(
      "[Math Class] Application initialization failed:",
      error?.code || "unknown-error"
    );

    state.startupError = error;

    if (user) {
      // Keep the signed-in state visible, but do not initialize
      // privileged functionality when the profile cannot load.
      state.user = user;
      state.profile = null;
      state.role = null;

      showApplicationView();

      const pageError = $("#pageErrorState");
      const pageErrorMessage = $("#pageErrorMessage");

      if (pageError && pageErrorMessage) {
        pageError.hidden = false;

        pageErrorMessage.textContent =
          "Your account could not be loaded. " +
          readableError(error);
      }

      showStartupError(
        "We couldn't load your account profile. " +
        readableError(error)
      );
    } else {
      showAuthView();
      markApplicationStarted();

      toast(
        readableError(error),
        "error"
      );
    }
  }
}

function handleAuthError(error) {
  console.error(
    "[Math Class] Authentication listener failed:",
    error?.code || "unknown-error"
  );

  showStartupError(
    "Authentication could not start. " +
    readableError(error)
  );
}

// ============================================================
// PUBLIC APPLICATION API
// ============================================================

window.MathClass = {
  toast,
  showLoading,
  hideLoading,
  showPage,

  async signOut() {
    await signOut(auth);
  },

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

  async refreshProfile() {
    if (!auth.currentUser) {
      throw new Error(
        "No user is signed in."
      );
    }

    const generation = state.authGeneration;

    const profile = await getUserProfile(
      auth.currentUser
    );

    if (generation !== state.authGeneration) {
      throw new Error(
        "Authentication changed while refreshing the profile."
      );
    }

    state.profile = profile;
    state.role = profile.role;

    updateUserInterface(
      auth.currentUser,
      profile,
      state.role
    );

    return profile;
  }
};

// ============================================================
// GLOBAL ERROR HANDLING
// ============================================================

window.addEventListener("error", event => {
  console.error(
    "[Math Class] JavaScript error:",
    event.error?.message || event.message
  );
});

window.addEventListener(
  "unhandledrejection",
  event => {
    console.error(
      "[Math Class] Unhandled promise rejection:",
      event.reason?.code || "unknown-error"
    );
  }
);

// ============================================================
// APPLICATION STARTUP
// ============================================================

function startApplication() {
  if (authListenerStarted) {
    return;
  }

  authListenerStarted = true;

  showLoading("Preparing your classroom...");

  bindAuthenticationForms();
  bindNavigation();
  setupConnectionMonitor();

  const currentYear = $("#currentYear");

  if (currentYear) {
    currentYear.textContent = String(
      new Date().getFullYear()
    );
  }

  onAuthStateChanged(
    auth,
    user => {
      // Each authentication event is handled independently.
      // The generation counter prevents stale operations from
      // overwriting the newest state.
      void handleAuthState(user);
    },
    handleAuthError
  );
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    startApplication,
    { once: true }
  );
} else {
  startApplication();
}
