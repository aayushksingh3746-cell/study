// ============================================================
// MATH CLASS — VIRTUAL LEARNING PORTAL
// Main application controller
// Firebase SDK 10.5.0 Modular
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
  sendPasswordResetEmail
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

const CONFIG = {
  profilePath: "users",
  loadingTimeout: 15000,
  adminUID: "YNdqDJRyZ1hFAtqrJeZJYScldfc2",
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
  online: navigator.onLine,
  currentPage: "dashboard",
  authGeneration: 0,
  roleModule: null,
  roleModuleName: null,
  connectionUnsubscribe: null,
  startupError: null
};

let authListenerStarted = false;

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
// SAFE ASYNC OPERATIONS
// ============================================================

function withTimeout(promise, timeout = CONFIG.loadingTimeout) {
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      reject(
        new Error(
          "The request took too long. Check your connection and try again."
        )
      );
    }, timeout);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timer);
  });
}

// ============================================================
// LOADING SCREEN AND STARTUP RECOVERY
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

  // Cancel the independent 12-second recovery timer
  // defined in index.html.
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
// NOTIFICATIONS
// ============================================================

function ensureToastContainer() {
  let container = $("#toastContainer");

  if (!container) {
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

    document.body.appendChild(container);
  }

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

  item.textContent = String(message);
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
// ERROR MESSAGES
// ============================================================

function readableError(error) {
  const messages = {
    "auth/invalid-email":
      "Please enter a valid email address.",

    "auth/user-not-found":
      "No account was found with that email.",

    "auth/wrong-password":
      "Incorrect email or password.",

    "auth/invalid-credential":
      "Incorrect email or password.",

    "auth/email-already-in-use":
      "An account with this email already exists.",

    "auth/weak-password":
      "Your password must contain at least 6 characters.",

    "auth/too-many-requests":
      "Too many attempts. Please try again later.",

    "auth/network-request-failed":
      "Network error. Check your internet connection.",

    "auth/operation-not-allowed":
      "Email and password sign-in is not enabled.",

    "auth/invalid-api-key":
      "The Firebase API key is invalid.",

    "auth/unauthorized-domain":
      "This website domain is not authorized in Firebase.",

    "PERMISSION_DENIED":
      "Firebase denied access. Check your database rules.",

    "permission_denied":
      "Firebase denied access. Check your database rules."
  };

  return messages[error?.code] ||
    error?.message ||
    "Something went wrong. Please try again.";
}

// ============================================================
// AUTHENTICATION VIEW
// ============================================================

function showAuthPanel(panelName = "login") {
  const panels = {
    login: $("#loginPanel"),
    register: $("#registerPanel"),
    forgot: $("#forgotPasswordPanel")
  };

  Object.entries(panels).forEach(([name, panel]) => {
    if (!panel) return;

    panel.hidden = name !== panelName;
  });

  const authView = $("#authView");

  if (authView) {
    authView.hidden = false;
    authView.style.display = "";
  }

  const appShell = $("#appShell");

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
  }

  if (appShell) {
    appShell.hidden = true;
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
    const field = form.querySelector(selector);

    if (field) {
      return String(field.value || "").trim();
    }
  }

  return "";
}

function setFormBusy(form, busy) {
  if (!form) return;

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

  element.textContent = message;
  element.hidden = false;

  element.classList.toggle("form-message-error", type === "error");
  element.classList.toggle("form-message-success", type === "success");
}

function clearFormMessage(selector) {
  const element = $(selector);

  if (element) {
    element.textContent = "";
    element.hidden = true;
  }
}

// ============================================================
// CREATE AND LOAD USER PROFILES
// ============================================================

