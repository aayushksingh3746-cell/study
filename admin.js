/* ============================================================
   MATH CLASS — VIRTUAL LEARNING PORTAL
   File: admin.js
   Phase 1 — Admin Panel
   Firebase Modular SDK 10.5.0
   ============================================================ */

import {
  ref,
  get,
  set,
  update,
  push,
  onValue,
  off,
  query,
  limitToLast,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

import {
  escapeHTML,
  formatDateTime
} from "./components.js";

/* ============================================================
   CONFIGURATION
   ============================================================ */

const ADMIN_CONFIG = {
  USERS_PATH: "users",
  CHAT_PATH: "class_chat",
  AUDIT_PATH: "auditLogs",
  LOG_LIMIT: 100,
  CHAT_LIMIT: 100
};

const ALLOWED_ADMIN_PAGES = [
  "dashboard",
  "roles",
  "moderation",
  "audit",
  "system"
];

/* ============================================================
   STATE
   ============================================================ */

let ctx = null;
let database = null;
let auth = null;
let currentUser = null;
let currentProfile = null;

let currentPage = "dashboard";
let activeTab = "all";
let searchTerm = "";

let usersCache = {};
let chatCache = {};
let auditCache = {};

let listeners = [];
let initialized = false;
let disposed = false;
let loading = false;

let pageContainer = null;
let pageChangeHandler = null;

/* ============================================================
   UTILITIES
   ============================================================ */

function escape(value) {
  return typeof escapeHTML === "function"
    ? escapeHTML(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]);
}

function currentUID() {
  return currentUser?.uid || auth?.currentUser?.uid || null;
}

function notify(message, type = "info") {
  if (typeof ctx?.toast === "function") {
    ctx.toast(message, type);
    return;
  }

  document.querySelector("[data-admin-toast]")?.remove();

  const toast = document.createElement("div");
  toast.dataset.adminToast = "true";
  toast.textContent = message;
  toast.setAttribute("role", "status");

  Object.assign(toast.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "999999",
    padding: "14px 18px",
    borderRadius: "12px",
    background: type === "error"
      ? "#991B1B"
      : type === "success"
        ? "#166534"
        : "#1E293B",
    color: "#FFFFFF",
    fontSize: "14px",
    maxWidth: "min(90vw, 380px)",
    boxShadow: "0 12px 35px rgba(0,0,0,.18)"
  });

  document.body.appendChild(toast);

  window.setTimeout(() => toast.remove(), 3500);
}

function timestamp(value) {
  if (value == null) return 0;

  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (typeof value === "object") {
    if (typeof value.seconds === "number") {
      return value.seconds * 1000;
    }

    if (typeof value[".sv"] === "string") {
      return 0;
    }
  }

  return 0;
}

function dateText(value) {
  if (value == null) return "Not available";

  try {
    if (typeof formatDateTime === "function") {
      const formatted = formatDateTime(value);

      if (formatted) return String(formatted);
    }

    const milliseconds =
      typeof value === "number" ? value : timestamp(value);

    if (!milliseconds) return "Not available";

    const date = new Date(milliseconds);

    return Number.isNaN(date.getTime())
      ? "Not available"
      : date.toLocaleString();
  } catch {
    return "Not available";
  }
}

function roleOf(profile = {}) {
  return String(
    profile?.role ||
    profile?.accountType ||
    "student"
  ).trim().toLowerCase();
}

function displayName(profile = {}, uid = "") {
  return (
    profile?.displayName ||
    profile?.name ||
    profile?.fullName ||
    profile?.email ||
    (uid ? `User ${uid.slice(0, 7)}` : "Unknown user")
  );
}

function emailOf(profile = {}) {
  return profile?.email || "No email provided";
}

function normalizeStatus(value) {
  return String(value || "active").trim().toLowerCase();
}

function isSuspended(profile = {}) {
  const status = normalizeStatus(profile?.status);

  return profile?.disabled === true ||
    profile?.suspended === true ||
    status === "suspended" ||
    status === "disabled";
}

function isPlainObject(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function normalizeRecords(value) {
  if (!isPlainObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => isPlainObject(item))
  );
}

function statusBadge(status) {
  const value = normalizeStatus(status);

  const colors = {
    active: ["#DCFCE7", "#166534"],
    student: ["#DBEAFE", "#1D4ED8"],
    teacher: ["#EDE9FE", "#6D28D9"],
    admin: ["#FCE7F3", "#9D174D"],
    administrator: ["#FCE7F3", "#9D174D"],
    suspended: ["#FEE2E2", "#991B1B"],
    disabled: ["#FEE2E2", "#991B1B"],
    deleted: ["#F1F5F9", "#475569"],
    resolved: ["#DCFCE7", "#166534"],
    pending: ["#FEF3C7", "#92400E"],
    flagged: ["#FEE2E2", "#991B1B"],
    hidden: ["#F1F5F9", "#475569"]
  };

  const palette = colors[value] || ["#F1F5F9", "#475569"];

  return `
    <span style="
      display:inline-flex;
      align-items:center;
      padding:5px 9px;
      border-radius:999px;
      background:${palette[0]};
      color:${palette[1]};
      font-size:11px;
      font-weight:700;
      text-transform:capitalize;
      white-space:nowrap;
    ">${escape(value)}</span>
  `;
}

function button(label, action, options = {}) {
  const {
    variant = "secondary",
    disabled = false,
    title = ""
  } = options;

  const palette = {
    primary: {
      background: "#4F46E5",
      color: "#FFFFFF",
      border: "1px solid #4F46E5"
    },
    danger: {
      background: "#FEE2E2",
      color: "#991B1B",
      border: "1px solid #FECACA"
    },
    success: {
      background: "#DCFCE7",
      color: "#166534",
      border: "1px solid #BBF7D0"
    },
    secondary: {
      background: "#FFFFFF",
      color: "#334155",
      border: "1px solid #E2E8F0"
    }
  };

  const style = palette[variant] || palette.secondary;

  return `
    <button
      type="button"
      data-admin-action="${escape(action)}"
      ${disabled ? "disabled" : ""}
      ${title ? `title="${escape(title)}"` : ""}
      style="
        min-height:40px;
        padding:9px 13px;
        border-radius:10px;
        background:${style.background};
        color:${style.color};
        border:${style.border};
        font:inherit;
        font-size:12px;
        font-weight:700;
        cursor:${disabled ? "not-allowed" : "pointer"};
        opacity:${disabled ? ".55" : "1"};
      "
    >${escape(label)}</button>
  `;
}

