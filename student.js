// ============================================================
// MATH CLASS — STUDENT MODULE
// File: student.js
// Firebase SDK: 10.5.0 Modular
// Corrected version based on the original implementation
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
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-storage.js";

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
  getInitials,
  createStatusBadge,
  createEmptyState,
  createSkeleton,
  setFieldError,
  validateRequired,
  validateFileSize,
  openModal
} from "./components.js";

// ============================================================
// STATE
// ============================================================

const studentState = {
  auth: null,
  db: null,
  storage: null,
  user: null,
  profile: null,
  toast: null,
  showPage: null,

  initialized: false,
  unsubscribers: [],
  records: [],
  announcements: [],
  chatMessages: [],
  doubts: [],

  activeDate: new Date().toISOString().slice(0, 10),
  submitting: false,
  currentPage: "dashboard",
  pageChangeHandler: null
};

// These paths must match the database structure used by the
// rest of the Math Class application.
const PATHS = {
  users: "users",
  logs: "daily_study_logs",
  announcements: "announcements",
  chat: "class_chat",
  doubts: "direct_doubts"
};

const MAX_PROOF_SIZE_MB = 5;
const MAX_CHAT_LENGTH = 1000;
const MAX_DOUBT_LENGTH = 3000;
const MAX_REMARKS_LENGTH = 500;

// ============================================================
// HELPERS
// ============================================================

const $ = (selector, root = document) =>
  root.querySelector(selector);

const $$ = (selector, root = document) =>
  [...root.querySelectorAll(selector)];

function notify(message, type = "info") {
  if (typeof studentState.toast === "function") {
    studentState.toast(message, type);
  } else {
    console[type === "error" ? "error" : "log"](message);
  }
}

function uid() {
  return studentState.user?.uid || "";
}

function currentUserName() {
  return (
    studentState.profile?.name ||
    studentState.profile?.displayName ||
    studentState.user?.displayName ||
    studentState.user?.email?.split("@")[0] ||
    "Student"
  );
}

function now() {
  return Date.now();
}

function safeNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);

  if (!Number.isFinite(number)) return min;

  return Math.min(max, Math.max(min, Math.floor(number)));
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  return element;
}

function setText(selector, value) {
  const element = $(selector);

  if (element) element.textContent = value;
}

function formatError(error) {
  const code = error?.code || "";

  const messages = {
    "PERMISSION_DENIED":
      "Firebase denied access. Check your Realtime Database rules.",

    "database/permission-denied":
      "Firebase denied access. Check the database rules and the requested path.",

    "storage/unauthorized":
      "You don't have permission to upload this file.",

    "storage/canceled":
      "The upload was cancelled.",

    "storage/retry-limit-exceeded":
      "The upload failed after several attempts. Try again.",

    "auth/requires-recent-login":
      "Please sign in again before changing your password.",

    "auth/wrong-password":
      "Your current password is incorrect.",

    "auth/invalid-credential":
      "Your current password is incorrect.",

    "auth/weak-password":
      "Your new password must contain at least 6 characters.",

    "auth/network-request-failed":
      "Network error. Check your internet connection."
  };

  return messages[code] || error?.message || "Something went wrong.";
}

function showError(error, context = "Operation failed") {
  console.error(`[Math Class Student] ${context}:`, error);
  notify(`${context}: ${formatError(error)}`, "error");
}

function subscribe(path, callback, onError = null, source = null) {
  if (!studentState.db) {
    const error = new Error("Firebase Realtime Database is not initialized.");
    showError(error, `Cannot subscribe to ${path}`);
    return () => {};
  }

  const databaseReference = source || ref(studentState.db, path);

  const unsubscribe = onValue(
    databaseReference,

    snapshot => {
      try {
        callback(snapshot.val(), snapshot);
      } catch (error) {
        console.error(
          `[Math Class Student] Failed to process data from "${path}":`,
          error
        );

        if (onError) {
          onError(error);
        } else {
          notify(
            `Information from "${path}" could not be displayed.`,
            "error"
          );
        }
      }
    },

    error => {
      console.error(
        `[Math Class Student] Firebase listener failed at "${path}".`,
        error
      );

      if (onError) {
        onError(error);
      } else {
        notify(
          `Unable to load "${path}". Check Firebase permissions and database paths.`,
          "error"
        );
      }
    }
  );

  studentState.unsubscribers.push(unsubscribe);

  return unsubscribe;
}

function readValue(path) {
  return get(ref(studentState.db, path));
}

function writeValue(path, value) {
  return set(ref(studentState.db, path), value);
}

function patchValue(path, value) {
  return update(ref(studentState.db, path), value);
}

function makeButton(label, action, variant = "primary") {
  const button = createElement(
    "button",
    `mc-button mc-button-${variant}`,
    label
  );

  button.type = "button";

  if (action) button.addEventListener("click", action);

  return button;
}

