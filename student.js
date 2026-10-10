// ============================================================
// MATH CLASS — STUDENT MODULE
// File: student.js
// Firebase Modular SDK 10.5.0
// ============================================================

import {
  ref,
  get,
  set,
  push,
  update,
  remove,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  onValue,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-auth.js";

import {
  escapeHTML,
  formatDate,
  formatDateTime,
  formatDuration,
  getInitials
} from "./components.js";

// ============================================================
// CONFIGURATION
// ============================================================

const PATHS = Object.freeze({
  users: "users",
  logs: "daily_study_logs",
  announcements: "announcements",
  chat: "class_chat",
  doubts: "direct_doubts"
});

const LIMITS = Object.freeze({
  logs: 500,
  announcements: 200,
  chat: 100,
  doubts: 200,
  chatLength: 1000,
  doubtLength: 3000,
  topicLength: 150,
  remarksLength: 500,
  nameLength: 100,
  requestTimeout: 15000
});

// ============================================================
// STATE
// ============================================================

const state = {
  auth: null,
  db: null,
  storage: null,

  user: null,
  profile: null,

  toast: null,
  showPage: null,

  initialized: false,
  submitting: false,

  currentPage: "dashboard",
  activeDate: new Date().toISOString().slice(0, 10),

  records: [],
  announcements: [],
  chatMessages: [],
  doubts: [],

  unsubscribers: [],
  pageChangeHandler: null,
  authReadyHandler: null,
  delegatedClickHandler: null,
  delegatedSubmitHandler: null
};

// ============================================================
// DOM HELPERS
// ============================================================

const $ = (selector, root = document) =>
  root.querySelector(selector);

const $$ = (selector, root = document) =>
  [...root.querySelectorAll(selector)];

function createElement(tag, className = "", text = "") {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined && text !== null) {
    element.textContent = String(text);
  }

  return element;
}

function setText(selector, value) {
  const element = $(selector);

  if (element) {
    element.textContent = String(value ?? "");
  }
}

function uid() {
  return state.user?.uid || "";
}

function userName() {
  return (
    state.profile?.name ||
    state.profile?.displayName ||
    state.user?.displayName ||
    state.user?.email?.split("@")[0] ||
    "Student"
  );
}

function currentTime() {
  return Date.now();
}

function safeNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.floor(number)));
}

function normalizeRecords(value) {
  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value)
    .filter(([, item]) =>
      item &&
      typeof item === "object" &&
      !Array.isArray(item)
    )
    .map(([key, item]) => ({
      ...item,
      id: item.id || key
    }));
}

function escape(value) {
  if (typeof escapeHTML === "function") {
    return escapeHTML(String(value ?? ""));
  }

  const element = document.createElement("span");
  element.textContent = String(value ?? "");

  return element.innerHTML;
}

// ============================================================
// ERROR HANDLING
// ============================================================

function readableError(error) {
  const code = String(error?.code || "");

  const messages = {
    "PERMISSION_DENIED":
      "Firebase denied access. Check the Realtime Database security rules.",

    "database/permission-denied":
      "You do not have permission to perform this operation.",

    "auth/requires-recent-login":
      "Please sign in again before changing your password.",

    "auth/wrong-password":
      "Your current password is incorrect.",

    "auth/invalid-credential":
      "Your current password is incorrect.",

    "auth/weak-password":
      "Your new password does not meet the password requirements.",

    "auth/network-request-failed":
      "Network error. Check your internet connection.",

    "app/timeout":
      "The request timed out. Check your connection and try again.",

    "app/validation":
      error.message || "Please check the information you entered."
  };

  if (messages[code]) {
    return messages[code];
  }

  if (code.startsWith("auth/")) {
    return "Authentication failed. Please try again.";
  }

  if (code.startsWith("storage/")) {
    return "The file operation failed. Check your Storage configuration and permissions.";
  }

  if (code === "PERMISSION_DENIED") {
    return messages.PERMISSION_DENIED;
  }

  return "Something went wrong. Please try again.";
}

function notify(message, type = "info") {
  if (typeof state.toast === "function") {
    state.toast(message, type);
    return;
  }

  console[type === "error" ? "error" : "log"](message);
}

function reportError(error, operation) {
  console.error(
    `[Math Class Student] ${operation}:`,
    error?.code || "unknown-error"
  );

  notify(
    `${operation}: ${readableError(error)}`,
    "error"
  );
}

function validationError(message) {
  const error = new Error(message);
  error.code = "app/validation";

  return error;
}

// ============================================================
// ASYNC HELPERS
// ============================================================

function withTimeout(
  promise,
  milliseconds = LIMITS.requestTimeout
) {
  let timer;

  return Promise.race([
    Promise.resolve(promise),

    new Promise((_, reject) => {
      timer = window.setTimeout(() => {
        const error = new Error(
          "The operation took too long."
        );

        error.code = "app/timeout";
        reject(error);
      }, milliseconds);
    })
  ]).finally(() => {
    window.clearTimeout(timer);
  });
}

function readValue(path) {
  return withTimeout(
    get(ref(state.db, path))
  );
}

function writeValue(path, value) {
  return withTimeout(
    set(ref(state.db, path), value)
  );
}

function patchValue(path, value) {
  return withTimeout(
    update(ref(state.db, path), value)
  );
}

// ============================================================
// FIREBASE LISTENERS
// ============================================================

function subscribe(
  databaseReference,
  callback,
  onError = null
) {
  if (!state.db) {
    throw new Error(
      "Realtime Database has not been initialized."
    );
  }

  const unsubscribe = onValue(
    databaseReference,

    snapshot => {
      if (!state.initialized) {
        return;
      }

      try {
        callback(snapshot.val(), snapshot);
      } catch (error) {
        reportError(
          error,
          "Could not process updated information"
        );
      }
    },

    error => {
      if (!state.initialized) {
        return;
      }

      if (typeof onError === "function") {
        onError(error);
      } else {
        reportError(
          error,
          "Could not load information"
        );
      }
    }
  );

  state.unsubscribers.push(unsubscribe);

  return unsubscribe;
}

function cleanupListeners() {
  for (const unsubscribe of state.unsubscribers) {
    try {
      unsubscribe();
    } catch (error) {
      console.warn(
        "[Math Class Student] Listener cleanup failed."
      );
    }
  }

  state.unsubscribers = [];
}