function card(content, extra = "") {
  return `
    <section style="
      background:#FFFFFF;
      border:1px solid #E2E8F0;
      border-radius:18px;
      padding:20px;
      min-width:0;
      ${extra}
    ">${content}</section>
  `;
}

function statCard(label, value, description, accent = "#4F46E5") {
  return `
    <div style="
      background:#FFFFFF;
      border:1px solid #E2E8F0;
      border-radius:16px;
      padding:19px;
      min-width:0;
    ">
      <div style="
        display:flex;
        align-items:center;
        gap:8px;
        color:#64748B;
        font-size:12px;
        font-weight:600;
      ">
        <span style="
          width:9px;
          height:9px;
          background:${accent};
          border-radius:50%;
        "></span>
        ${escape(label)}
      </div>

      <div style="
        margin:13px 0 6px;
        color:#111827;
        font-size:30px;
        font-weight:800;
        letter-spacing:-1px;
      ">${escape(value)}</div>

      <div style="color:#94A3B8;font-size:12px;">
        ${escape(description)}
      </div>
    </div>
  `;
}

function sectionHeading(title, description, right = "") {
  return `
    <div style="
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:16px;
      flex-wrap:wrap;
      margin-bottom:22px;
    ">
      <div>
        <h2 style="
          margin:0 0 6px;
          color:#111827;
          font-size:24px;
          font-weight:800;
          letter-spacing:-.6px;
        ">${escape(title)}</h2>

        <p style="
          margin:0;
          color:#64748B;
          font-size:13px;
          line-height:1.6;
        ">${escape(description)}</p>
      </div>

      ${right}
    </div>
  `;
}

function loadingState(message = "Loading administrator data…") {
  return `
    <div role="status" style="
      display:flex;
      align-items:center;
      gap:12px;
      padding:30px 12px;
      color:#64748B;
      font-size:14px;
    ">
      <span style="
        width:20px;
        height:20px;
        flex-shrink:0;
        border:2px solid #E0E7FF;
        border-top-color:#4F46E5;
        border-radius:50%;
        animation:adminSpin .8s linear infinite;
      "></span>
      ${escape(message)}
    </div>
  `;
}

function errorState(message, retryAction = "retry") {
  return `
    <div style="
      padding:26px;
      border-radius:14px;
      background:#FFF7F7;
      border:1px solid #FECACA;
      text-align:center;
    ">
      <div style="font-size:14px;font-weight:700;color:#991B1B;">
        We couldn't load this section.
      </div>

      <p style="font-size:12px;color:#7F1D1D;line-height:1.6;">
        ${escape(message)}
      </p>

      ${button("Try again", retryAction, { variant: "danger" })}
    </div>
  `;
}

function tableWrapper(headers, rows, emptyMessage = "No records found.") {
  if (!rows.length) {
    return `
      <div style="
        padding:32px 12px;
        text-align:center;
        color:#94A3B8;
        font-size:13px;
      ">${escape(emptyMessage)}</div>
    `;
  }

  return `
    <div style="width:100%;overflow-x:auto;">
      <table style="
        width:100%;
        border-collapse:collapse;
        font-size:12px;
        text-align:left;
      ">
        <thead>
          <tr>
            ${headers.map(header => `
              <th style="
                padding:12px;
                background:#F8FAFC;
                color:#64748B;
                font-weight:700;
                white-space:nowrap;
                border-bottom:1px solid #E2E8F0;
              ">${escape(header)}</th>
            `).join("")}
          </tr>
        </thead>

        <tbody>${rows.join("")}</tbody>
      </table>
    </div>
  `;
}

function tableRow(cells) {
  return `
    <tr>
      ${cells.map(cell => `
        <td style="
          padding:14px 12px;
          color:#334155;
          vertical-align:middle;
          border-bottom:1px solid #F1F5F9;
        ">${cell}</td>
      `).join("")}
    </tr>
  `;
}

function safeError(error) {
  const code = String(error?.code || "").toLowerCase();

  if (
    code.includes("permission-denied") ||
    code.includes("permission_denied")
  ) {
    return "Firebase denied this operation. Check the Realtime Database Rules and confirm that your account has administrator permissions.";
  }

  if (
    code.includes("network") ||
    code.includes("unavailable") ||
    code.includes("disconnected")
  ) {
    return "Firebase could not be reached. Check your internet connection and try again.";
  }

  if (code.includes("unauthenticated")) {
    return "Your session has expired. Sign in again.";
  }

  return error?.message || "An unexpected error occurred.";
}

function setPageContent(html) {
  if (!pageContainer || !pageContainer.isConnected) {
    pageContainer = document.querySelector(
      "#page-content, #app-content, #main-content, #pageContent, #appView, [data-page-content], main"
    );
  }

  if (!pageContainer) {
    console.error(
      "[Admin] Could not find the application content container."
    );
    return;
  }

  pageContainer.innerHTML = html;
}

function addSpinnerStyle() {
  if (document.getElementById("admin-spinner-style")) return;

  const style = document.createElement("style");
  style.id = "admin-spinner-style";

  style.textContent = `
    @keyframes adminSpin {
      to { transform:rotate(360deg); }
    }

    .admin-input:focus {
      outline:2px solid #C7D2FE;
      border-color:#818CF8 !important;
    }

    [data-admin-action]:focus-visible {
      outline:3px solid #A5B4FC;
      outline-offset:2px;
    }

    @media (max-width:640px) {
      .admin-grid {
        grid-template-columns:1fr !important;
      }
    }
  `;

  document.head.appendChild(style);
}

/* ============================================================
   DATABASE LISTENERS
   ============================================================ */

function detachListeners() {
  listeners.forEach(({ targetRef, handler }) => {
    try {
      off(targetRef, "value", handler);
    } catch (error) {
      console.warn("[Admin] Listener cleanup failed:", error);
    }
  });

  listeners = [];
}

function listen(path, callback, options = {}) {
  if (!database) {
    callback(null, new Error("Firebase Database is unavailable."));
    return;
  }

  const baseRef = ref(database, path);
  const targetRef = options.limit
    ? query(baseRef, limitToLast(options.limit))
    : baseRef;

  let firstResult = true;

  const handler = snapshot => {
    if (disposed) return;

    const value = snapshot.exists() ? snapshot.val() : {};

    callback(value, null, firstResult);
    firstResult = false;
  };

  const errorHandler = error => {
    if (disposed) return;

    callback(null, error, firstResult);
    firstResult = false;
  };

  listeners.push({
    targetRef,
    handler
  });

  onValue(targetRef, handler, errorHandler);
}