function makeField(labelText, name, type = "text", options = {}) {
  const wrapper = createElement("div", "student-form-field");

  const label = createElement("label", "", labelText);
  label.htmlFor = `student-${name}`;

  let field;

  if (type === "textarea") {
    field = document.createElement("textarea");
    field.rows = options.rows || 3;
  } else if (type === "select") {
    field = document.createElement("select");

    (options.options || []).forEach(option => {
      const item = document.createElement("option");

      item.value = option.value;
      item.textContent = option.label;

      field.appendChild(item);
    });
  } else {
    field = document.createElement("input");
    field.type = type;
  }

  field.id = `student-${name}`;
  field.name = name;
  field.required = Boolean(options.required);

  if (options.min !== undefined) field.min = options.min;
  if (options.max !== undefined) field.max = options.max;

  if (options.maxLength !== undefined) {
    field.maxLength = options.maxLength;
  }

  if (options.placeholder) {
    field.placeholder = options.placeholder;
  }

  if (options.accept) field.accept = options.accept;

  wrapper.append(label, field);

  return { wrapper, field };
}

// ============================================================
// STYLES
// ============================================================

function injectStyles() {
  if ($("#student-module-styles")) return;

  const style = document.createElement("style");
  style.id = "student-module-styles";

  style.textContent = `
    .student-dashboard {
      display: grid;
      gap: 24px;
      width: 100%;
      min-width: 0;
    }

    .student-dashboard[hidden] {
      display: none !important;
    }

    .student-welcome {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
      padding: 28px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 18px;
    }

    .student-eyebrow {
      color: #64748B;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1.3px;
      font-weight: 700;
    }

    .student-heading {
      margin: 8px 0;
      color: #111827;
      font-size: clamp(23px, 3vw, 32px);
      font-weight: 750;
      letter-spacing: -1px;
    }

    .student-subtitle {
      margin: 0;
      color: #64748B;
      font-size: 14px;
      line-height: 1.7;
    }

    .student-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }

    .student-stat-card {
      padding: 20px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 15px;
      min-width: 0;
    }

    .student-stat-label {
      margin: 0 0 12px;
      color: #64748B;
      font-size: 13px;
    }

    .student-stat-value {
      color: #111827;
      font-size: 27px;
      font-weight: 750;
      letter-spacing: -.8px;
      overflow-wrap: anywhere;
    }

    .student-stat-caption {
      margin-top: 7px;
      color: #64748B;
      font-size: 12px;
    }

    .student-section {
      padding: 22px;
      border: 1px solid #E2E8F0;
      border-radius: 16px;
      background: #FFFFFF;
      min-width: 0;
    }

    .student-section-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 20px;
    }

    .student-section-heading h2 {
      margin: 0;
      font-size: 17px;
      font-weight: 750;
      color: #111827;
    }

    .student-section-heading p {
      margin: 5px 0 0;
      font-size: 13px;
      color: #64748B;
    }

    .student-list {
      display: grid;
      gap: 12px;
    }

    .student-list-item {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 12px;
      padding: 15px;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      background: #FFFFFF;
    }

    .student-list-item h3 {
      margin: 0 0 6px;
      color: #111827;
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
      gap: 17px;
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
      min-height: 44px;
      padding: 11px 12px;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      outline: none;
      background: #FFFFFF;
      color: #111827;
      font: inherit;
      font-size: 14px;
    }

    .student-form-field textarea {
      min-height: 90px;
      resize: vertical;
    }

    .student-form-field input:focus,
    .student-form-field select:focus,
    .student-form-field textarea:focus {
      border-color: #6366F1;
      box-shadow: 0 0 0 3px rgba(99,102,241,.12);
    }

    .student-form-full {
      grid-column: 1 / -1;
    }

    .student-form-actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 20px;
    }

    .student-progress-track {
      height: 8px;
      overflow: hidden;
      background: #E2E8F0;
      border-radius: 99px;
    }

    .student-progress-fill {
      height: 100%;
      background: #4F46E5;
      border-radius: inherit;
      transition: width .3s ease;
    }

    .student-chat {
      display: grid;
      grid-template-rows: minmax(240px, 420px) auto;
      gap: 15px;
    }

    .student-chat-messages {
      overflow-y: auto;
      padding: 14px;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      background: #F8FAFC;
    }

    .student-chat-message {
      max-width: 90%;
      margin-bottom: 12px;
      padding: 12px;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      background: #FFFFFF;
      overflow-wrap: anywhere;
    }

    .student-chat-message.mine {
      margin-left: auto;
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
      color: #334155;
      font-size: 14px;
      line-height: 1.65;
      white-space: pre-wrap;
    }

    .student-chat-compose {
      display: flex;
      align-items: stretch;
      gap: 10px;
    }

    .student-chat-compose textarea {
      flex: 1;
      min-width: 0;
      min-height: 48px;
      max-height: 130px;
      padding: 12px;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      font: inherit;
      resize: vertical;
    }

    .student-announcement {
      padding: 18px;
      border: 1px solid #E2E8F0;
      border-radius: 13px;
      background: #FFFFFF;
    }

    .student-announcement h3 {
      margin: 0 0 8px;
      color: #111827;
      font-size: 16px;
    }

    .student-announcement p {
      color: #475569;
      font-size: 14px;
      line-height: 1.75;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .student-announcement-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      color: #64748B;
      font-size: 12px;
    }

    .student-muted {
      color: #64748B;
      font-size: 13px;
    }

    .student-inline-error {
      margin: 12px 0;
      padding: 12px;
      color: #991B1B;
      background: #FEF2F2;
      border: 1px solid #FECACA;
      border-radius: 10px;
      font-size: 13px;
    }

    @media (max-width: 900px) {
      .student-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 600px) {
      .student-welcome {
        padding: 20px;
      }

      .student-section {
        padding: 16px;
      }

      .student-form-grid {
        grid-template-columns: 1fr;
      }

      .student-form-full {
        grid-column: auto;
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
// PAGE CONTAINER HELPERS
// ============================================================

function getPageContainer(page, title, description = "") {
  let section = $(`[data-page="${page}"]`);

  if (!section) {
    const appView =
      $("#appView") ||
      $("#pageContent") ||
      $("#mainContent") ||
      $("#dashboardView") ||
      $("#application") ||
      $("main") ||
      document.body;

    section = createElement("section", "student-dashboard");
    section.dataset.page = page;
    section.hidden = true;

    const heading = createElement("h1", "student-heading", title);
    const subtitle = createElement("p", "student-subtitle", description);

    section.append(heading, subtitle);
    appView.appendChild(section);
  }

  section.classList.add("student-dashboard");

  return section;
}

function preparePage(page, title, description = "") {
  const section = getPageContainer(page, title, description);

  if (!section.dataset.studentPrepared) {
    section.replaceChildren();
    section.dataset.studentPrepared = "true";

    const heading = createElement("h1", "student-heading", title);
    const subtitle = createElement("p", "student-subtitle", description);

    section.append(heading, subtitle);
  }

  return section;
}

function makeSection(title, description = "") {
  const section = createElement("section", "student-section");
  const heading = createElement("div", "student-section-heading");
  const group = document.createElement("div");

  group.appendChild(createElement("h2", "", title));

  if (description) {
    group.appendChild(createElement("p", "", description));
  }

  heading.appendChild(group);
  section.appendChild(heading);

  return { section, heading };
}

// ============================================================
// STUDENT DASHBOARD
// ============================================================

function renderStat(label, value, caption) {
  const card = createElement("article", "student-stat-card");

  card.append(
    createElement("p", "student-stat-label", label),
    createElement("div", "student-stat-value", String(value)),
    createElement("div", "student-stat-caption", caption)
  );

  return card;
}

function renderDashboard() {
  const section = preparePage(
    "dashboard",
    `Welcome back, ${currentUserName()}`,
    "Your personal space to practise, improve, and track your mathematics journey."
  );

  const stats = createElement("div", "student-stats");

  const totalQuestions = studentState.records.reduce(
    (sum, record) => sum + safeNumber(record.questions),
    0
  );

  const totalMinutes = studentState.records.reduce(
    (sum, record) => sum + safeNumber(record.duration),
    0
  );

  const verified = studentState.records.filter(
    record => record.status === "verified"
  ).length;

  const activeDays = new Set(
    studentState.records.map(record => record.date).filter(Boolean)
  ).size;

  stats.append(
    renderStat("Questions practised", totalQuestions, "Across recorded sessions"),
    renderStat("Study time", formatDuration(totalMinutes), "Total recorded time"),
    renderStat("Verified sessions", verified, "Approved by your teacher"),
    renderStat("Practice days", activeDays, "Days with recorded activity")
  );

  const quick = makeSection(
    "Quick actions",
    "Pick up where you left off."
  );

  const actions = createElement("div", "student-form-actions");

  actions.append(
    makeButton("Log today's practice", () => studentState.showPage?.("tracker")),
    makeButton("View study history", () => studentState.showPage?.("history"), "secondary"),
    makeButton("Ask a doubt", () => studentState.showPage?.("doubts"), "secondary")
  );

  quick.section.appendChild(actions);

  const recent = makeSection(
    "Recent practice",
    "Your latest recorded math sessions."
  );

  const list = createElement("div", "student-list");

  const records = [...studentState.records]
    .sort((a, b) => safeNumber(b.createdAt) - safeNumber(a.createdAt))
    .slice(0, 5);

  if (!records.length) {
    list.appendChild(createEmptyState({
      icon: "∑",
      title: "Your journey starts here",
      description: "Log your first math practice session to start tracking your progress.",
      actionLabel: "Log practice",
      onAction: () => studentState.showPage?.("tracker")
    }));
  } else {
    records.forEach(record => list.appendChild(renderLogItem(record)));
  }

  recent.section.appendChild(list);

  const announcements = makeSection(
    "Latest announcements",
    "Important updates from your teacher."
  );

  const announcementList = createElement("div", "student-list");

  const latest = [...studentState.announcements]
    .filter(item => item.published !== false)
    .sort((a, b) => safeNumber(b.createdAt) - safeNumber(a.createdAt))
    .slice(0, 3);

  if (!latest.length) {
    announcementList.appendChild(createEmptyState({
      icon: "◷",
      title: "No announcements yet",
      description: "New classroom updates will appear here."
    }));
  } else {
    latest.forEach(item => {
      announcementList.appendChild(renderAnnouncement(item));
    });
  }

  announcements.section.appendChild(announcementList);

  section.replaceChildren(
    createWelcomeHeader(),
    stats,
    quick.section,
    recent.section,
    announcements.section
  );
}

function createWelcomeHeader() {
  const header = createElement("header", "student-welcome");
  const left = document.createElement("div");

  left.append(
    createElement("div", "student-eyebrow", "STUDENT DASHBOARD"),
    createElement("h1", "student-heading", `Welcome back, ${currentUserName()}`),
    createElement("p", "student-subtitle", "Small steps every day lead to stronger mathematics.")
  );

  const button = makeButton(
    "Log practice",
    () => studentState.showPage?.("tracker")
  );

  header.append(left, button);

  return header;
}

// ============================================================
// PRACTICE LOGS
// ============================================================

function renderLogItem(record) {
  const item = createElement("article", "student-list-item");
  const details = document.createElement("div");

  details.append(
    createElement("h3", "", record.topic || "Math practice"),
    createElement(
      "p",
      "",
      `${safeNumber(record.questions)} questions · ${formatDuration(record.duration)} · ${formatDate(record.date)}`
    )
  );

  const right = document.createElement("div");
  right.appendChild(createStatusBadge(record.status || "submitted"));

  item.append(details, right);

  return item;
}

function renderTracker() {
  const section = preparePage(
    "tracker",
    "Daily Math Tracker",
    "Record your practice and attach optional proof of your work."
  );

  const formSection = makeSection(
    "Log a practice session",
    "Enter accurate details about the work you completed."
  );

  const form = document.createElement("form");
  form.noValidate = true;

  const grid = createElement("div", "student-form-grid");

  const date = makeField("Practice date", "date", "date", {
    required: true,
    max: new Date().toISOString().slice(0, 10)
  });

  date.field.value = studentState.activeDate;

  const topic = makeField("Math topic", "topic", "text", {
    required: true,
    maxLength: 120,
    placeholder: "e.g. Quadratic Equations"
  });

  const questions = makeField("Questions solved", "questions", "number", {
    required: true,
    min: 1,
    max: 10000
  });

  questions.field.placeholder = "e.g. 25";

  const duration = makeField("Study duration (minutes)", "duration", "number", {
    required: true,
    min: 1,
    max: 1440
  });

  duration.field.placeholder = "e.g. 45";

  const notes = makeField("What did you learn? (optional)", "notes", "textarea", {
    maxLength: MAX_REMARKS_LENGTH,
    placeholder: "Briefly describe your practice session."
  });

  notes.wrapper.classList.add("student-form-full");

  const proof = makeField("Proof image (optional, max 5 MB)", "proof", "file", {
    accept: "image/jpeg,image/png,image/webp"
  });

  proof.wrapper.appendChild(
    createElement(
      "p",
      "student-muted",
      "Upload a clear image of your written work. Images are optional."
    )
  );

  grid.append(
    date.wrapper,
    topic.wrapper,
    questions.wrapper,
    duration.wrapper,
    notes.wrapper,
    proof.wrapper
  );

  const actions = createElement("div", "student-form-actions");

  const submit = makeButton("Submit practice log", null);
  submit.type = "submit";

  actions.appendChild(submit);
  form.append(grid, actions);

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (studentState.submitting) return;

    if (!validateRequired([
      { field: date.field, label: "Practice date" },
      { field: topic.field, label: "Math topic" },
      { field: questions.field, label: "Questions solved" },
      { field: duration.field, label: "Study duration" }
    ])) {
      return;
    }

    const questionCount = Number(questions.field.value);
    const durationMinutes = Number(duration.field.value);
    const today = new Date().toISOString().slice(0, 10);

    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 10000) {
      notify("Questions must be a whole number between 1 and 10,000.", "warning");
      questions.field.focus();
      return;
    }

    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      notify("Study duration must be between 1 and 1,440 minutes.", "warning");
      duration.field.focus();
      return;
    }

    if (date.field.value > today) {
      notify("Practice date cannot be in the future.", "warning");
      date.field.focus();
      return;
    }

    if (notes.field.value.length > MAX_REMARKS_LENGTH) {
      notify(`Notes must be ${MAX_REMARKS_LENGTH} characters or fewer.`, "warning");
      return;
    }

    const file = proof.field.files?.[0];

    if (file) {
      const validation = validateFileSize(
        file,
        MAX_PROOF_SIZE_MB,
        ["image/jpeg", "image/png", "image/webp"]
      );

      if (!validation.valid) {
        notify(validation.message, "warning");
        return;
      }

      if (!studentState.storage) {
        notify("Firebase Storage is unavailable. Please try again later.", "error");
        return;
      }
    }

    studentState.submitting = true;
    submit.disabled = true;
    submit.textContent = "Saving...";

    try {
      const recordRef = push(ref(studentState.db, PATHS.logs));
      const recordId = recordRef.key;

      let proofURL = "";
      let proofPath = "";

      if (file) {
        proofPath =
          `math-proof/${uid()}/${recordId}/` +
          `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

        const uploaded = await uploadBytes(
          storageRef(studentState.storage, proofPath),
          file,
          { contentType: file.type }
        );

        proofURL = await getDownloadURL(uploaded.ref);
      }

      const record = {
        id: recordId,
        uid: uid(),
        studentName: currentUserName(),
        studentEmail: studentState.user.email || "",
        date: date.field.value,
        topic: topic.field.value.trim(),
        questions: questionCount,
        duration: durationMinutes,
        notes: notes.field.value.trim(),
        proofURL,
        proofPath,
        status: "submitted",
        createdAt: now(),
        updatedAt: now()
      };

      await set(recordRef, record);

      form.reset();
      date.field.value = today;
      studentState.activeDate = today;

      notify(
        "Your practice log has been submitted for teacher review.",
        "success"
      );

      studentState.showPage?.("history");

    } catch (error) {
      showError(error, "Could not save practice log");
    } finally {
      studentState.submitting = false;
      submit.disabled = false;
      submit.textContent = "Submit practice log";
    }
  });

  formSection.section.appendChild(form);
  section.replaceChildren(formSection.section);
}