async function getUserProfile(user) {
  const profileRef = ref(
    db,
    `${CONFIG.profilePath}/${user.uid}`
  );

  const snapshot = await withTimeout(get(profileRef));

  if (snapshot.exists()) {
    const existing = snapshot.val();

    const role = String(existing.role || "student").toLowerCase();

    if (!CONFIG.allowedRoles.includes(role)) {
      throw new Error("This account has an invalid role configuration.");
    }

    if (
      existing.status === "suspended" ||
      existing.status === "disabled" ||
      existing.disabled === true ||
      existing.suspended === true
    ) {
      throw new Error(
        "This account has been suspended. Contact your administrator."
      );
    }

    return {
      ...existing,
      uid: user.uid,
      name:
        existing.name ||
        existing.displayName ||
        user.displayName ||
        user.email?.split("@")[0] ||
        "Student",
      displayName:
        existing.displayName ||
        existing.name ||
        user.displayName ||
        "Student",
      email: existing.email || user.email || "",
      role,
      status: existing.status || "active"
    };
  }

  // New profiles default to student.
  // The configured administrator can receive their admin profile.
  const isConfiguredAdmin = user.uid === CONFIG.adminUID;

  const name =
    user.displayName ||
    user.email?.split("@")[0] ||
    "Student";

  const profile = {
    uid: user.uid,
    name,
    displayName: name,
    email: user.email || "",
    role: isConfiguredAdmin ? "admin" : "student",
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await withTimeout(set(profileRef, profile));

  return profile;
}

// ============================================================
// REGISTRATION
// ============================================================

async function handleRegister(event) {
  event.preventDefault();

  const form = event.currentTarget;

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

  if (name.length < 2) {
    showFormMessage(
      "#registerFormMessage",
      "Please enter your full name."
    );
    return;
  }

  if (!email) {
    showFormMessage(
      "#registerFormMessage",
      "Please enter your email address."
    );
    return;
  }

  if (password.length < 8) {
    showFormMessage(
      "#registerFormMessage",
      "Your password must contain at least 8 characters."
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

  setFormBusy(form, true);

  try {
    const credential = await withTimeout(
      createUserWithEmailAndPassword(auth, email, password)
    );

    await updateProfile(credential.user, {
      displayName: name
    });

    const profile = {
      uid: credential.user.uid,
      name,
      displayName: name,
      email: credential.user.email || email,
      role: "student",
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await withTimeout(
      set(
        ref(db, `${CONFIG.profilePath}/${credential.user.uid}`),
        profile
      )
    );

    toast("Your account has been created successfully.", "success");

    window.dispatchEvent(
      new CustomEvent("mathclass:registered", {
        detail: {
          uid: credential.user.uid,
          profile
        }
      })
    );

  } catch (error) {
    console.error("[Math Class] Registration failed:", error);

    showFormMessage(
      "#registerFormMessage",
      readableError(error)
    );
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

  clearFormMessage("#loginFormMessage");

  const email = fieldValue(form, [
    '[name="email"]',
    "#loginEmail"
  ]).toLowerCase();

  const password = fieldValue(form, [
    '[name="password"]',
    "#loginPassword"
  ]);

  if (!email || !password) {
    showFormMessage(
      "#loginFormMessage",
      "Enter your email address and password."
    );
    return;
  }

  setFormBusy(form, true);

  try {
    const persistence = $("#rememberSession")?.checked
      ? browserLocalPersistence
      : browserSessionPersistence;

    await withTimeout(setPersistence(auth, persistence));

    await withTimeout(
      signInWithEmailAndPassword(auth, email, password)
    );

    toast("Welcome back!", "success");

  } catch (error) {
    console.error("[Math Class] Login failed:", error);

    showFormMessage(
      "#loginFormMessage",
      readableError(error)
    );
  } finally {
    setFormBusy(form, false);
  }
}

// ============================================================
// PASSWORD RESET
// ============================================================

async function handlePasswordReset(event) {
  event.preventDefault();

  const form = event.currentTarget;

  clearFormMessage("#forgotPasswordMessage");

  const email = fieldValue(form, [
    '[name="email"]',
    "#resetEmail"
  ]).toLowerCase();

  if (!email) {
    showFormMessage(
      "#forgotPasswordMessage",
      "Enter your email address."
    );
    return;
  }

  setFormBusy(form, true);

  try {
    await withTimeout(sendPasswordResetEmail(auth, email));

    showFormMessage(
      "#forgotPasswordMessage",
      "If an account exists for this address, a password reset email has been sent.",
      "success"
    );

  } catch (error) {
    console.error("[Math Class] Password reset failed:", error);

    showFormMessage(
      "#forgotPasswordMessage",
      readableError(error)
    );
  } finally {
    setFormBusy(form, false);
  }
}

// ============================================================
// PASSWORD VISIBILITY
// ============================================================

function bindPasswordToggle(buttonId, inputId) {
  const button = $(`#${buttonId}`);
  const input = $(`#${inputId}`);

  if (!button || !input) return;

  button.addEventListener("click", () => {
    const show = input.type === "password";

    input.type = show ? "text" : "password";
    button.setAttribute("aria-pressed", String(show));

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
// AUTHENTICATION EVENT BINDINGS
// ============================================================

function bindAuthenticationForms() {
  $("#loginForm")?.addEventListener("submit", handleLogin);

  $("#registerForm")?.addEventListener("submit", handleRegister);

  $("#forgotPasswordForm")?.addEventListener(
    "submit",
    handlePasswordReset
  );

  $("#openRegisterButton")?.addEventListener("click", () => {
    showAuthPanel("register");
  });

  $("#openLoginButton")?.addEventListener("click", () => {
    showAuthPanel("login");
  });

  $("#forgotPasswordButton")?.addEventListener("click", () => {
    const loginEmail = $("#loginEmail");
    const resetEmail = $("#resetEmail");

    if (loginEmail && resetEmail && loginEmail.value.trim()) {
      resetEmail.value = loginEmail.value.trim();
    }

    showAuthPanel("forgot");
  });

  $("#backToLoginButton")?.addEventListener("click", () => {
    showAuthPanel("login");
  });

  $("#sidebarLogoutButton")?.addEventListener("click", handleLogout);

  $("#showLoginPassword") &&
    bindPasswordToggle("showLoginPassword", "loginPassword");

  $("#showRegisterPassword") &&
    bindPasswordToggle("showRegisterPassword", "registerPassword");
}

async function handleLogout() {
  try {
    await signOut(auth);
    toast("You have been signed out.", "success");
  } catch (error) {
    console.error("[Math Class] Logout failed:", error);
    toast(readableError(error), "error");
  }
}

// ============================================================
// ROLE-BASED PAGE ROUTING
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
  const common = ["dashboard", "announcements", "profile"];

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
  return getAvailablePages(role).includes(normalizePage(page));
}

function updateRoleVisibility(role) {
  // Existing navigation uses data-role="student|teacher|admin".
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

function ensureModuleContainer() {
  const pageContent = $("#pageContent");

  if (!pageContent) {
    console.warn("[Math Class] #pageContent was not found.");
    return;
  }

  // student.js uses #appView as its page container.
  if (!$("#appView")) {
    const appView = document.createElement("div");

    appView.id = "appView";
    appView.className = "role-module-view";

    pageContent.appendChild(appView);
  }
}

function showPage(page) {
  if (!state.user || !state.role) {
    showAuthView();
    return;
  }

  const requestedPage = normalizePage(page);

  if (!canAccessPage(requestedPage, state.role)) {
    toast("You do not have permission to open that page.", "error");
    page = "dashboard";
  } else {
    page = requestedPage;
  }

  state.currentPage = page;

  // Show or hide pages generated by role modules.
  $$("[data-page]").forEach(section => {
    const active = normalizePage(section.dataset.page) === page;

    section.hidden = !active;
    section.classList.toggle("active", active);
    section.setAttribute("aria-hidden", String(!active));
  });

  // Match sidebar routes against normalized module page names.
  $$("[data-route]").forEach(link => {
    const route = normalizePage(link.dataset.route);
    const active = route === page;

    link.classList.toggle("active", active);

    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  const title = findElement("#pageTitle", "[data-page-title]");

  if (title) {
    const activeLink = $$("[data-route]").find(
      link => normalizePage(link.dataset.route) === page
    );

    title.textContent =
      activeLink?.textContent?.trim() ||
      page.replace(/-/g, " ").replace(/\b\w/g, letter =>
        letter.toUpperCase()
      );
  }

  window.dispatchEvent(
    new CustomEvent("mathclass:pagechange", {
      detail: {
        page,
        role: state.role,
        user: state.user,
        profile: state.profile
      }
    })
  );

  closeNavigationDrawer();
}

function bindNavigation() {
  document.addEventListener("click", event => {
    const link = event.target.closest("[data-route]");

    if (!link) return;

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

  $("#networkRetryButton")?.addEventListener("click", () => {
    if (!navigator.onLine) {
      toast("Your device is still offline.", "warning");
      return;
    }

    window.location.reload();
  });

  $("#pageRetryButton")?.addEventListener("click", () => {
    showPage(state.currentPage);
  });
}

function toggleNavigationDrawer() {
  const open = !document.body.classList.contains("drawer-open");

  document.body.classList.toggle("drawer-open", open);

  const button = $("#mobileMenuButton");
  const scrim = $("#sidebarScrim");

  button?.setAttribute("aria-expanded", String(open));

  if (scrim) {
    scrim.hidden = !open;
  }
}

function closeNavigationDrawer() {
  document.body.classList.remove("drawer-open");

  $("#mobileMenuButton")?.setAttribute("aria-expanded", "false");

  const scrim = $("#sidebarScrim");

  if (scrim) {
    scrim.hidden = true;
  }
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

async function initializeRoleModule(role) {
  const paths = {
    student: "./student.js",
    teacher: "./teacher.js",
    admin: "./admin.js"
  };

  const path = paths[role];

  if (!path) {
    throw new Error("No application module exists for this role.");
  }

  ensureModuleContainer();

  // Clean up the previously loaded module if supported.
  if (
    state.roleModule &&
    typeof state.roleModule.cleanup === "function"
  ) {
    try {
      state.roleModule.cleanup();
    } catch (error) {
      console.warn("[Math Class] Module cleanup warning:", error);
    }
  }

  const module = await import(path);

  if (typeof module.init !== "function") {
    throw new Error(`The ${role} module does not export init().`);
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
  state.online = online;

  const banner = $("#networkBanner");
  const message = $("#networkMessage");

  if (banner) {
    banner.hidden = online;
  }

  if (message) {
    message.textContent = online
      ? ""
      : "Connection lost. Reconnecting to Firebase...";
  }

  document.body.classList.toggle("offline", !online);

  window.dispatchEvent(
    new CustomEvent("mathclass:connection", {
      detail: { online }
    })
  );
}

function setupConnectionMonitor() {
  window.addEventListener("online", () => {
    updateConnectionStatus(true);
    toast("Connection restored.", "success");
  });

  window.addEventListener("offline", () => {
    updateConnectionStatus(false);
    toast("You are offline. Changes may not be saved.", "warning");
  });

  updateConnectionStatus(navigator.onLine);

  // Firebase's special connection-status path.
  try {
    state.connectionUnsubscribe = onValue(
      ref(db, ".info/connected"),
      snapshot => {
        const connected = snapshot.val() === true;

        if (connected) {
          console.info("[Math Class] Connected to Realtime Database.");
        }
      },
      error => {
        console.warn(
          "[Math Class] Connection monitor warning:",
          error
        );
      }
    );
  } catch (error) {
    console.warn("[Math Class] Connection monitor unavailable:", error);
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

      // Remove role-specific listeners when signing out.
      if (
        state.roleModule &&
        typeof state.roleModule.cleanup === "function"
      ) {
        try {
          state.roleModule.cleanup();
        } catch (error) {
          console.warn("[Math Class] Module cleanup warning:", error);
        }
      }

      state.roleModule = null;
      state.roleModuleName = null;

      showAuthView();
      markApplicationStarted();

      window.dispatchEvent(
        new CustomEvent("mathclass:auth-ready", {
          detail: { user: null, role: null }
        })
      );

      return;
    }

    showLoading("Loading your classroom...");

    state.user = user;

    const profile = await getUserProfile(user);

    if (generation !== state.authGeneration) return;

    state.profile = profile;
    state.role = profile.role;

    showApplicationView();

    updateUserInterface(user, profile, state.role);

    // Initialize the correct role module.
    try {
      await initializeRoleModule(state.role);
    } catch (moduleError) {
      console.error(
        `[Math Class] ${state.role} module failed:`,
        moduleError
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
            message: moduleError.message
          }
        })
      );
    }

    if (generation !== state.authGeneration) return;

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
    console.error(
      "[Math Class] Application initialization failed:",
      error
    );

    if (generation !== state.authGeneration) return;

    state.startupError = error;

    if (user) {
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
      toast(readableError(error), "error");
    }
  }
}

function handleAuthError(error) {
  console.error(
    "[Math Class] Authentication listener failed:",
    error
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

  async refreshProfile() {
    if (!auth.currentUser) {
      throw new Error("No user is signed in.");
    }

    const profile = await getUserProfile(auth.currentUser);

    state.profile = profile;
    state.role = profile.role;

    updateUserInterface(auth.currentUser, profile, state.role);

    return profile;
  }
};

// ============================================================
// GLOBAL ERROR HANDLING
// ============================================================

window.addEventListener("error", event => {
  console.error(
    "[Math Class] JavaScript error:",
    event.error || event.message
  );
});

window.addEventListener("unhandledrejection", event => {
  console.error(
    "[Math Class] Unhandled promise rejection:",
    event.reason
  );
});

// ============================================================
// START APPLICATION
// ============================================================

function startApplication() {
  if (authListenerStarted) return;

  authListenerStarted = true;

  showLoading("Preparing your classroom...");

  // Bind events before checking authentication.
  bindAuthenticationForms();
  bindNavigation();
  setupConnectionMonitor();

  const currentYear = $("#currentYear");

  if (currentYear) {
    currentYear.textContent = String(new Date().getFullYear());
  }

  onAuthStateChanged(
    auth,
    handleAuthState,
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