async function readPath(path, options = {}) {
  if (!database) {
    throw new Error("Firebase Database is unavailable.");
  }

  const databaseRef = ref(database, path);
  const targetRef = options.limit
    ? query(databaseRef, limitToLast(options.limit))
    : databaseRef;

  const snapshot = await get(targetRef);

  return snapshot.exists() ? snapshot.val() : {};
}

async function writeAudit(action, details = {}) {
  const uid = currentUID();

  if (!database || !uid) {
    throw new Error("Administrator session is unavailable.");
  }

  const auditRef = push(ref(database, ADMIN_CONFIG.AUDIT_PATH));

  await set(auditRef, {
    action,
    details,
    performedBy: uid,
    performedByName: displayName(currentProfile, uid),
    createdAt: Date.now(),
    serverCreatedAt: serverTimestamp()
  });
}

/* ============================================================
   ADMIN AUTHORIZATION
   ============================================================ */

function verifyAdmin() {
  if (!currentUID()) {
    return {
      allowed: false,
      message: "Please sign in with an administrator account."
    };
  }

  const role = roleOf(currentProfile);

  if (!["admin", "administrator"].includes(role)) {
    return {
      allowed: false,
      message: "Your account does not have administrator access."
    };
  }

  if (isSuspended(currentProfile)) {
    return {
      allowed: false,
      message: "This account has been suspended."
    };
  }

  return { allowed: true };
}

function renderAccessDenied(message) {
  setPageContent(`
    <div style="
      max-width:560px;
      margin:60px auto;
      padding:30px;
      background:#FFFFFF;
      border:1px solid #FECACA;
      border-radius:20px;
      text-align:center;
    ">
      <div style="font-size:36px;margin-bottom:12px;">🔒</div>

      <h2 style="margin:0 0 10px;color:#111827;">
        Administrator access required
      </h2>

      <p style="
        color:#64748B;
        font-size:13px;
        line-height:1.7;
      ">${escape(message)}</p>
    </div>
  `);
}

/* ============================================================
   NAVIGATION
   ============================================================ */

function normalizePage(page) {
  const aliases = {
    admin: "dashboard",
    overview: "dashboard",
    "system-overview": "dashboard",
    "role-manager": "roles",
    "user-management": "roles",
    "chat-moderation": "moderation",
    "moderation-log": "moderation",
    "system-status": "system"
  };

  const value = String(page || "dashboard")
    .replace(/^admin-/, "")
    .toLowerCase();

  return aliases[value] || value;
}

function navigate(page) {
  currentPage = normalizePage(page);

  if (typeof ctx?.showPage === "function") {
    ctx.showPage(currentPage);
  }

  renderCurrentPage();
}

function renderAdminNavigation() {
  const items = [
    ["dashboard", "Overview", "◫"],
    ["roles", "Role Manager", "♙"],
    ["moderation", "Chat Moderation", "◉"],
    ["audit", "Audit Log", "≡"],
    ["system", "System Status", "⌁"]
  ];

  return `
    <div style="
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      margin-bottom:24px;
      padding:8px;
      background:#FFFFFF;
      border:1px solid #E2E8F0;
      border-radius:14px;
    ">
      ${items.map(([page, label, icon]) => `
        <button
          type="button"
          data-admin-action="navigate"
          data-page="${escape(page)}"
          aria-current="${currentPage === page ? "page" : "false"}"
          style="
            display:flex;
            align-items:center;
            gap:8px;
            min-height:42px;
            padding:10px 13px;
            border:1px solid ${currentPage === page ? "#C7D2FE" : "transparent"};
            border-radius:10px;
            background:${currentPage === page ? "#EEF2FF" : "transparent"};
            color:${currentPage === page ? "#4338CA" : "#64748B"};
            font-size:12px;
            font-weight:700;
            cursor:pointer;
          "
        >
          <span aria-hidden="true">${icon}</span>
          ${escape(label)}
        </button>
      `).join("")}
    </div>
  `;
}

function adminShell(content) {
  return `
    <div style="
      width:100%;
      max-width:1440px;
      margin:0 auto;
      padding:clamp(14px,3vw,30px);
      color:#111827;
      font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      box-sizing:border-box;
    ">
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:16px;
        flex-wrap:wrap;
        margin-bottom:24px;
      ">
        <div>
          <div style="
            color:#4F46E5;
            font-size:10px;
            font-weight:800;
            letter-spacing:2px;
            text-transform:uppercase;
            margin-bottom:7px;
          ">MATH CLASS / ADMINISTRATION</div>

          <h1 style="
            margin:0;
            color:#111827;
            font-size:clamp(24px,4vw,34px);
            font-weight:850;
            letter-spacing:-1.2px;
          ">Admin Console</h1>

          <p style="
            margin:8px 0 0;
            color:#64748B;
            font-size:12px;
          ">Manage access, moderation and platform activity.</p>
        </div>

        <div style="
          display:flex;
          align-items:center;
          gap:10px;
          padding:10px 13px;
          border:1px solid #E2E8F0;
          background:#FFFFFF;
          border-radius:12px;
        ">
          <span style="
            width:9px;
            height:9px;
            background:#16A34A;
            border-radius:50%;
          "></span>

          <div>
            <div style="
              color:#334155;
              font-size:12px;
              font-weight:700;
            ">${escape(displayName(currentProfile, currentUID()))}</div>

            <div style="
              margin-top:3px;
              color:#64748B;
              font-size:10px;
            ">Administrator</div>
          </div>
        </div>
      </div>

      ${renderAdminNavigation()}

      <div id="admin-section-content">${content}</div>

      <div style="
        margin-top:30px;
        padding-top:16px;
        border-top:1px solid #E2E8F0;
        color:#94A3B8;
        font-size:11px;
        line-height:1.6;
      ">
        Administrative actions may affect other users. Changes are subject
        to Firebase Security Rules and should be reviewed carefully.
      </div>
    </div>
  `;
}

function renderCurrentPage() {
  if (disposed) return;

  const access = verifyAdmin();

  if (!access.allowed) {
    renderAccessDenied(access.message);
    return;
  }

  switch (currentPage) {
    case "roles":
      setPageContent(adminShell(renderRoleManager()));
      break;

    case "moderation":
      setPageContent(adminShell(renderModeration()));
      break;

    case "audit":
      setPageContent(adminShell(renderAuditLog()));
      break;

    case "system":
      setPageContent(adminShell(renderSystemStatus()));
      break;

    case "dashboard":
    default:
      currentPage = "dashboard";
      setPageContent(adminShell(renderOverview()));
      break;
  }
}