// ============================================================
// STUDY HISTORY
// ============================================================

function renderHistory() {
  const section = preparePage(
    "history",
    "Study History",
    "Review your practice sessions and teacher verification status."
  );

  const content = makeSection(
    "All practice sessions",
    `${studentState.records.length} recorded sessions`
  );

  const list = createElement("div", "student-list");

  const records = [...studentState.records]
    .sort((a, b) => safeNumber(b.createdAt) - safeNumber(a.createdAt));

  if (!records.length) {
    list.appendChild(createEmptyState({
      icon: "◷",
      title: "No study history yet",
      description: "Your practice sessions will appear here after you submit a log.",
      actionLabel: "Log practice",
      onAction: () => studentState.showPage?.("tracker")
    }));
  } else {
    records.forEach(record => {
      const item = renderLogItem(record);
      const details = item.firstElementChild;

      if (record.notes) {
        details.appendChild(
          createElement("p", "", `Notes: ${record.notes}`)
        );
      }

      if (record.proofURL) {
        const proofLink = document.createElement("a");

        proofLink.href = record.proofURL;
        proofLink.target = "_blank";
        proofLink.rel = "noopener noreferrer";
        proofLink.textContent = "View proof image";
        proofLink.style.display = "inline-block";
        proofLink.style.marginTop = "8px";

        details.appendChild(proofLink);
      }

      if (record.teacherFeedback) {
        details.appendChild(
          createElement("p", "", `Teacher feedback: ${record.teacherFeedback}`)
        );
      }

      list.appendChild(item);
    });
  }

  content.section.appendChild(list);
  section.replaceChildren(content.section);
}