// ============================================================
// STYLES
// ============================================================

function injectStyles() {
  if ($("#student-module-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "student-module-styles";

  style.textContent = `
    .student-dashboard {
      display: grid;
      gap: 22px;
      width: 100%;
      min-width: 0;
      color: #111827;
    }

    .student-dashboard[hidden] {
      display: none !important;
    }

    .student-heading {
      margin: 0 0 8px;
      font-size: clamp(24px, 3vw, 32px);
      line-height: 1.2;
      letter-spacing: -.7px;
    }

    .student-subtitle {
      margin: 0;
      color: #64748B;
      font-size: 14px;
      line-height: 1.7;
    }

    .student-welcome {
      padding: 26px;
      border: 1px solid #E2E8F0;
      border-radius: 18px;
      background: #FFFFFF;
    }

    .student-eyebrow {
      margin: 0 0 8px;
      color: #6366F1;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1.2px;
      text-transform: uppercase;
    }

    .student-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }

    .student-stat-card {
      min-width: 0;
      padding: 19px;
      border: 1px solid #E2E8F0;
      border-radius: 14px;
      background: #FFFFFF;
    }

    .student-stat-label {
      margin: 0 0 12px;
      color: #64748B;
      font-size: 13px;
    }

    .student-stat-value {
      overflow-wrap: anywhere;
      color: #111827;
      font-size: 26px;
      font-weight: 750;
    }

    .student-stat-caption {
      margin-top: 6px;
      color: #64748B;
      font-size: 12px;
    }

    .student-section {
      min-width: 0;
      padding: 21px;
      border: 1px solid #E2E8F0;
      border-radius: 15px;
      background: #FFFFFF;
    }

    .student-section-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 18px;
    }

    .student-section-heading h2 {
      margin: 0;
      font-size: 17px;
      font-weight: 750;
    }

    .student-section-heading p {
      margin: 5px 0 0;
      color: #64748B;
      font-size: 13px;
    }

    .student-list {
      display: grid;
      gap: 11px;
    }

    .student-list-item {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      padding: 14px;
      border: 1px solid #E2E8F0;
      border-radius: 11px;
      background: #FFFFFF;
    }

    .student-list-item h3 {
      margin: 0 0 6px;
      font-size: 14px;
    }

    .student-list-item p {
      margin: 0;
      color: #64748B;
      font-size: 13px;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }

    .student-form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .student-form-field {
      display: grid;
      gap: 7px;
      min-width: 0;
    }

    .student-form-field label {
      color: #334155;
      font-size: 13px;
      font-weight: 650;
    }

    .student-form-field input,
    .student-form-field select,
    .student-form-field textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 43px;
      padding: 11px 12px;
      border: 1px solid #CBD5E1;
      border-radius: 9px;
      background: #FFFFFF;
      color: #111827;
      font: inherit;
      font-size: 14px;
    }

    .student-form-field textarea {
      min-height: 95px;
      resize: vertical;
    }

    .student-form-field input:focus,
    .student-form-field select:focus,
    .student-form-field textarea:focus {
      outline: 2px solid #C7D2FE;
      border-color: #6366F1;
    }

    .student-form-full {
      grid-column: 1 / -1;
    }

    .student-form-actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 18px;
    }

    .mc-button {
      min-height: 40px;
      padding: 10px 15px;
      border: 1px solid transparent;
      border-radius: 9px;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      font-weight: 650;
    }

    .mc-button:disabled {
      cursor: not-allowed;
      opacity: .6;
    }

    .mc-button-primary {
      background: #4F46E5;
      color: #FFFFFF;
    }

    .mc-button-secondary {
      border-color: #CBD5E1;
      background: #FFFFFF;
      color: #334155;
    }

    .mc-button-danger {
      background: #B91C1C;
      color: #FFFFFF;
    }

    .student-progress-track {
      height: 8px;
      overflow: hidden;
      border-radius: 99px;
      background: #E2E8F0;
    }

    .student-progress-fill {
      height: 100%;
      border-radius: inherit;
      background: #4F46E5;
      transition: width .25s ease;
    }

    .student-badge {
      display: inline-flex;
      align-items: center;
      padding: 5px 9px;
      border-radius: 99px;
      background: #EEF2FF;
      color: #4338CA;
      font-size: 11px;
      font-weight: 700;
    }

    .student-empty {
      padding: 25px 14px;
      text-align: center;
      color: #64748B;
      font-size: 13px;
      line-height: 1.7;
    }

    .student-announcement {
      padding: 17px;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      background: #FFFFFF;
    }

    .student-announcement h3 {
      margin: 0 0 8px;
      font-size: 15px;
    }

    .student-announcement p {
      margin: 0;
      color: #475569;
      font-size: 13px;
      line-height: 1.7;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    .student-chat {
      display: grid;
      gap: 13px;
    }

    .student-chat-messages {
      display: flex;
      flex-direction: column;
      min-height: 250px;
      max-height: 430px;
      gap: 10px;
      overflow-y: auto;
      padding: 13px;
      border: 1px solid #E2E8F0;
      border-radius: 11px;
      background: #F8FAFC;
    }

    .student-chat-message {
      max-width: 90%;
      align-self: flex-start;
      padding: 11px 13px;
      border: 1px solid #E2E8F0;
      border-radius: 11px;
      background: #FFFFFF;
      overflow-wrap: anywhere;
    }

    .student-chat-message.mine {
      align-self: flex-end;
      border-color: #C7D2FE;
      background: #EEF2FF;
    }

    .student-chat-meta {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 6px;
      color: #64748B;
      font-size: 11px;
    }

    .student-chat-body {
      white-space: pre-wrap;
      color: #334155;
      font-size: 14px;
      line-height: 1.6;
    }

    .student-chat-compose {
      display: flex;
      align-items: stretch;
      gap: 9px;
    }

    .student-chat-compose textarea {
      box-sizing: border-box;
      flex: 1;
      min-width: 0;
      min-height: 45px;
      max-height: 130px;
      padding: 11px;
      border: 1px solid #CBD5E1;
      border-radius: 9px;
      font: inherit;
      resize: vertical;
    }

    .student-muted {
      color: #64748B;
      font-size: 12px;
    }

    .student-error {
      padding: 12px;
      border: 1px solid #FECACA;
      border-radius: 9px;
      background: #FEF2F2;
      color: #991B1B;
      font-size: 13px;
    }

    @media (max-width: 900px) {
      .student-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 560px) {
      .student-form-grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .student-form-full {
        grid-column: auto;
      }

      .student-section,
      .student-welcome {
        padding: 16px;
      }

      .student-chat-compose {
        flex-direction: column;
      }

      .student-chat-compose .mc-button {
        width: 100%;
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================
// ELEMENT BUILDERS
// ============================================================

function makeButton(label, action, variant = "primary") {
  const button = createElement(
    "button",
    `mc-button mc-button-${variant}`,
    label
  );

  button.type = "button";

  if (typeof action === "function") {
    button.addEventListener("click", action);
  }

  return button;
}

function makeField(labelText, name, type = "text", options = {}) {
  const wrapper = createElement(
    "div",
    "student-form-field"
  );

  const label = createElement("label", "", labelText);
  label.htmlFor = `student-${name}`;

  let field;

  if (type === "textarea") {
    field = document.createElement("textarea");
    field.rows = options.rows || 3;
  } else if (type === "select") {
    field = document.createElement("select");

    for (const option of options.options || []) {
      const item = document.createElement("option");
      item.value = option.value;
      item.textContent = option.label;

      field.appendChild(item);
    }
  } else {
    field = document.createElement("input");
    field.type = type;
  }

  field.id = `student-${name}`;
  field.name = name;
  field.required = Boolean(options.required);

  if (options.min !== undefined) {
    field.min = options.min;
  }

  if (options.max !== undefined) {
    field.max = options.max;
  }

  if (options.maxLength !== undefined) {
    field.maxLength = options.maxLength;
  }

  if (options.placeholder) {
    field.placeholder = options.placeholder;
  }

  if (options.accept) {
    field.accept = options.accept;
  }

  wrapper.append(label, field);

  return { wrapper, field };
}

function makeSection(title, description = "") {
  const section = createElement(
    "section",
    "student-section"
  );

  const heading = createElement(
    "div",
    "student-section-heading"
  );

  const group = document.createElement("div");

  group.appendChild(
    createElement("h2", "", title)
  );

  if (description) {
    group.appendChild(
      createElement("p", "", description)
    );
  }

  heading.appendChild(group);
  section.appendChild(heading);

  return { section, heading };
}

function pageContainer(page, title, description = "") {
  let section = $(`[data-page="${page}"]`);

  if (!section) {
    const parent =
      $("#appView") ||
      $("#pageContent") ||
      $("#mainContent") ||
      $("#dashboardView") ||
      $("main");

    if (!parent) {
      throw new Error(
        "The application content container was not found."
      );
    }

    section = createElement(
      "section",
      "student-dashboard"
    );

    section.dataset.page = page;
    section.hidden = true;

    parent.appendChild(section);
  }

  section.classList.add("student-dashboard");

  section.replaceChildren();

  section.append(
    createElement("h1", "student-heading", title),
    createElement("p", "student-subtitle", description)
  );

  return section;
}

function renderEmpty(container, message) {
  container.replaceChildren(
    createElement("div", "student-empty", message)
  );
}

function createListItem(title, description, metadata = "") {
  const item = createElement(
    "article",
    "student-list-item"
  );

  const content = document.createElement("div");

  content.append(
    createElement("h3", "", title),
    createElement("p", "", description)
  );

  item.appendChild(content);

  if (metadata) {
    item.appendChild(
      createElement("span", "student-badge", metadata)
    );
  }

  return item;
}

// ============================================================
// STUDY STATISTICS
// ============================================================

function getStatistics() {
  const totalMinutes = state.records.reduce(
    (total, record) =>
      total + safeNumber(record.minutes, 0, 1440),
    0
  );

  const today = state.activeDate;

  const todayMinutes = state.records
    .filter(record => {
      const date = String(
        record.date ||
        record.studyDate ||
        ""
      ).slice(0, 10);

      return date === today;
    })
    .reduce(
      (total, record) =>
        total + safeNumber(record.minutes, 0, 1440),
      0
    );

  const subjects = new Set(
    state.records
      .map(record => String(record.subject || "").trim())
      .filter(Boolean)
  );

  const completedSessions = state.records.length;

  return {
    totalMinutes,
    todayMinutes,
    subjects: subjects.size,
    completedSessions
  };
}

// ============================================================
// DASHBOARD
// ============================================================

function renderDashboard() {
  const section = pageContainer(
    "dashboard",
    `Welcome back, ${userName()}`,
    "Your personal space to practise, improve, and track your mathematics journey."
  );

  const welcome = createElement(
    "section",
    "student-welcome"
  );

  welcome.append(
    createElement("p", "student-eyebrow", "Your learning overview"),
    createElement("h2", "student-heading", "Make today count"),
    createElement(
      "p",
      "student-subtitle",
      "Record your study sessions, review your progress, and stay connected with your class."
    )
  );

  const stats = getStatistics();

  const statGrid = createElement(
    "div",
    "student-stats"
  );

  const statItems = [
    [
      "Study time",
      formatDuration(stats.totalMinutes),
      "All recorded sessions"
    ],
    [
      "Today's study",
      formatDuration(stats.todayMinutes),
      "Time recorded today"
    ],
    [
      "Subjects",
      stats.subjects,
      "Subjects studied"
    ],
    [
      "Sessions",
      stats.completedSessions,
      "Recorded sessions"
    ]
  ];

  for (const [label, value, caption] of statItems) {
    const card = createElement(
      "article",
      "student-stat-card"
    );

    card.append(
      createElement("p", "student-stat-label", label),
      createElement("div", "student-stat-value", value),
      createElement("div", "student-stat-caption", caption)
    );

    statGrid.appendChild(card);
  }

  const quickActions = makeSection(
    "Quick actions",
    "Continue learning with these shortcuts."
  );

  const actionGrid = createElement(
    "div",
    "student-form-actions"
  );

  actionGrid.append(
    makeButton(
      "Log study session",
      () => navigate("tracker")
    ),
    makeButton(
      "View study history",
      () => navigate("history"),
      "secondary"
    ),
    makeButton(
      "Ask a doubt",
      () => navigate("doubts"),
      "secondary"
    )
  );

  quickActions.section.appendChild(actionGrid);

  const recent = makeSection(
    "Recent study sessions",
    "Your latest recorded activities."
  );

  const recentList = createElement(
    "div",
    "student-list"
  );

  if (state.records.length === 0) {
    renderEmpty(
      recentList,
      "You have not recorded a study session yet. Start with your first session!"
    );
  } else {
    state.records
      .slice(0, 5)
      .forEach(record => {
        recentList.appendChild(
          createListItem(
            record.subject || "Study session",
            `${record.topic || "No topic specified"} · ${
              formatDuration(
                safeNumber(record.minutes)
              )
            }`,
            record.date || ""
          )
        );
      });
  }

  recent.section.appendChild(recentList);

  const announcements = makeSection(
    "Latest announcements",
    "Updates from your classroom."
  );

  const announcementList = createElement(
    "div",
    "student-list"
  );

  if (state.announcements.length === 0) {
    renderEmpty(
      announcementList,
      "There are no announcements to display."
    );
  } else {
    state.announcements
      .slice(0, 3)
      .forEach(item => {
        announcementList.appendChild(
          createListItem(
            item.title || "Announcement",
            item.message || item.content || "",
            item.category || "Update"
          )
        );
      });
  }

  announcements.section.appendChild(announcementList);

  section.append(
    welcome,
    statGrid,
    quickActions.section,
    recent.section,
    announcements.section
  );
}

// ============================================================
// STUDY TRACKER
// ============================================================

function renderTracker() {
  const section = pageContainer(
    "tracker",
    "Study Tracker",
    "Record your daily study sessions and keep track of your effort."
  );

  const formSection = makeSection(
    "Record a study session",
    "Enter the details of the session you completed."
  );

  const form = document.createElement("form");
  form.id = "studentStudyForm";
  form.noValidate = true;

  const grid = createElement(
    "div",
    "student-form-grid"
  );

  const date = makeField(
    "Study date",
    "date",
    "date",
    {
      required: true
    }
  );

  date.field.value = state.activeDate;
  date.field.max = new Date().toISOString().slice(0, 10);

  const subject = makeField(
    "Subject",
    "subject",
    "select",
    {
      required: true,
      options: [
        { value: "", label: "Choose a subject" },
        { value: "Mathematics", label: "Mathematics" },
        { value: "Science", label: "Science" },
        { value: "English", label: "English" },
        { value: "Social Science", label: "Social Science" },
        { value: "Hindi", label: "Hindi" },
        { value: "Other", label: "Other" }
      ]
    }
  );

  const minutes = makeField(
    "Study duration (minutes)",
    "minutes",
    "number",
    {
      required: true,
      min: 1,
      max: 1440,
      placeholder: "e.g. 45"
    }
  );

  const topic = makeField(
    "Topic studied",
    "topic",
    "text",
    {
      required: true,
      maxLength: LIMITS.topicLength,
      placeholder: "e.g. Quadratic equations"
    }
  );

  const notes = makeField(
    "Notes (optional)",
    "notes",
    "textarea",
    {
      maxLength: LIMITS.remarksLength,
      placeholder: "What did you practise or learn?"
    }
  );

  notes.wrapper.classList.add("student-form-full");

  grid.append(
    date.wrapper,
    subject.wrapper,
    minutes.wrapper,
    topic.wrapper,
    notes.wrapper
  );

  const actions = createElement(
    "div",
    "student-form-actions"
  );

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "mc-button mc-button-primary";
  submit.textContent = "Save study session";

  actions.appendChild(submit);
  form.append(grid, actions);
  formSection.section.appendChild(form);

  const recentSection = makeSection(
    "Recent sessions",
    "The most recent entries from your study tracker."
  );

  const list = createElement(
    "div",
    "student-list"
  );

  const recentRecords = state.records.slice(0, 8);

  if (recentRecords.length === 0) {
    renderEmpty(list, "Your study sessions will appear here.");
  } else {
    for (const record of recentRecords) {
      list.appendChild(
        createListItem(
          record.subject || "Study session",
          `${record.topic || "No topic"} · ${formatDuration(
            safeNumber(record.minutes)
          )}`,
          record.date || ""
        )
      );
    }
  }

  recentSection.section.appendChild(list);

  section.append(
    formSection.section,
    recentSection.section
  );
}

async function handleStudySubmit(event) {
  event.preventDefault();

  const form = event.target;

  if (
    !(form instanceof HTMLFormElement) ||
    form.id !== "studentStudyForm"
  ) {
    return;
  }

  if (state.submitting) {
    return;
  }

  const formData = new FormData(form);

  const date = String(formData.get("date") || "");
  const subject = String(formData.get("subject") || "").trim();
  const minutes = safeNumber(formData.get("minutes"), 0, 1440);
  const topic = String(formData.get("topic") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  const today = new Date().toISOString().slice(0, 10);

  if (!date || date > today) {
    notify("Choose a valid study date.", "error");
    return;
  }

  if (!subject) {
    notify("Choose a subject.", "error");
    return;
  }

  if (minutes < 1 || minutes > 1440) {
    notify("Study duration must be between 1 and 1440 minutes.", "error");
    return;
  }

  if (!topic || topic.length > LIMITS.topicLength) {
    notify(
      `The topic is required and must be no longer than ${LIMITS.topicLength} characters.`,
      "error"
    );
    return;
  }

  if (notes.length > LIMITS.remarksLength) {
    notify("Your notes are too long.", "error");
    return;
  }

  state.submitting = true;

  const button = $('button[type="submit"]', form);

  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }

  try {
    const logRef = push(
      ref(state.db, PATHS.logs)
    );

    const record = {
      uid: uid(),
      subject,
      date,
      minutes,
      topic,
      notes,
      createdAt: currentTime(),
      updatedAt: currentTime()
    };

    await withTimeout(
      set(logRef, record)
    );

    state.activeDate = date;

    form.reset();

    notify("Study session saved successfully.", "success");

  } catch (error) {
    reportError(error, "Could not save study session");
  } finally {
    state.submitting = false;

    if (button) {
      button.disabled = false;
      button.textContent = "Save study session";
    }
  }
}

// ============================================================
// STUDY HISTORY
// ============================================================

function renderHistory() {
  const section = pageContainer(
    "history",
    "Study History",
    "Review your recorded sessions and see how your study habits develop."
  );

  const stats = getStatistics();

  const overview = makeSection(
    "Your progress",
    "Summary of the sessions currently available."
  );

  const grid = createElement(
    "div",
    "student-stats"
  );

  const values = [
    ["Total sessions", stats.completedSessions],
    ["Total study time", formatDuration(stats.totalMinutes)],
    ["Today's study", formatDuration(stats.todayMinutes)],
    ["Subjects studied", stats.subjects]
  ];

  for (const [label, value] of values) {
    const card = createElement(
      "article",
      "student-stat-card"
    );

    card.append(
      createElement("p", "student-stat-label", label),
      createElement("div", "student-stat-value", value)
    );

    grid.appendChild(card);
  }

  overview.section.appendChild(grid);

  const sessions = makeSection(
    "All study sessions",
    "Your latest recorded sessions appear first."
  );

  const list = createElement(
    "div",
    "student-list"
  );

  if (state.records.length === 0) {
    renderEmpty(
      list,
      "No study history is available yet."
    );
  } else {
    for (const record of state.records) {
      const item = createListItem(
        record.subject || "Study session",
        `${record.topic || "No topic"} · ${
          formatDuration(safeNumber(record.minutes))
        }${record.notes ? ` · ${record.notes}` : ""}`,
        record.date || ""
      );

      if (record.uid === uid()) {
        item.appendChild(
          makeButton(
            "Delete",
            () => deleteStudyRecord(record.id),
            "danger"
          )
        );
      }

      list.appendChild(item);
    }
  }

  sessions.section.appendChild(list);

  section.append(
    overview.section,
    sessions.section
  );
}

async function deleteStudyRecord(id) {
  if (!id) {
    return;
  }

  const confirmed = window.confirm(
    "Delete this study session? This action cannot be undone."
  );

  if (!confirmed) {
    return;
  }

  const record = state.records.find(
    item => item.id === id
  );

  if (!record || record.uid !== uid()) {
    notify(
      "You cannot delete this study session.",
      "error"
    );

    return;
  }

  try {
    await withTimeout(
      remove(ref(state.db, `${PATHS.logs}/${id}`))
    );

    notify("Study session deleted.", "success");

  } catch (error) {
    reportError(error, "Could not delete study session");
  }
}

// ============================================================
// ANNOUNCEMENTS
// ============================================================

function renderAnnouncements() {
  const section = pageContainer(
    "announcements",
    "Announcements",
    "Stay informed about updates from your classroom."
  );

  const listSection = makeSection(
    "Classroom updates",
    "Published announcements are shown below."
  );

  const list = createElement(
    "div",
    "student-list"
  );

  if (state.announcements.length === 0) {
    renderEmpty(
      list,
      "There are no published announcements yet."
    );
  } else {
    for (const item of state.announcements) {
      const card = createElement(
        "article",
        "student-announcement"
      );

      const title = createElement(
        "h3",
        "",
        item.title || "Classroom announcement"
      );

      const body = createElement(
        "p",
        "",
        item.message || item.content || ""
      );

      const metadata = createElement(
        "p",
        "student-muted",
        [
          item.category || "Announcement",
          item.createdAt
            ? formatDateTime(item.createdAt)
            : ""
        ].filter(Boolean).join(" · ")
      );

      card.append(title, body, metadata);
      list.appendChild(card);
    }
  }

  listSection.section.appendChild(list);
  section.appendChild(listSection.section);
}

// ============================================================
// CLASS CHAT
// ============================================================

function renderChatMessage(message) {
  const mine = message.uid === uid();

  const card = createElement(
    "article",
    `student-chat-message${mine ? " mine" : ""}`
  );

  const meta = createElement(
    "div",
    "student-chat-meta"
  );

  meta.append(
    createElement(
      "span",
      "",
      mine ? "You" : message.name || "Class member"
    ),
    createElement(
      "span",
      "",
      message.createdAt
        ? formatDateTime(message.createdAt)
        : ""
    )
  );

  const body = createElement(
    "div",
    "student-chat-body",
    message.message || ""
  );

  card.append(meta, body);

  return card;
}

function renderChat() {
  const section = pageContainer(
    "chat",
    "Class Chat",
    "Communicate with your class using the shared classroom chat."
  );

  const chatSection = makeSection(
    "Classroom conversation",
    "Keep messages respectful and related to learning."
  );

  const chat = createElement(
    "div",
    "student-chat"
  );

  const messages = createElement(
    "div",
    "student-chat-messages"
  );

  messages.id = "studentChatMessages";
  messages.setAttribute("aria-live", "polite");

  if (state.chatMessages.length === 0) {
    renderEmpty(
      messages,
      "No messages yet. Start a conversation with your class."
    );
  } else {
    state.chatMessages.forEach(message => {
      messages.appendChild(
        renderChatMessage(message)
      );
    });
  }

  const form = document.createElement("form");
  form.id = "studentChatForm";
  form.className = "student-chat-compose";

  const input = document.createElement("textarea");

  input.name = "message";
  input.maxLength = LIMITS.chatLength;
  input.required = true;
  input.placeholder = "Write a message...";
  input.setAttribute("aria-label", "Chat message");

  const send = document.createElement("button");

  send.type = "submit";
  send.className = "mc-button mc-button-primary";
  send.textContent = "Send";

  form.append(input, send);
  chat.append(messages, form);

  chatSection.section.appendChild(chat);
  section.appendChild(chatSection.section);

  // Scroll only after the chat UI is inserted into the document.
  requestAnimationFrame(() => {
    if (messages.isConnected) {
      messages.scrollTop = messages.scrollHeight;
    }
  });
}

async function handleChatSubmit(event) {
  event.preventDefault();

  const form = event.target;

  if (
    !(form instanceof HTMLFormElement) ||
    form.id !== "studentChatForm"
  ) {
    return;
  }

  if (state.submitting) {
    return;
  }

  const input = $('textarea[name="message"]', form);
  const message = String(input?.value || "").trim();

  if (!message) {
    notify("Write a message before sending.", "error");
    return;
  }

  if (message.length > LIMITS.chatLength) {
    notify("Your message is too long.", "error");
    return;
  }

  state.submitting = true;

  const button = $('button[type="submit"]', form);

  if (button) {
    button.disabled = true;
    button.textContent = "Sending...";
  }

  try {
    const messageRef = push(
      ref(state.db, PATHS.chat)
    );

    await withTimeout(
      set(messageRef, {
        uid: uid(),
        name: userName(),
        message,
        createdAt: currentTime(),
        deleted: false
      })
    );

    input.value = "";

  } catch (error) {
    reportError(error, "Could not send your message");
  } finally {
    state.submitting = false;

    if (button) {
      button.disabled = false;
      button.textContent = "Send";
    }
  }
}

// ============================================================
// DOUBTS
// ============================================================

function renderDoubts() {
  const section = pageContainer(
    "doubts",
    "Ask a Doubt",
    "Submit a question and review the status of your previous questions."
  );

  const formSection = makeSection(
    "Submit a question",
    "Describe the topic you need help understanding."
  );

  const form = document.createElement("form");
  form.id = "studentDoubtForm";
  form.noValidate = true;

  const grid = createElement(
    "div",
    "student-form-grid"
  );

  const subject = makeField(
    "Subject",
    "doubtSubject",
    "select",
    {
      required: true,
      options: [
        { value: "", label: "Choose a subject" },
        { value: "Mathematics", label: "Mathematics" },
        { value: "Science", label: "Science" },
        { value: "English", label: "English" },
        { value: "Social Science", label: "Social Science" },
        { value: "Hindi", label: "Hindi" },
        { value: "Other", label: "Other" }
      ]
    }
  );

  const title = makeField(
    "Question title",
    "doubtTitle",
    "text",
    {
      required: true,
      maxLength: 150,
      placeholder: "Briefly describe your question"
    }
  );

  const details = makeField(
    "Question details",
    "doubtDetails",
    "textarea",
    {
      required: true,
      maxLength: LIMITS.doubtLength,
      placeholder: "Explain what you are finding difficult..."
    }
  );

  details.wrapper.classList.add("student-form-full");

  grid.append(
    subject.wrapper,
    title.wrapper,
    details.wrapper
  );

  const actions = createElement(
    "div",
    "student-form-actions"
  );

  const submit = document.createElement("button");

  submit.type = "submit";
  submit.className = "mc-button mc-button-primary";
  submit.textContent = "Submit question";

  actions.appendChild(submit);
  form.append(grid, actions);

  formSection.section.appendChild(form);

  const historySection = makeSection(
    "My questions",
    "Track your submitted questions and replies."
  );

  const list = createElement(
    "div",
    "student-list"
  );

  if (state.doubts.length === 0) {
    renderEmpty(
      list,
      "You have not submitted any questions yet."
    );
  } else {
    for (const doubt of state.doubts) {
      const item = createElement(
        "article",
        "student-list-item"
      );

      const content = document.createElement("div");

      content.append(
        createElement(
          "h3",
          "",
          doubt.title || "Question"
        ),
        createElement(
          "p",
          "",
          `${doubt.subject || "General"} · ${
            doubt.details || doubt.message || ""
          }`
        )
      );

      if (doubt.reply) {
        content.appendChild(
          createElement(
            "p",
            "",
            `Reply: ${doubt.reply}`
          )
        );
      }

      item.append(
        content,
        createElement(
          "span",
          "student-badge",
          doubt.status || "Submitted"
        )
      );

      list.appendChild(item);
    }
  }

  historySection.section.appendChild(list);

  section.append(
    formSection.section,
    historySection.section
  );
}

async function handleDoubtSubmit(event) {
  event.preventDefault();

  const form = event.target;

  if (
    !(form instanceof HTMLFormElement) ||
    form.id !== "studentDoubtForm"
  ) {
    return;
  }

  if (state.submitting) {
    return;
  }

  const formData = new FormData(form);

  const subject = String(
    formData.get("doubtSubject") || ""
  ).trim();

  const title = String(
    formData.get("doubtTitle") || ""
  ).trim();

  const details = String(
    formData.get("doubtDetails") || ""
  ).trim();

  if (!subject || !title || !details) {
    notify("Complete all required fields.", "error");
    return;
  }

  if (title.length > 150) {
    notify("The question title is too long.", "error");
    return;
  }

  if (details.length > LIMITS.doubtLength) {
    notify("Your question is too long.", "error");
    return;
  }

  state.submitting = true;

  const button = $('button[type="submit"]', form);

  if (button) {
    button.disabled = true;
    button.textContent = "Submitting...";
  }

  try {
    const doubtRef = push(
      ref(state.db, PATHS.doubts)
    );

    await withTimeout(
      set(doubtRef, {
        uid: uid(),
        name: userName(),
        email: state.user?.email || "",
        subject,
        title,
        details,
        status: "Submitted",
        reply: "",
        createdAt: currentTime(),
        updatedAt: currentTime()
      })
    );

    form.reset();

    notify(
      "Your question has been submitted.",
      "success"
    );

  } catch (error) {
    reportError(error, "Could not submit your question");
  } finally {
    state.submitting = false;

    if (button) {
      button.disabled = false;
      button.textContent = "Submit question";
    }
  }
}

// ============================================================
// PROFILE
// ============================================================

function renderProfile() {
  const section = pageContainer(
    "profile",
    "My Profile",
    "Manage your personal account information."
  );

  const details = makeSection(
    "Account information",
    "Your email address is managed by Firebase Authentication."
  );

  const form = document.createElement("form");
  form.id = "studentProfileForm";
  form.noValidate = true;

  const grid = createElement(
    "div",
    "student-form-grid"
  );

  const name = makeField(
    "Display name",
    "profileName",
    "text",
    {
      required: true,
      maxLength: LIMITS.nameLength
    }
  );

  name.field.value = userName();

  const email = makeField(
    "Email address",
    "profileEmail",
    "email"
  );

  email.field.value = state.user?.email || "";
  email.field.disabled = true;

  const uidField = makeField(
    "Account UID",
    "profileUid",
    "text"
  );

  uidField.field.value = uid();
  uidField.field.readOnly = true;

  grid.append(
    name.wrapper,
    email.wrapper,
    uidField.wrapper
  );

  const actions = createElement(
    "div",
    "student-form-actions"
  );

  const save = document.createElement("button");

  save.type = "submit";
  save.className = "mc-button mc-button-primary";
  save.textContent = "Save profile";

  const passwordButton = makeButton(
    "Change password",
    openPasswordChange,
    "secondary"
  );

  actions.append(save, passwordButton);
  form.append(grid, actions);

  details.section.appendChild(form);
  section.appendChild(details.section);
}

async function handleProfileSubmit(event) {
  event.preventDefault();

  const form = event.target;

  if (
    !(form instanceof HTMLFormElement) ||
    form.id !== "studentProfileForm"
  ) {
    return;
  }

  if (state.submitting) {
    return;
  }

  const name = String(
    new FormData(form).get("profileName") || ""
  ).trim();

  if (name.length < 2 || name.length > LIMITS.nameLength) {
    notify(
      `Your display name must contain 2–${LIMITS.nameLength} characters.`,
      "error"
    );

    return;
  }

  state.submitting = true;

  const button = $('button[type="submit"]', form);

  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }

  try {
    await withTimeout(
      updateProfile(state.user, {
        displayName: name
      })
    );

    await patchValue(
      `${PATHS.users}/${uid()}`,
      {
        name,
        displayName: name,
        updatedAt: currentTime()
      }
    );

    state.profile = {
      ...state.profile,
      name,
      displayName: name
    };

    notify("Your profile has been updated.", "success");

    renderProfile();

  } catch (error) {
    reportError(error, "Could not update your profile");
  } finally {
    state.submitting = false;

    if (button) {
      button.disabled = false;
      button.textContent = "Save profile";
    }
  }
}

// ============================================================
// PASSWORD CHANGE
// ============================================================

function openPasswordChange() {
  const form = document.createElement("form");
  form.id = "studentPasswordForm";
  form.noValidate = true;

  const grid = createElement(
    "div",
    "student-form-grid"
  );

  const current = makeField(
    "Current password",
    "currentPassword",
    "password",
    {
      required: true
    }
  );

  const next = makeField(
    "New password",
    "newPassword",
    "password",
    {
      required: true,
      min: 8,
      maxLength: 128
    }
  );

  const confirm = makeField(
    "Confirm new password",
    "confirmPassword",
    "password",
    {
      required: true,
      maxLength: 128
    }
  );

  grid.append(
    current.wrapper,
    next.wrapper,
    confirm.wrapper
  );

  const actions = createElement(
    "div",
    "student-form-actions"
  );

  const submit = document.createElement("button");

  submit.type = "submit";
  submit.className = "mc-button mc-button-primary";
  submit.textContent = "Update password";

  actions.appendChild(submit);
  form.append(grid, actions);

  const container =
    $("#appView") ||
    $("#pageContent") ||
    $("#mainContent");

  if (!container) {
    notify("The password form could not be opened.", "error");
    return;
  }

  let panel = $("#studentPasswordPanel");

  if (!panel) {
    panel = createElement(
      "section",
      "student-section"
    );

    panel.id = "studentPasswordPanel";
    container.appendChild(panel);
  }

  panel.replaceChildren(
    createElement(
      "h2",
      "",
      "Change password"
    ),
    form
  );

  panel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function handlePasswordSubmit(event) {
  event.preventDefault();

  const form = event.target;

  if (
    !(form instanceof HTMLFormElement) ||
    form.id !== "studentPasswordForm"
  ) {
    return;
  }

  if (state.submitting) {
    return;
  }

  const data = new FormData(form);

  const current = String(
    data.get("currentPassword") || ""
  );

  const next = String(
    data.get("newPassword") || ""
  );

  const confirm = String(
    data.get("confirmPassword") || ""
  );

  if (!current || next.length < 8) {
    notify(
      "Enter your current password and a new password of at least 8 characters.",
      "error"
    );

    return;
  }

  if (next !== confirm) {
    notify("The new passwords do not match.", "error");
    return;
  }

  if (next === current) {
    notify(
      "Your new password must differ from your current password.",
      "error"
    );

    return;
  }

  state.submitting = true;

  const button = $('button[type="submit"]', form);

  if (button) {
    button.disabled = true;
    button.textContent = "Updating...";
  }

  try {
    if (!state.user?.email) {
      throw new Error(
        "An email/password account is required to change the password."
      );
    }

    const credential = EmailAuthProvider.credential(
      state.user.email,
      current
    );

    await withTimeout(
      reauthenticateWithCredential(
        state.user,
        credential
      )
    );

    await withTimeout(
      updatePassword(state.user, next)
    );

    form.reset();

    notify("Your password has been changed.", "success");

  } catch (error) {
    reportError(error, "Could not change password");
  } finally {
    state.submitting = false;

    if (button) {
      button.disabled = false;
      button.textContent = "Update password";
    }
  }
}

// ============================================================
// DATABASE SUBSCRIPTIONS
// ============================================================

function loadStudyLogs() {
  const logsQuery = query(
    ref(state.db, PATHS.logs),
    orderByChild("uid"),
    equalTo(uid()),
    limitToLast(LIMITS.logs)
  );

  subscribe(
    logsQuery,

    value => {
      state.records = normalizeRecords(value)
        .filter(record => record.uid === uid())
        .sort(
          (a, b) =>
            safeNumber(b.createdAt) -
            safeNumber(a.createdAt)
        );

      renderCurrentPage();
    },

    error => {
      reportError(error, "Could not load study history");
    }
  );
}

function loadAnnouncements() {
  const announcementsQuery = query(
    ref(state.db, PATHS.announcements),
    orderByChild("published"),
    equalTo(true),
    limitToLast(LIMITS.announcements)
  );

  subscribe(
    announcementsQuery,

    value => {
      state.announcements = normalizeRecords(value)
        .filter(item => item.published === true)
        .sort(
          (a, b) =>
            safeNumber(b.createdAt) -
            safeNumber(a.createdAt)
        );

      renderCurrentPage();
    },

    error => {
      reportError(error, "Could not load announcements");
    }
  );
}

function loadClassChat() {
  const chatQuery = query(
    ref(state.db, PATHS.chat),
    limitToLast(LIMITS.chat)
  );

  subscribe(
    chatQuery,

    value => {
      state.chatMessages = normalizeRecords(value)
        .filter(message => message.deleted !== true)
        .sort(
          (a, b) =>
            safeNumber(a.createdAt) -
            safeNumber(b.createdAt)
        )
        .slice(-LIMITS.chat);

      if (state.currentPage === "chat") {
        renderChat();
      }
    },

    error => {
      reportError(error, "Could not load class chat");
    }
  );
}

function loadDoubts() {
  const doubtsQuery = query(
    ref(state.db, PATHS.doubts),
    orderByChild("uid"),
    equalTo(uid()),
    limitToLast(LIMITS.doubts)
  );

  subscribe(
    doubtsQuery,

    value => {
      state.doubts = normalizeRecords(value)
        .filter(doubt => doubt.uid === uid())
        .sort(
          (a, b) =>
            safeNumber(b.createdAt) -
            safeNumber(a.createdAt)
        );

      if (state.currentPage === "doubts") {
        renderDoubts();
      }
    },

    error => {
      reportError(error, "Could not load your questions");
    }
  );
}

// ============================================================
// PAGE NAVIGATION
// ============================================================

function normalizePage(page) {
  const aliases = {
    "study-tracker": "tracker",
    "study-history": "history",
    "class-chat": "chat",
    "doubt-inbox": "doubts"
  };

  const normalized = String(page || "dashboard")
    .replace(/^#/, "")
    .trim()
    .toLowerCase();

  return aliases[normalized] || normalized || "dashboard";
}

function navigate(page) {
  const normalized = normalizePage(page);

  state.currentPage = normalized;

  if (typeof state.showPage === "function") {
    state.showPage(normalized);
  } else {
    showSelectedPage(normalized);
  }
}

function showSelectedPage(page) {
  const normalized = normalizePage(page);

  const allowed = [
    "dashboard",
    "tracker",
    "history",
    "announcements",
    "chat",
    "doubts",
    "profile"
  ];

  state.currentPage = allowed.includes(normalized)
    ? normalized
    : "dashboard";

  $$(".student-dashboard").forEach(section => {
    section.hidden =
      section.dataset.page !== state.currentPage;
  });

  renderCurrentPage();
}

function handlePageChange(event) {
  const detail = event.detail || {};

  if (
    detail.role &&
    detail.role !== "student"
  ) {
    return;
  }

  showSelectedPage(detail.page || "dashboard");
}

// ============================================================
// PAGE RENDERING
// ============================================================

function renderCurrentPage() {
  if (!state.initialized) {
    return;
  }

  switch (state.currentPage) {
    case "dashboard":
      renderDashboard();
      break;

    case "tracker":
      renderTracker();
      break;

    case "history":
      renderHistory();
      break;

    case "announcements":
      renderAnnouncements();
      break;

    case "chat":
      renderChat();
      break;

    case "doubts":
      renderDoubts();
      break;

    case "profile":
      renderProfile();
      break;

    default:
      state.currentPage = "dashboard";
      renderDashboard();
  }

  $$(".student-dashboard").forEach(section => {
    section.hidden =
      section.dataset.page !== state.currentPage;
  });
}

function renderAllPages() {
  renderDashboard();
  renderTracker();
  renderHistory();
  renderAnnouncements();
  renderChat();
  renderDoubts();
  renderProfile();

  showSelectedPage(state.currentPage);
}

// ============================================================
// EVENT HANDLERS
// ============================================================

function handleDelegatedSubmit(event) {
  const form = event.target;

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  switch (form.id) {
    case "studentStudyForm":
      void handleStudySubmit(event);
      break;

    case "studentChatForm":
      void handleChatSubmit(event);
      break;

    case "studentDoubtForm":
      void handleDoubtSubmit(event);
      break;

    case "studentProfileForm":
      void handleProfileSubmit(event);
      break;

    case "studentPasswordForm":
      void handlePasswordSubmit(event);
      break;

    default:
      break;
  }
}

function bindEvents() {
  if (!state.delegatedSubmitHandler) {
    state.delegatedSubmitHandler =
      handleDelegatedSubmit;

    document.addEventListener(
      "submit",
      state.delegatedSubmitHandler
    );
  }

  if (!state.delegatedClickHandler) {
    state.delegatedClickHandler = event => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const link = target.closest("[data-student-route]");

      if (!link) {
        return;
      }

      event.preventDefault();

      navigate(link.dataset.studentRoute);
    };

    document.addEventListener(
      "click",
      state.delegatedClickHandler
    );
  }

  if (!state.pageChangeHandler) {
    state.pageChangeHandler = handlePageChange;

    window.addEventListener(
      "mathclass:pagechange",
      state.pageChangeHandler
    );
  }
}

// ============================================================
// CLEANUP
// ============================================================

function cleanup() {
  cleanupListeners();

  if (state.pageChangeHandler) {
    window.removeEventListener(
      "mathclass:pagechange",
      state.pageChangeHandler
    );

    state.pageChangeHandler = null;
  }

  if (state.delegatedSubmitHandler) {
    document.removeEventListener(
      "submit",
      state.delegatedSubmitHandler
    );

    state.delegatedSubmitHandler = null;
  }

  if (state.delegatedClickHandler) {
    document.removeEventListener(
      "click",
      state.delegatedClickHandler
    );

    state.delegatedClickHandler = null;
  }

  state.initialized = false;
  state.submitting = false;
  state.records = [];
  state.announcements = [];
  state.chatMessages = [];
  state.doubts = [];
}

// ============================================================
// INITIALIZATION
// ============================================================

export async function init(context) {
  cleanup();

  if (!context?.user?.uid) {
    throw new Error(
      "A signed-in student account is required."
    );
  }

  if (!context.db) {
    throw new Error(
      "Firebase Realtime Database is unavailable."
    );
  }

  if (
    context.profile?.role &&
    context.profile.role !== "student"
  ) {
    throw new Error(
      "The student module cannot be opened by this account."
    );
  }

  state.auth = context.auth;
  state.db = context.db;
  state.user = context.user;
  state.profile = context.profile || {};
  state.toast = context.toast;
  state.showPage = context.showPage;

  try {
    const config = await import("./firebase-config.js");
    state.storage = config.storage || null;
  } catch (error) {
    // Storage is not required for the features implemented here.
    state.storage = null;
  }

  injectStyles();

  state.currentPage = "dashboard";
  state.initialized = true;

  bindEvents();

  // Render immediately. Do not wait for Firebase listeners.
  renderAllPages();

  // Attach live listeners to the existing project paths.
  loadStudyLogs();
  loadAnnouncements();
  loadClassChat();
  loadDoubts();

  return {
    cleanup,
    refresh: renderAllPages
  };
}