/* ============================================================
   OVERVIEW
   ============================================================ */

function renderOverview() {
  const users = Object.entries(usersCache);
  const chat = Object.entries(chatCache);

  const students = users.filter(([, user]) =>
    roleOf(user) === "student"
  ).length;

  const teachers = users.filter(([, user]) =>
    roleOf(user) === "teacher"
  ).length;

  const admins = users.filter(([, user]) =>
    ["admin", "administrator"].includes(roleOf(user))
  ).length;

  const suspended = users.filter(([, user]) =>
    isSuspended(user)
  ).length;

  const flagged = chat.filter(([, message]) =>
    message?.flagged === true ||
    message?.reported === true ||
    message?.moderationStatus === "flagged"
  ).length;

  const recentUsers = users
    .sort((a, b) =>
      timestamp(b[1]?.createdAt) - timestamp(a[1]?.createdAt)
    )
    .slice(0, 5);

  const userRows = recentUsers.map(([uid, profile]) =>
    tableRow([
      `<div style="font-weight:700;color:#111827;">${escape(displayName(profile, uid))}</div>
       <div style="margin-top:4px;color:#94A3B8;">${escape(emailOf(profile))}</div>`,
      statusBadge(roleOf(profile)),
      statusBadge(isSuspended(profile) ? "suspended" : "active"),
      escape(dateText(profile.createdAt))
    ])
  );

  return `
    ${sectionHeading(
      "System Overview",
      "A live summary of accounts, class chat and administrative activity."
    )}

    <div class="admin-grid" style="
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(175px,1fr));
      gap:14px;
      margin-bottom:24px;
    ">
      ${statCard("Total accounts", users.length, "Registered profiles", "#4F46E5")}
      ${statCard("Students", students, "Student accounts", "#2563EB")}
      ${statCard("Teachers", teachers, "Teaching accounts", "#7C3AED")}
      ${statCard("Administrators", admins, "Privileged profiles", "#DB2777")}
      ${statCard("Suspended accounts", suspended, "Accounts marked suspended", "#DC2626")}
      ${statCard("Flagged messages", flagged, "Messages requiring review", "#D97706")}
    </div>

    <div class="admin-grid" style="
      display:grid;
      grid-template-columns:minmax(0,1.5fr) minmax(250px,1fr);
      gap:18px;
    ">
      ${card(`
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          flex-wrap:wrap;
          margin-bottom:18px;
        ">
          <div>
            <h3 style="margin:0 0 5px;font-size:16px;">Recent accounts</h3>
            <p style="margin:0;color:#64748B;font-size:12px;">Latest profiles in the database.</p>
          </div>

          ${button("Manage users", "navigate", { variant: "primary" })
            .replace('data-admin-action="navigate"', 'data-admin-action="navigate" data-page="roles"')}
        </div>

        ${tableWrapper(
          ["User", "Role", "Status", "Created"],
          userRows,
          "No user profiles were found."
        )}
      `)}

      ${card(`
        <h3 style="margin:0 0 8px;font-size:16px;">Administrative shortcuts</h3>

        <p style="margin:0 0 18px;color:#64748B;font-size:12px;line-height:1.6;">
          Open a section to review the platform.
        </p>

        <div style="display:grid;gap:10px;">
          ${button("Manage user roles →", "navigate").replace('data-admin-action="navigate"', 'data-admin-action="navigate" data-page="roles"')}
          ${button("Review chat →", "navigate").replace('data-admin-action="navigate"', 'data-admin-action="navigate" data-page="moderation"')}
          ${button("View audit history →", "navigate").replace('data-admin-action="navigate"', 'data-admin-action="navigate" data-page="audit"')}
          ${button("Check system status →", "navigate").replace('data-admin-action="navigate"', 'data-admin-action="navigate" data-page="system"')}
        </div>

        <div style="margin-top:20px;padding:13px;background:#F8FAFC;border-radius:12px;color:#64748B;font-size:11px;line-height:1.6;">
          <strong style="color:#334155;">Security reminder</strong><br>
          Client-side role checks do not secure the database. Firebase Rules
          must enforce every privileged operation.
        </div>
      `)}
    </div>

    <div style="margin-top:18px;">
      ${card(`
        <h3 style="margin:0 0 8px;font-size:16px;">Recent administrative activity</h3>
        <p style="margin:0 0 16px;color:#64748B;font-size:12px;">
          The latest recorded audit events.
        </p>
        ${renderRecentAudit(5)}
      `)}
    </div>
  `;
}

function renderRecentAudit(limit = 5) {
  const entries = Object.entries(auditCache)
    .sort((a, b) =>
      timestamp(b[1]?.createdAt || b[1]?.serverCreatedAt) -
      timestamp(a[1]?.createdAt || a[1]?.serverCreatedAt)
    )
    .slice(0, limit);

  if (!entries.length) {
    return `<div style="padding:18px 0;color:#94A3B8;font-size:12px;">No audit events have been recorded yet.</div>`;
  }

  return `
    <div style="display:grid;gap:0;">
      ${entries.map(([, entry]) => `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:15px;padding:13px 0;border-bottom:1px solid #F1F5F9;">
          <div>
            <div style="color:#334155;font-size:12px;font-weight:700;">
              ${escape(entry.action || "Administrative activity")}
            </div>
            <div style="margin-top:4px;color:#64748B;font-size:11px;">
              ${escape(entry.performedByName || entry.performedBy || "Unknown administrator")}
            </div>
          </div>
          <time style="color:#94A3B8;font-size:10px;white-space:nowrap;">
            ${escape(dateText(entry.createdAt || entry.serverCreatedAt))}
          </time>
        </div>
      `).join("")}
    </div>
  `;
}

/* ============================================================
   ROLE MANAGER
   ============================================================ */