// ============================================================
// ANNOUNCEMENTS
// ============================================================

function renderAnnouncement(item) {
  const card = createElement("article", "student-announcement");

  const heading = createElement(
    "h3",
    "",
    item.title || "Class announcement"
  );

  const meta = createElement("div", "student-announcement-meta");

  meta.append(
    createElement("span", "", item.authorName || "Teacher"),
    createElement("span", "", formatDateTime(item.createdAt))
  );

  card.append(heading, meta);

  if (item.body || item.message) {
    card.appendChild(
      createElement("p", "", item.body || item.message)
    );
  }

  if (item.attachmentURL) {
    const link = document.createElement("a");

    link.href = item.attachmentURL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.attachmentName || "Open attachment";

    card.appendChild(link);
  }

  return card;
}

function renderAnnouncements() {
  const section = preparePage(
    "announcements",
    "Notice Board",
    "Stay up to date with class announcements and learning resources."
  );

  const list = createElement("div", "student-list");

  const announcements = [...studentState.announcements]
    .filter(item => item.published !== false)
    .sort((a, b) => safeNumber(b.createdAt) - safeNumber(a.createdAt));

  if (!announcements.length) {
    list.appendChild(createEmptyState({
      icon: "◷",
      title: "You're all caught up",
      description: "There are no published announcements at the moment."
    }));
  } else {
    announcements.forEach(item => {
      list.appendChild(renderAnnouncement(item));
    });
  }

  section.replaceChildren(list);
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

  const meta = createElement("div", "student-chat-meta");

  meta.append(
    createElement(
      "span",
      "",
      mine ? "You" : (message.displayName || "Class member")
    ),
    createElement("span", "", formatDateTime(message.createdAt))
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
  const section = preparePage(
    "chat",
    "Class Chat",
    "Discuss mathematics respectfully with your classmates."
  );

  const messagesBox = createElement("div", "student-chat-messages");
  messagesBox.setAttribute("aria-live", "polite");

  const messages = [...studentState.chatMessages]
    .filter(message => !message.deleted)
    .sort((a, b) => safeNumber(a.createdAt) - safeNumber(b.createdAt))
    .slice(-100);

  if (!messages.length) {
    messagesBox.appendChild(createEmptyState({
      icon: "✦",
      title: "Start the conversation",
      description: "Ask a question or share a useful study tip."
    }));
  } else {
    messages.forEach(message => {
      messagesBox.appendChild(renderChatMessage(message));
    });
  }

  const form = document.createElement("form");
  form.className = "student-chat-compose";

  const input = document.createElement("textarea");
  input.name = "message";
  input.maxLength = MAX_CHAT_LENGTH;
  input.required = true;
  input.placeholder = "Write a message...";
  input.setAttribute("aria-label", "Chat message");

  const submit = makeButton("Send", null);
  submit.type = "submit";

  form.append(input, submit);

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const message = input.value.trim();

    if (!message) {
      notify("Write a message first.", "warning");
      return;
    }

    if (message.length > MAX_CHAT_LENGTH) {
      notify(`Messages cannot exceed ${MAX_CHAT_LENGTH} characters.`, "warning");
      return;
    }

    submit.disabled = true;

    try {
      const messageRef = push(ref(studentState.db, PATHS.chat));

      await set(messageRef, {
        id: messageRef.key,
        uid: uid(),
        displayName: currentUserName(),
        message,
        createdAt: now(),
        deleted: false
      });

      input.value = "";
      notify("Message sent.", "success");

    } catch (error) {
      showError(error, "Could not send message");
    } finally {
      submit.disabled = false;
    }
  });

  const chat = createElement("div", "student-chat");

  chat.append(messagesBox, form);
  section.replaceChildren(chat);

  messagesBox.scrollTop = messagesBox.scrollHeight;
}