function renderRoleManager() {
  const filtered = Object.entries(usersCache).filter(([uid, profile]) => {
    const searchable = [
      uid,
      displayName(profile, uid),
      emailOf(profile),
      roleOf(profile)
    ].join(" ").toLowerCase();

    const matchesSearch = searchable.includes(searchTerm.toLowerCase());

    const matchesTab =
      activeTab === "all" ||
      (activeTab === "students" && roleOf(profile) === "student") ||
      (activeTab === "teachers" && roleOf(profile) === "teacher") ||
      (activeTab === "admins" && ["admin", "administrator"].includes(roleOf(profile))) ||
      (activeTab === "suspended" && isSuspended(profile));

    return matchesSearch && matchesTab;
  });

  const rows = filtered.map(([uid, profile]) => {
    const suspended = isSuspended(profile);

    return tableRow([
      `<div style="font-weight:700;color:#111827;">${escape(displayName(profile, uid))}</div>
       <div style="margin-top:4px;color:#94A3B8;font-size:11px;">${escape(emailOf(profile))}</div>
       <div style="margin-top:4px;color:#CBD5E1;font-size:10px;">UID: ${escape(uid)}</div>`,
      statusBadge(roleOf(profile)),
      statusBadge(suspended ? "suspended" : "active"),
      escape(dateText(profile.createdAt)),
      `<div style="display:flex;gap:7px;flex-wrap:wrap;">
        ${button("Edit role", "edit-role", { variant: "primary" })
          .replace('data-admin-action="edit-role"', `data-admin-action="edit-role" data-uid="${escape(uid)}"`)}

        ${button(suspended ? "Reactivate" : "Suspend", "toggle-user", {
          variant: suspended ? "success" : "danger"
        }).replace('data-admin-action="toggle-user"', `data-admin-action="toggle-user" data-uid="${escape(uid)}"`)}
      </div>`
    ]);
  });

  return `
    ${sectionHeading("Role Manager", "Review user profiles and manage application-level roles.")}

    ${card(`
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px;">
        <input
          class="admin-input"
          id="admin-user-search"
          type="search"
          value="${escape(searchTerm)}"
          placeholder="Search by name, email, UID or role…"
          aria-label="Search users"
          style="flex:1;min-width:220px;min-height:42px;padding:10px 12px;border:1px solid #E2E8F0;border-radius:10px;font:inherit;font-size:12px;"
        />
        ${button("Refresh", "refresh-users")}
      </div>

      <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:18px;">
        ${[
          ["all", "All users"],
          ["students", "Students"],
          ["teachers", "Teachers"],
          ["admins", "Admins"],
          ["suspended", "Suspended"]
        ].map(([key, label]) => `
          <button type="button" data-admin-action="role-tab" data-tab="${key}"
            style="min-height:38px;padding:8px 12px;border-radius:9px;border:1px solid ${activeTab === key ? "#C7D2FE" : "#E2E8F0"};background:${activeTab === key ? "#EEF2FF" : "#FFFFFF"};color:${activeTab === key ? "#4338CA" : "#64748B"};font-size:11px;font-weight:700;cursor:pointer;">
            ${label}
          </button>
        `).join("")}
      </div>

      <div style="color:#64748B;font-size:12px;margin-bottom:12px;">
        ${filtered.length} matching account${filtered.length === 1 ? "" : "s"}
      </div>

      ${tableWrapper(["User", "Role", "Account status", "Created", "Actions"], rows, "No matching accounts were found.")}
    `)}
  `;
}

async function refreshUsers() {
  try {
    usersCache = normalizeRecords(await readPath(ADMIN_CONFIG.USERS_PATH));
    renderCurrentPage();
  } catch (error) {
    console.error("[Admin] Refresh users:", error);
    notify(`Unable to refresh users: ${safeError(error)}`, "error");
  }
}

async function editUserRole(uid) {
  if (!uid) return;

  const profile = usersCache[uid];

  if (!profile) {
    notify("That user could not be found.", "error");
    return;
  }

  if (uid === currentUID()) {
    notify("You cannot change your own administrator role here.", "error");
    return;
  }

  const currentRole = roleOf(profile);
  const choice = window.prompt(
    `Change role for ${displayName(profile, uid)}.\n\nEnter student, teacher, or admin.\nCurrent role: ${currentRole}`,
    currentRole
  );

  if (choice === null) return;

  const nextRole = choice.trim().toLowerCase();

  if (!["student", "teacher", "admin"].includes(nextRole)) {
    notify("Choose student, teacher, or admin.", "error");
    return;
  }

  const existingAdmins = Object.entries(usersCache).filter(([, user]) =>
    ["admin", "administrator"].includes(roleOf(user)) && !isSuspended(user)
  ).length;

  if (
    ["admin", "administrator"].includes(currentRole) &&
    nextRole === "student" &&
    existingAdmins <= 1
  ) {
    notify("The last active administrator cannot be demoted.", "error");
    return;
  }

  if (!window.confirm(`Change ${displayName(profile, uid)} from ${currentRole} to ${nextRole}?`)) {
    return;
  }

  try {
    await update(ref(database, `${ADMIN_CONFIG.USERS_PATH}/${uid}`), {
      role: nextRole,
      roleUpdatedAt: Date.now(),
      roleUpdatedBy: currentUID()
    });

    await writeAudit("USER_ROLE_CHANGED", {
      targetUID: uid,
      targetName: displayName(profile, uid),
      oldRole: currentRole,
      newRole: nextRole
    });

    notify("User role updated.", "success");
    await refreshUsers();
  } catch (error) {
    console.error("[Admin] Change role:", error);
    notify(`Unable to change role: ${safeError(error)}`, "error");
  }
}

async function toggleUserStatus(uid) {
  if (!uid) return;

  if (uid === currentUID()) {
    notify("You cannot suspend your own account.", "error");
    return;
  }

  const profile = usersCache[uid];

  if (!profile) {
    notify("That user could not be found.", "error");
    return;
  }

  const suspended = isSuspended(profile);

  if (!suspended && ["admin", "administrator"].includes(roleOf(profile))) {
    const activeAdmins = Object.entries(usersCache).filter(([, user]) =>
      ["admin", "administrator"].includes(roleOf(user)) && !isSuspended(user)
    ).length;

    if (activeAdmins <= 1) {
      notify("The last active administrator cannot be suspended.", "error");
      return;
    }
  }

  const action = suspended ? "reactivate" : "suspend";

  if (!window.confirm(`Are you sure you want to ${action} ${displayName(profile, uid)}?`)) {
    return;
  }

  try {
    const nextStatus = suspended ? "active" : "suspended";

    await update(ref(database, `${ADMIN_CONFIG.USERS_PATH}/${uid}`), {
      status: nextStatus,
      suspended: !suspended,
      disabled: !suspended,
      statusUpdatedAt: Date.now(),
      statusUpdatedBy: currentUID()
    });

    await writeAudit(suspended ? "USER_REACTIVATED" : "USER_SUSPENDED", {
      targetUID: uid,
      targetName: displayName(profile, uid),
      status: nextStatus
    });

    notify(suspended ? "Account reactivated." : "Account suspended.", "success");
    await refreshUsers();
  } catch (error) {
    console.error("[Admin] Update account status:", error);
    notify(`Unable to update account: ${safeError(error)}`, "error");
  }
}

/* ============================================================
   CHAT MODERATION
   ============================================================ */

function renderModeration() {
  const messages = Object.entries(chatCache)
    .sort((a, b) =>
      timestamp(b[1]?.createdAt || b[1]?.timestamp) -
      timestamp(a[1]?.createdAt || a[1]?.timestamp)
    );

  const flaggedMessages = messages.filter(([, message]) =>
    message?.flagged === true ||
    message?.reported === true ||
    message?.moderationStatus === "flagged"
  );

  const rows = messages.map(([id, message]) => {
    const flagged =
      message?.flagged === true ||
      message?.reported === true ||
      message?.moderationStatus === "flagged";

    const hidden =
      message?.deleted === true ||
      message?.hidden === true ||
      message?.moderationStatus === "hidden";

    const messageText = String(
      message?.text || message?.message || message?.content || ""
    );

    const authorName =
      message?.displayName ||
      message?.senderName ||
      message?.authorName ||
      message?.userName ||
      "Unknown user";

    const authorUID =
      message?.uid ||
      message?.userId ||
      message?.senderId ||
      "";

    return tableRow([
      `<div style="font-weight:700;color:#111827;">${escape(authorName)}</div>
       <div style="margin-top:4px;color:#94A3B8;font-size:10px;">${escape(authorUID)}</div>`,
      `<div style="max-width:330px;white-space:normal;overflow-wrap:anywhere;">
        ${escape(messageText.slice(0, 300))}${messageText.length > 300 ? "…" : ""}
       </div>`,
      statusBadge(flagged ? "flagged" : hidden ? "hidden" : "active"),
      escape(dateText(message.createdAt || message.timestamp)),
      `<div style="display:flex;gap:7px;flex-wrap:wrap;">
        ${button(flagged ? "Clear flag" : "Flag", "toggle-flag", {
          variant: flagged ? "success" : "secondary"
        }).replace('data-admin-action="toggle-flag"', `data-admin-action="toggle-flag" data-message-id="${escape(id)}"`)}

        ${button(hidden ? "Restore" : "Hide", "toggle-message", {
          variant: hidden ? "success" : "danger"
        }).replace('data-admin-action="toggle-message"', `data-admin-action="toggle-message" data-message-id="${escape(id)}"`)}
      </div>`
    ]);
  });

  return `
    ${sectionHeading("Chat Moderation", "Review class chat messages and take moderation actions.")}

    <div class="admin-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:20px;">
      ${statCard("Loaded messages", messages.length, "Messages available for review", "#4F46E5")}
      ${statCard("Flagged messages", flaggedMessages.length, "Reported or flagged", "#DC2626")}
      ${statCard("Hidden messages", messages.filter(([, message]) => message?.deleted === true || message?.hidden === true || message?.moderationStatus === "hidden").length, "Messages hidden from normal display", "#D97706")}
    </div>

    ${card(`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
        <div>
          <h3 style="margin:0 0 5px;font-size:16px;">Message review</h3>
          <p style="margin:0;color:#64748B;font-size:12px;">Messages from ${escape(ADMIN_CONFIG.CHAT_PATH)}.</p>
        </div>
        ${button("Refresh messages", "refresh-chat")}
      </div>

      ${tableWrapper(["Author", "Message", "Status", "Sent", "Actions"], rows, "No class chat messages were found.")}

      <p style="margin:16px 0 0;color:#94A3B8;font-size:11px;line-height:1.6;">
        Moderation changes depend on your database schema and Firebase Security Rules.
      </p>
    `)}
  `;
}

async function refreshChat() {
  try {
    chatCache = normalizeRecords(await readPath(ADMIN_CONFIG.CHAT_PATH, {
      limit: ADMIN_CONFIG.CHAT_LIMIT
    }));

    renderCurrentPage();
  } catch (error) {
    console.error("[Admin] Refresh chat:", error);
    notify(`Unable to refresh chat: ${safeError(error)}`, "error");
  }
}

async function toggleMessageFlag(id) {
  const message = chatCache[id];

  if (!message) {
    notify("Message not found.", "error");
    return;
  }

  const flagged = !(
    message.flagged === true ||
    message.reported === true ||
    message.moderationStatus === "flagged"
  );

  try {
    await update(ref(database, `${ADMIN_CONFIG.CHAT_PATH}/${id}`), {
      flagged,
      moderationStatus: flagged ? "flagged" : "active",
      moderatedAt: Date.now(),
      moderatedBy: currentUID()
    });

    await writeAudit(flagged ? "CHAT_MESSAGE_FLAGGED" : "CHAT_FLAG_CLEARED", {
      messageId: id
    });

    notify(flagged ? "Message flagged." : "Flag cleared.", "success");
  } catch (error) {
    console.error("[Admin] Toggle flag:", error);
    notify(`Unable to update flag: ${safeError(error)}`, "error");
  }
}

async function toggleMessageVisibility(id) {
  const message = chatCache[id];

  if (!message) {
    notify("Message not found.", "error");
    return;
  }

  const hidden =
    message.deleted === true ||
    message.hidden === true ||
    message.moderationStatus === "hidden";

  if (!window.confirm(`Are you sure you want to ${hidden ? "restore" : "hide"} this message?`)) {
    return;
  }

  try {
    await update(ref(database, `${ADMIN_CONFIG.CHAT_PATH}/${id}`), {
      hidden: !hidden,
      deleted: false,
      moderationStatus: hidden ? "active" : "hidden",
      moderatedAt: Date.now(),
      moderatedBy: currentUID()
    });

    await writeAudit(hidden ? "CHAT_MESSAGE_RESTORED" : "CHAT_MESSAGE_HIDDEN", {
      messageId: id
    });

    notify(hidden ? "Message restored." : "Message hidden.", "success");
  } catch (error) {
    console.error("[Admin] Toggle visibility:", error);
    notify(`Unable to moderate message: ${safeError(error)}`, "error");
  }
}

/* ============================================================
   AUDIT LOG
   ============================================================ */