// ============================================================
// PRIVATE DOUBTS
// ============================================================

function renderDoubtItem(doubt) {
  const item = createElement("article", "student-list-item");
  const details = document.createElement("div");

  details.append(
    createElement("h3", "", doubt.subject || "Math doubt"),
    createElement("p", "", doubt.question || ""),
    createElement("p", "", `Submitted ${formatDateTime(doubt.createdAt)}`)
  );

  if (doubt.reply) {
    const reply = createElement("div", "", "");

    reply.style.marginTop = "12px";
    reply.style.padding = "12px";
    reply.style.background = "#F1F5F9";
    reply.style.borderRadius = "8px";

    reply.append(
      createElement("strong", "", "Teacher's reply"),
      createElement("p", "", doubt.reply)
    );

    details.appendChild(reply);
  }

  const right = document.createElement("div");
  right.appendChild(createStatusBadge(doubt.status || "submitted"));

  item.append(details, right);

  return item;
}

function renderDoubts() {
  const section = preparePage(
    "doubts",
    "Ask a Doubt",
    "Submit a question privately to your teacher and track its response."
  );

  const formSection = makeSection(
    "Submit a new question",
    "Only authorized teachers and your account should have access to this conversation."
  );

  const form = document.createElement("form");
  const grid = createElement("div", "student-form-grid");

  const subject = makeField("Subject", "doubtSubject", "text", {
    required: true,
    maxLength: 120,
    placeholder: "e.g. Understanding trigonometry"
  });

  const category = makeField("Topic", "doubtCategory", "select", {
    options: [
      { value: "Algebra", label: "Algebra" },
      { value: "Geometry", label: "Geometry" },
      { value: "Trigonometry", label: "Trigonometry" },
      { value: "Statistics", label: "Statistics" },
      { value: "Arithmetic", label: "Arithmetic" },
      { value: "Other", label: "Other" }
    ]
  });

  const question = makeField("Your question", "doubtQuestion", "textarea", {
    required: true,
    maxLength: MAX_DOUBT_LENGTH,
    rows: 5,
    placeholder: "Explain where you are stuck..."
  });

  question.wrapper.classList.add("student-form-full");

  grid.append(subject.wrapper, category.wrapper, question.wrapper);

  const actions = createElement("div", "student-form-actions");
  const submit = makeButton("Submit doubt", null);

  submit.type = "submit";
  actions.appendChild(submit);

  form.append(grid, actions);

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!validateRequired([
      { field: subject.field, label: "Subject" },
      { field: question.field, label: "Question" }
    ])) {
      return;
    }

    const questionValue = question.field.value.trim();

    if (questionValue.length > MAX_DOUBT_LENGTH) {
      notify(`Your question must be ${MAX_DOUBT_LENGTH} characters or fewer.`, "warning");
      return;
    }

    submit.disabled = true;
    submit.textContent = "Submitting...";

    try {
      const doubtRef = push(ref(studentState.db, PATHS.doubts));

      await set(doubtRef, {
        id: doubtRef.key,
        uid: uid(),
        studentName: currentUserName(),
        studentEmail: studentState.user.email || "",
        subject: subject.field.value.trim(),
        category: category.field.value,
        question: questionValue,
        status: "submitted",
        reply: "",
        createdAt: now(),
        updatedAt: now()
      });

      form.reset();

      notify(
        "Your doubt has been sent privately to your teacher.",
        "success"
      );

    } catch (error) {
      showError(error, "Could not submit doubt");
    } finally {
      submit.disabled = false;
      submit.textContent = "Submit doubt";
    }
  });

  formSection.section.appendChild(form);

  const listSection = makeSection(
    "Your submitted doubts",
    "Only your own doubts are shown here."
  );

  const list = createElement("div", "student-list");

  if (!studentState.doubts.length) {
    list.appendChild(createEmptyState({
      icon: "?",
      title: "No questions submitted",
      description: "Questions you send to your teacher will appear here."
    }));
  } else {
    [...studentState.doubts]
      .sort((a, b) => safeNumber(b.createdAt) - safeNumber(a.createdAt))
      .forEach(doubt => list.appendChild(renderDoubtItem(doubt)));
  }

  listSection.section.appendChild(list);

  section.replaceChildren(formSection.section, listSection.section);
}

// ============================================================
// PROFILE SETTINGS
// ============================================================

function renderProfile() {
  const section = preparePage(
    "profile",
    "Profile Settings",
    "Manage your account information."
  );

  const profileSection = makeSection(
    "Personal information",
    "Update your display name."
  );

  const form = document.createElement("form");
  const grid = createElement("div", "student-form-grid");

  const name = makeField("Full name", "profileName", "text", {
    required: true,
    maxLength: 100
  });

  name.field.value = currentUserName();

  const email = makeField("Email address", "profileEmail", "email");
  email.field.value = studentState.user.email || "";
  email.field.readOnly = true;

  const role = makeField("Account role", "profileRole", "text");
  role.field.value = "Student";
  role.field.readOnly = true;

  const joined = makeField("Account created", "profileCreated", "text");
  joined.field.value = formatDate(
    studentState.profile?.createdAt ||
    studentState.user.metadata?.creationTime
  );
  joined.field.readOnly = true;

  grid.append(name.wrapper, email.wrapper, role.wrapper, joined.wrapper);

  const actions = createElement("div", "student-form-actions");
  const save = makeButton("Save profile", null);

  save.type = "submit";
  actions.appendChild(save);

  form.append(grid, actions);

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!validateRequired([
      { field: name.field, label: "Full name" }
    ])) {
      return;
    }

    const newName = name.field.value.trim();

    if (!newName || newName.length > 100) {
      notify("Your name must contain between 1 and 100 characters.", "warning");
      return;
    }

    save.disabled = true;

    try {
      await updateProfile(studentState.user, {
        displayName: newName
      });

      await patchValue(`${PATHS.users}/${uid()}`, {
        name: newName,
        displayName: newName,
        updatedAt: now()
      });

      studentState.profile = {
        ...(studentState.profile || {}),
        name: newName,
        displayName: newName
      };

      notify("Profile updated successfully.", "success");

      renderProfile();

    } catch (error) {
      showError(error, "Could not update profile");
    } finally {
      save.disabled = false;
    }
  });

  profileSection.section.appendChild(form);

  const passwordSection = makeSection(
    "Change password",
    "Use a strong password that you do not reuse on other websites."
  );

  passwordSection.section.appendChild(
    makeButton(
      "Change password",
      openPasswordChange,
      "secondary"
    )
  );

  section.replaceChildren(
    profileSection.section,
    passwordSection.section
  );
}