function renderAuditLog() {
  const entries = Object.entries(auditCache)
    .sort((a, b) =>
      timestamp(b[1]?.createdAt || b[1]?.serverCreatedAt) -
      timestamp(a[1]?.createdAt || a[1]?.serverCreatedAt)
    );

  const rows = entries.map(([id, entry]) =>
    tableRow([
      `<div style="font-weight:700;color:#111827;">${escape(entry.action || "Activity")}</div>
       <div style="margin-top:4px;color:#94A3B8;font-size:10px;">${escape(id)}</div>`,
      escape(entry.performedByName || "Unknown"),
      escape(entry.performedBy || "Unknown"),
      `<div style="max-width:320px;overflow-wrap:anywhere;">${escape(JSON.stringify(entry.details || {}))}</div>`,
      escape(dateText(entry.createdAt || entry.serverCreatedAt))
    ])
  );

  return `
    ${sectionHeading("Audit Log", "A reviewable history of administrative actions recorded by the application.", button("Refresh log", "refresh-audit"))}

    ${card(`
      <div style="margin-bottom:16px;padding:13px;background:#F8FAFC;border-radius:11px;color:#64748B;font-size:11px;line-height:1.6;">
        Protect this path with Firebase Rules. Client-side logs alone are not a tamper-proof security record.
      </div>

      ${tableWrapper(["Action", "Administrator", "UID", "Details", "Time"], rows, "No audit events have been recorded yet.")}
    `)}
  `;
}

async function refreshAudit() {
  try {
    auditCache = normalizeRecords(await readPath(ADMIN_CONFIG.AUDIT_PATH, {
      limit: ADMIN_CONFIG.LOG_LIMIT
    }));

    renderCurrentPage();
  } catch (error) {
    console.error("[Admin] Refresh audit:", error);
    notify(`Unable to refresh audit log: ${safeError(error)}`, "error");
  }
}

/* ============================================================
   SYSTEM STATUS
   ============================================================ */