function openPasswordChange() {
  const form = document.createElement("form");

  const current = makeField(
    "Current password",
    "currentPassword",
    "password",
    { required: true }
  );

  const next = makeField(
    "New password",
    "newPassword",
    "password",
    { required: true }
  );

  const confirm = makeField(
    "Confirm new password",
    "confirmNewPassword",
    "password",
    { required: true }
  );

  const grid = createElement("div", "student-form-grid");

  grid.append(
    current.wrapper,
    next.wrapper,
    confirm.wrapper
  );

  form.appendChild(grid);

  const modal = openModal({
    title: "Change password",
    description: "Verify your current password before saving a new one.",
    contentElement: form,

    actions: [
      {
        label: "Cancel",
        variant: "secondary",
        onClick: () => {},
        closeOnClick: true
      },

      {
        label: "Update password",
        variant: "primary",
        closeOnClick: false,

        onClick: async () => {
          if (!validateRequired([
            { field: current.field, label: "Current password" },
            { field: next.field, label: "New password" },
            { field: confirm.field, label: "Password confirmation" }
          ])) {
            return;
          }

          if (next.field.value.length < 6) {
            setFieldError(
              next.field,
              "Password must contain at least 6 characters."
            );
            return;
          }

          if (next.field.value !== confirm.field.value) {
            setFieldError(
              confirm.field,
              "Passwords do not match."
            );
            return;
          }

          try {
            const credential = EmailAuthProvider.credential(
              studentState.user.email,
              current.field.value
            );

            await reauthenticateWithCredential(
              studentState.user,
              credential
            );

            await updatePassword(
              studentState.user,
              next.field.value
            );

            notify("Password changed successfully.", "success");

            modal?.close?.();

          } catch (error) {
            showError(error, "Could not change password");
          }
        }
      }
    ]
  });
}

// ============================================================
// DATA NORMALIZATION
// ============================================================

function normalizeRecords(value) {
  if (!value || typeof value !== "object") return [];

  return Object.entries(value)
    .filter(([, item]) => item && typeof item === "object")
    .map(([key, item]) => ({
      ...item,
      id: item.id || key
    }));
}

// ============================================================
// DATA SUBSCRIPTIONS
// ============================================================

function loadStudentLogs() {
  // Query only the current student's logs. Firebase rules must
  // allow this query and index the uid child where necessary.
  const logsQuery = query(
    ref(studentState.db, PATHS.logs),
    orderByChild("uid"),
    equalTo(uid()),
    limitToLast(500)
  );

  return subscribe(
    PATHS.logs,
    value => {
      studentState.records = normalizeRecords(value)
        .filter(record => record.uid === uid())
        .sort(
          (a, b) =>
            safeNumber(b.createdAt) - safeNumber(a.createdAt)
        );

      renderCurrentPageData();
    },
    error => {
      console.error(
        `[Math Class Student] Could not load student logs from "${PATHS.logs}".`,
        error
      );

      notify(
        `Study history could not load. Firebase path: ${PATHS.logs}. Check its read rules and uid index.`,
        "error"
      );
    },
    logsQuery
  );
}

function loadAnnouncements() {
  return subscribe(
    PATHS.announcements,

    value => {
      studentState.announcements = normalizeRecords(value)
        .filter(item => item.published !== false)
        .sort(
          (a, b) =>
            safeNumber(b.createdAt) - safeNumber(a.createdAt)
        );

      renderCurrentPageData();
    },

    error => {
      console.error(
        `[Math Class Student] Could not load announcements from "${PATHS.announcements}".`,
        error
      );

      notify(
        `Announcements could not load. Check read permission for "${PATHS.announcements}".`,
        "error"
      );
    }
  );
}