function renderSystemStatus() {
  const online = navigator.onLine;
  const connectionStatus = online ? "Online" : "Offline";
  const connectionColor = online ? "#16A34A" : "#DC2626";
  const authStatus = auth?.currentUser ? "Authenticated" : "Not authenticated";
  const databaseStatus = database ? "Initialized" : "Unavailable";
  const profileStatus = currentProfile ? "Loaded" : "Missing";

  const info = [
    ["Application", "Math Class — Virtual Learning Portal"],
    ["Firebase SDK", "10.5.0"],
    ["Authentication UID", currentUID() || "Not available"],
    ["Profile role", roleOf(currentProfile)],
    ["Database instance", database ? "Available" : "Not available"],
    ["Browser language", navigator.language || "Unknown"],
    ["Browser connectivity", connectionStatus],
    ["Last status check", new Date().toLocaleString()]
  ];

  return `
    ${sectionHeading("System Status", "Check client-side connectivity and initialized services.")}

    <div class="admin-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
      ${card(`
        <div style="color:#64748B;font-size:11px;font-weight:700;">NETWORK</div>
        <div style="margin:12px 0;display:flex;align-items:center;gap:9px;color:${connectionColor};font-size:21px;font-weight:800;">
          <span style="width:10px;height:10px;background:${connectionColor};border-radius:50%;"></span>${connectionStatus}
        </div>
        <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">Online status does not guarantee Firebase is reachable.</p>
      `)}

      ${card(`
        <div style="color:#64748B;font-size:11px;font-weight:700;">FIREBASE AUTH</div>
        <div style="margin:12px 0;color:#111827;font-size:21px;font-weight:800;">${escape(authStatus)}</div>
        <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">Current authentication state.</p>
      `)}

      ${card(`
        <div style="color:#64748B;font-size:11px;font-weight:700;">REALTIME DATABASE</div>
        <div style="margin:12px 0;color:#111827;font-size:21px;font-weight:800;">${escape(databaseStatus)}</div>
        <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">SDK initialization state. Access must be tested separately.</p>
      `)}

      ${card(`
        <div style="color:#64748B;font-size:11px;font-weight:700;">ADMIN PROFILE</div>
        <div style="margin:12px 0;color:#111827;font-size:21px;font-weight:800;">${escape(profileStatus)}</div>
        <p style="margin:0;color:#64748B;font-size:12px;line-height:1.6;">Profile loaded by the main application.</p>
      `)}
    </div>

    <div style="margin-top:18px;">
      ${card(`
        <h3 style="margin:0 0 16px;font-size:16px;">Runtime information</h3>
        ${info.map(([label, value]) => `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:12px 0;border-bottom:1px solid #F1F5F9;">
            <span style="color:#64748B;font-size:12px;">${escape(label)}</span>
            <span style="color:#334155;font-size:12px;font-weight:600;text-align:right;overflow-wrap:anywhere;">${escape(value)}</span>
          </div>
        `).join("")}
        <div style="margin-top:18px;">${button("Refresh status", "refresh-system", { variant: "primary" })}</div>
      `)}
    </div>

    <div style="margin-top:18px;">
      ${card(`
        <h3 style="margin:0 0 8px;font-size:16px;">Security checklist</h3>
        <p style="margin:0 0 14px;color:#64748B;font-size:12px;line-height:1.6;">These are manual verification items, not automated security tests.</p>
        ${[
          "Deny unauthenticated database access.",
          "Restrict role changes to authorized administrators.",
          "Prevent students from reading other students' private doubts.",
          "Restrict file access and upload sizes in Storage Rules.",
          "Prevent ordinary users from modifying chat moderation and audit records."
        ].map(item => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;color:#475569;font-size:12px;line-height:1.6;">
            <span style="color:#D97706;font-weight:800;">○</span><span>${escape(item)}</span>
          </div>
        `).join("")}
      `)}
    </div>
  `;
}

/* ============================================================
   ACTION DISPATCHER
   ============================================================ */

async function handleAction(event) {
  const target = event.target.closest("[data-admin-action]");

  if (!target || target.disabled || disposed) return;

  const action = target.dataset.adminAction;

  try {
    switch (action) {
      case "navigate":
        searchTerm = "";
        navigate(target.dataset.page || "dashboard");
        break;

      case "role-tab":
        activeTab = target.dataset.tab || "all";
        renderCurrentPage();
        break;

      case "edit-role":
        await editUserRole(target.dataset.uid);
        break;

      case "toggle-user":
        await toggleUserStatus(target.dataset.uid);
        break;

      case "refresh-users":
        await refreshUsers();
        break;

      case "refresh-chat":
        await refreshChat();
        break;

      case "toggle-flag":
        await toggleMessageFlag(target.dataset.messageId);
        break;

      case "toggle-message":
        await toggleMessageVisibility(target.dataset.messageId);
        break;

      case "refresh-audit":
        await refreshAudit();
        break;

      case "refresh-system":
        renderCurrentPage();
        notify("System status refreshed.", "success");
        break;

      case "retry":
        await loadAdminData();
        break;

      default:
        console.warn("[Admin] Unknown action:", action);
    }
  } catch (error) {
    console.error("[Admin] Action failed:", error);
    notify(safeError(error), "error");
  }
}

function handleSearchInput(event) {
  if (event.target.id !== "admin-user-search" || disposed) return;

  const selectionStart = event.target.selectionStart;
  const selectionEnd = event.target.selectionEnd;

  searchTerm = event.target.value || "";

  const section = document.getElementById("admin-section-content");

  if (!section || currentPage !== "roles") return;

  section.innerHTML = renderRoleManager();

  const nextInput = document.getElementById("admin-user-search");

  if (nextInput) {
    nextInput.focus();

    try {
      nextInput.setSelectionRange(selectionStart, selectionEnd);
    } catch {
      // Mobile browsers may not support selection ranges for search inputs.
    }
  }
}

/* ============================================================
   DATA INITIALIZATION
   ============================================================ */

async function loadAdminData() {
  if (loading || disposed) return;

  const access = verifyAdmin();

  if (!access.allowed) {
    renderAccessDenied(access.message);
    return;
  }

  loading = true;
  detachListeners();

  usersCache = {};
  chatCache = {};
  auditCache = {};

  currentPage = normalizePage(currentPage);

  setPageContent(adminShell(loadingState("Loading admin data…")));

  try {
    const [users, chat, audit] = await Promise.all([
      readPath(ADMIN_CONFIG.USERS_PATH),
      readPath(ADMIN_CONFIG.CHAT_PATH, { limit: ADMIN_CONFIG.CHAT_LIMIT }),
      readPath(ADMIN_CONFIG.AUDIT_PATH, { limit: ADMIN_CONFIG.LOG_LIMIT })
    ]);

    if (disposed) return;

    usersCache = normalizeRecords(users);
    chatCache = normalizeRecords(chat);
    auditCache = normalizeRecords(audit);

    renderCurrentPage();

    listen(ADMIN_CONFIG.USERS_PATH, (value, error) => {
      if (disposed) return;

      if (error) {
        console.error("[Admin] Users listener:", error);
        notify(`Users update failed: ${safeError(error)}`, "error");
        return;
      }

      usersCache = normalizeRecords(value);
      renderCurrentPage();
    });

    listen(ADMIN_CONFIG.CHAT_PATH, (value, error) => {
      if (disposed) return;

      if (error) {
        console.error("[Admin] Chat listener:", error);
        notify(`Chat update failed: ${safeError(error)}`, "error");
        return;
      }

      chatCache = normalizeRecords(value);
      renderCurrentPage();
    }, { limit: ADMIN_CONFIG.CHAT_LIMIT });

    listen(ADMIN_CONFIG.AUDIT_PATH, (value, error) => {
      if (disposed) return;

      if (error) {
        console.error("[Admin] Audit listener:", error);
        notify(`Audit update failed: ${safeError(error)}`, "error");
        return;
      }

      auditCache = normalizeRecords(value);
      renderCurrentPage();
    }, { limit: ADMIN_CONFIG.LOG_LIMIT });

  } catch (error) {
    console.error("[Admin] Initial data load failed:", error);

    if (!disposed) {
      setPageContent(adminShell(
        errorState(safeError(error), "retry")
      ));
    }
  } finally {
    loading = false;
  }
}

/* ============================================================
   CONNECTIVITY
   ============================================================ */

function handleConnectivityChange() {
  if (!initialized || disposed) return;

  if (!navigator.onLine) {
    notify("Your device is offline. Live updates may be delayed.", "error");
  } else {
    notify("Connection restored.", "success");
  }
}

/* ============================================================
   PUBLIC MODULE API
   ============================================================ */

export async function init(context = {}) {
  cleanup();

  ctx = context;
  auth = context.auth || null;
  database = context.db || context.database || null;
  currentUser = context.user || auth?.currentUser || null;
  currentProfile = context.profile || context.userProfile || null;

  disposed = false;
  initialized = true;
  loading = false;

  addSpinnerStyle();

  pageContainer = document.querySelector(
    "#page-content, #app-content, #main-content, #pageContent, #appView, [data-page-content], main"
  );

  if (!database) {
    setPageContent(`
      <div style="max-width:650px;margin:40px auto;padding:25px;background:#FFFFFF;border:1px solid #FECACA;border-radius:16px;">
        <h2 style="margin-top:0;color:#991B1B;">Database unavailable</h2>
        <p style="color:#64748B;font-size:13px;line-height:1.7;">
          The Admin Panel requires a Firebase Realtime Database instance.
          Check that the main application passes its initialized database
          through the module context.
        </p>
      </div>
    `);

    return;
  }

  pageChangeHandler = event => {
    if (disposed) return;

    const detail = event.detail || {};
    const page = normalizePage(
      detail.page || detail.route || detail.name || ""
    );

    if (ALLOWED_ADMIN_PAGES.includes(page)) {
      currentPage = page;
      renderCurrentPage();
    }
  };

  window.addEventListener("mathclass:pagechange", pageChangeHandler);
  document.addEventListener("click", handleAction);
  document.addEventListener("input", handleSearchInput);
  window.addEventListener("online", handleConnectivityChange);
  window.addEventListener("offline", handleConnectivityChange);

  const access = verifyAdmin();

  if (!access.allowed) {
    renderAccessDenied(access.message);
    return;
  }

  await loadAdminData();
}

export function render(page = "dashboard") {
  currentPage = normalizePage(page);
  renderCurrentPage();
}

export function refresh() {
  return loadAdminData();
}

export function cleanup() {
  disposed = true;
  detachListeners();

  if (pageChangeHandler) {
    window.removeEventListener("mathclass:pagechange", pageChangeHandler);
    pageChangeHandler = null;
  }

  document.removeEventListener("click", handleAction);
  document.removeEventListener("input", handleSearchInput);
  window.removeEventListener("online", handleConnectivityChange);
  window.removeEventListener("offline", handleConnectivityChange);

  initialized = false;
  loading = false;
}

export default {
  init,
  render,
  refresh,
  cleanup
};