function loadClassChat() {
  const chatQuery = query(
    ref(studentState.db, PATHS.chat),
    limitToLast(100)
  );

  return subscribe(
    PATHS.chat,

    value => {
      studentState.chatMessages = normalizeRecords(value)
        .filter(message => !message.deleted)
        .sort(
          (a, b) =>
            safeNumber(a.createdAt) - safeNumber(b.createdAt)
        )
        .slice(-100);

      if (
        studentState.initialized &&
        studentState.currentPage === "chat"
      ) {
        renderChat();
      }
    },

    error => {
      console.error(
        `[Math Class Student] Could not load class chat from "${PATHS.chat}".`,
        error
      );

      notify(
        `Class chat could not load. Check read permission for "${PATHS.chat}".`,
        "error"
      );
    },

    chatQuery
  );
}

function loadStudentDoubts() {
  // Query only doubts belonging to the signed-in student.
  const doubtsQuery = query(
    ref(studentState.db, PATHS.doubts),
    orderByChild("uid"),
    equalTo(uid()),
    limitToLast(200)
  );

  return subscribe(
    PATHS.doubts,

    value => {
      studentState.doubts = normalizeRecords(value)
        .filter(doubt => doubt.uid === uid())
        .sort(
          (a, b) =>
            safeNumber(b.createdAt) - safeNumber(a.createdAt)
        );

      if (
        studentState.initialized &&
        studentState.currentPage === "doubts"
      ) {
        renderDoubts();
      }
    },

    error => {
      console.error(
        `[Math Class Student] Could not load doubts from "${PATHS.doubts}".`,
        error
      );

      notify(
        `Your doubts could not load. Check the read rules and uid index for "${PATHS.doubts}".`,
        "error"
      );
    },

    doubtsQuery
  );
}

// ============================================================
// PAGE REFRESH
// ============================================================

function renderCurrentPageData() {
  if (!studentState.initialized) return;

  switch (studentState.currentPage) {
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
      renderDashboard();
  }
}

function renderAllPages() {
  renderDashboard();
  renderTracker();
  renderHistory();
  renderAnnouncements();
  renderChat();
  renderDoubts();
  renderProfile();

  showSelectedPage(studentState.currentPage);
}

function showSelectedPage(page) {
  const aliases = {
    "study-tracker": "tracker",
    "study-history": "history",
    "class-chat": "chat",
    "doubt-inbox": "doubts"
  };

  const normalized = aliases[page] || page || "dashboard";

  const allowedPages = [
    "dashboard",
    "tracker",
    "history",
    "announcements",
    "chat",
    "doubts",
    "profile"
  ];

  studentState.currentPage = allowedPages.includes(normalized)
    ? normalized
    : "dashboard";

  $$(".student-dashboard").forEach(section => {
    section.hidden = section.dataset.page !== studentState.currentPage;
  });

  renderCurrentPageData();
}

// ============================================================
// CLEANUP
// ============================================================

function cleanup() {
  studentState.unsubscribers.forEach(unsubscribe => {
    try {
      unsubscribe();
    } catch (error) {
      console.warn(
        "[Math Class Student] Listener cleanup warning:",
        error
      );
    }
  });

  studentState.unsubscribers = [];

  if (studentState.pageChangeHandler) {
    window.removeEventListener(
      "mathclass:pagechange",
      studentState.pageChangeHandler
    );

    studentState.pageChangeHandler = null;
  }

  studentState.initialized = false;
}

window.addEventListener("mathclass:auth-ready", event => {
  if (!event.detail?.user) {
    cleanup();
  }
});

// ============================================================
// PAGE CHANGE HANDLER
// ============================================================

function handlePageChange(event) {
  const { page, role } = event.detail || {};

  // Allow events that don't include a role, but reject events
  // explicitly intended for a different role.
  if (role && role !== "student") return;

  showSelectedPage(page || "dashboard");
}

// ============================================================
// INITIALIZATION
// ============================================================

export async function init(context) {
  cleanup();

  studentState.auth = context.auth;
  studentState.db = context.db;
  studentState.user = context.user;
  studentState.profile = context.profile || {};
  studentState.toast = context.toast;
  studentState.showPage = context.showPage;

  if (!studentState.user?.uid) {
    throw new Error("A signed-in student account is required.");
  }

  // Fixed: the original code checked studentState.role, which
  // was never defined. The role belongs to the profile object.
  if (
    studentState.profile.role &&
    studentState.profile.role !== "student"
  ) {
    throw new Error(
      "This module is only for student accounts."
    );
  }

  if (!studentState.db) {
    throw new Error(
      "Firebase Realtime Database is not available."
    );
  }

  const configModule = await import("./firebase-config.js");
  studentState.storage = configModule.storage || null;

  injectStyles();

  studentState.currentPage = "dashboard";
  studentState.initialized = true;

  // Render the interface immediately rather than waiting for
  // Firebase listeners to return data.
  renderAllPages();

  // Subscribe to the application's database paths.
  loadStudentLogs();
  loadAnnouncements();
  loadClassChat();
  loadStudentDoubts();

  studentState.pageChangeHandler = handlePageChange;

  window.addEventListener(
    "mathclass:pagechange",
    studentState.pageChangeHandler
  );

  return {
    cleanup,
    refresh: renderAllPages
  };
}
