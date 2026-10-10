// ============================================================
// MATH CLASS — TEACHER PORTAL
// File: teacher.js
// Firebase Modular SDK 10.5.0
// ============================================================

import {
  ref,
  get,
  set,
  push,
  update,
  remove,
  onValue
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-storage.js";

import {
  escapeHTML,
  formatDate,
  formatDateTime,
  formatDuration,
  createStatusBadge,
  createEmptyState,
  createButton,
  openModal,
  confirmDialog,
  makeButton
} from "./components.js";

// ============================================================
// STATE
// ============================================================

const teacherState = {
  auth: null,
  db: null,
  storage: null,
  user: null,
  profile: null,
  toast: null,
  showPage: null,

  initialized: false,
  unsubscribers: [],
  logs: [],
  announcements: [],
  doubts: [],
  users: [],
  currentPage: "dashboard",
  busy: false
};

const PATHS = {
  users: "users",
  logs: "mathLogs",
  announcements: "announcements",
  doubts: "doubts"
};

const MAX_ANNOUNCEMENT_LENGTH = 5000;
const MAX_ATTACHMENT_MB = 10;

// ============================================================
// GENERAL HELPERS
// ============================================================

const $ = (selector, root = document) =>
  root.querySelector(selector);

function notify(message, type = "info") {
  if (typeof teacherState.toast === "function") {
    teacherState.toast(message, type);
  } else {
    console.log(`[${type}] ${message}`);
  }
}

function currentUID() {
  return teacherState.user?.uid || "";
}

function currentName() {
  return teacherState.profile?.name ||
    teacherState.user?.displayName ||
    teacherState.user?.email?.split("@")[0] ||
    "Teacher";
}

function toArray(value) {
  if (!value || typeof value !== "object") return [];

  return Object.entries(value).map(([key, item]) => ({
    ...item,
    id: item?.id || key
  }));
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function errorMessage(error) {
  const messages = {
    "PERMISSION_DENIED":
      "Firebase denied this action. Check your database security rules.",
    "storage/unauthorized":
      "You do not have permission to upload or delete this file.",
    "storage/retry-limit-exceeded":
      "The upload failed. Please try again.",
    "auth/network-request-failed":
      "Network error. Check your internet connection."
  };

  return messages[error?.code] ||
    error?.message ||
    "An unexpected error occurred.";
}

function reportError(error, action) {
  console.error(`[Math Class Teacher] ${action}:`, error);
  notify(`${action}: ${errorMessage(error)}`, "error");
}

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (text !== "") node.textContent = text;

  return node;
}

function button(label, onClick, variant = "primary") {
  const node = createButton({
    label,
    onClick,
    variant
  });

  return node;
}

function subscribe(path, callback) {
  const unsubscribe = onValue(
    ref(teacherState.db, path),
    snapshot => callback(snapshot.val()),
    error => reportError(error, "Unable to load data")
  );

  teacherState.unsubscribers.push(unsubscribe);

  return unsubscribe;
}

// ============================================================
// STYLES
// ============================================================

function injectStyles() {
  if ($("#teacher-module-styles")) return;

  const style = element("style");
  style.id = "teacher-module-styles";

  style.textContent = `
    .teacher-layout {
      display: grid;
      gap: 24px;
      width: 100%;
    }

    .teacher-welcome {
      padding: 28px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 18px;
    }

    .teacher-eyebrow {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1.2px;
      color: #64748B;
      text-transform: uppercase;
    }

    .teacher-title {
      margin: 8px 0;
      color: #111827;
      font-size: clamp(24px, 3vw, 32px);
      font-weight: 750;
      letter-spacing: -1px;
    }

    .teacher-description {
      margin: 0;
      color: #64748B;
      font-size: 14px;
      line-height: 1.7;
    }

    .teacher-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }

    .teacher-stat {
      min-width: 0;
      padding: 20px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 14px;
    }

    .teacher-stat-label {
      margin: 0 0 12px;
      color: #64748B;
      font-size: 13px;
    }

    .teacher-stat-value {
      font-size: 28px;
      font-weight: 750;
      color: #111827;
      overflow-wrap: anywhere;
    }

    .teacher-section {
      min-width: 0;
      padding: 22px;
      border: 1px solid #E2E8F0;
      border-radius: 16px;
      background: #FFFFFF;
    }

    .teacher-section-heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 20px;
    }

    .teacher-section-heading h2 {
      margin: 0;
      font-size: 17px;
      color: #111827;
    }

    .teacher-section-heading p {
      margin: 6px 0 0;
      font-size: 13px;
      color: #64748B;
    }

    .teacher-list {
      display: grid;
      gap: 12px;
    }

    .teacher-item {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 14px;
      padding: 16px;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      background: #FFFFFF;
    }

    .teacher-item-content {
      flex: 1;
      min-width: 180px;
    }

    .teacher-item h3 {
      margin: 0 0 7px;
      color: #111827;
      font-size: 15px;
      overflow-wrap: anywhere;
    }

    .teacher-item p {
      margin: 4px 0;
      color: #64748B;
      font-size: 13px;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }

    .teacher-item-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .teacher-form {
      display: grid;
      gap: 17px;
    }

    .teacher-field {
      display: grid;
      gap: 7px;
    }

    .teacher-field label {
      color: #334155;
      font-size: 13px;
      font-weight: 650;
    }

    .teacher-field input,
    .teacher-field textarea,
    .teacher-field select {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      padding: 11px 12px;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      background: #FFFFFF;
      color: #111827;
      font: inherit;
      font-size: 14px;
    }

    .teacher-field textarea {
      min-height: 120px;
      resize: vertical;
    }

    .teacher-field input:focus,
    .teacher-field textarea:focus,
    .teacher-field select:focus {
      outline: none;
      border-color: #6366F1;
      box-shadow: 0 0 0 3px rgba(99,102,241,.12);
    }

    .teacher-filter {
      min-height: 44px;
      padding: 10px 12px;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
      background: #FFFFFF;
      color: #334155;
      font: inherit;
    }

    .teacher-feedback {
      width: 100%;
      min-height: 75px;
      margin-top: 10px;
      padding: 10px;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      font: inherit;
      resize: vertical;
    }

    .teacher-table-wrap {
      width: 100%;
      overflow-x: auto;
    }

    .teacher-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }

    .teacher-table th,
    .teacher-table td {
      padding: 13px 12px;
      border-bottom: 1px solid #E2E8F0;
      vertical-align: top;
    }

    .teacher-table th {
      color: #64748B;
      font-weight: 650;
      white-space: nowrap;
    }

    .teacher-table td {
      color: #334155;
    }

    .teacher-insight-bar {
      height: 9px;
      overflow: hidden;
      border-radius: 99px;
      background: #E2E8F0;
    }

    .teacher-insight-bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: #4F46E5;
    }

    .teacher-form-actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 10px;
    }

    @media (max-width: 900px) {
      .teacher-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 600px) {
      .teacher-welcome,
      .teacher-section {
        padding: 18px;
      }

      .teacher-item-actions {
        width: 100%;
      }

      .teacher-item-actions .mc-button {
        flex: 1;
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================
// PAGE HELPERS
// ============================================================

function getPage(page, title, description = "") {
  let section = $(`[data-page="${page}"]`);

  if (!section) {
    const app = $("#appView") || $("#dashboardView") ||
      $("#application") || document.body;

    section = element("section", "teacher-layout");
    section.dataset.page = page;
    section.hidden = true;

    app.appendChild(section);
  }

  section.classList.add("teacher-layout");
  section.replaceChildren();

  if (title) {
    const heading = element("div", "teacher-welcome");

    heading.append(
      element("div", "teacher-eyebrow", "TEACHER PORTAL"),
      element("h1", "teacher-title", title),
      element("p", "teacher-description", description)
    );

    section.appendChild(heading);
  }

  return section;
}

function makeSection(title, description = "") {
  const section = element("section", "teacher-section");
  const heading = element("div", "teacher-section-heading");
  const group = document.createElement("div");

  group.appendChild(element("h2", "", title));

  if (description) {
    group.appendChild(element("p", "", description));
  }

  heading.appendChild(group);
  section.appendChild(heading);

  return { section, heading };
}

// ============================================================
// DASHBOARD
// ============================================================

function renderStat(label, value) {
  const card = element("article", "teacher-stat");

  card.append(
    element("p", "teacher-stat-label", label),
    element("div", "teacher-stat-value", String(value))
  );

  return card;
}

function renderDashboard() {
  const section = getPage(
    "dashboard",
    `Welcome, ${currentName()}`,
    "Your action center for practice verification, classroom updates, and student support."
  );

  const pending = teacherState.logs.filter(
    log => !["verified", "rejected"].includes(log.status)
  ).length;

  const unanswered = teacherState.doubts.filter(
    doubt => !doubt.reply && !["resolved", "closed"].includes(doubt.status)
  ).length;

  const published = teacherState.announcements.filter(
    item => item.published !== false
  ).length;

  const studentIDs = new Set(
    teacherState.logs.map(log => log.uid).filter(Boolean)
  );

  const stats = element("div", "teacher-stats");

  stats.append(
    renderStat("Awaiting review", pending),
    renderStat("Open doubts", unanswered),
    renderStat("Published notices", published),
    renderStat("Active learners", studentIDs.size)
  );

  section.appendChild(stats);

  const actions = makeSection("Action center", "Focus on the tasks that need attention.");

  const list = element("div", "teacher-list");

  const actionItems = [
    {
      title: "Review practice logs",
      description: `${pending} submission(s) awaiting review.`,
      action: "verification"
    },
    {
      title: "Respond to student doubts",
      description: `${unanswered} question(s) awaiting a response.`,
      action: "doubts"
    },
    {
      title: "Manage announcements",
      description: "Publish classroom updates and study resources.",
      action: "announcements"
    },
    {
      title: "Student insights",
      description: "Review recorded practice activity.",
      action: "student-insights"
    }
  ];

  actionItems.forEach(item => {
    const card = element("article", "teacher-item");
    const content = element("div", "teacher-item-content");

    content.append(
      element("h3", "", item.title),
      element("p", "", item.description)
    );

    card.append(
      content,
      button("Open", () => teacherState.showPage(item.action), "secondary")
    );

    list.appendChild(card);
  });

  actions.section.appendChild(list);
  section.appendChild(actions.section);
}

// ============================================================
// PRACTICE VERIFICATION
// ============================================================

function renderPracticeItem(log) {
  const card = element("article", "teacher-item");
  const content = element("div", "teacher-item-content");

  content.append(
    element("h3", "", log.topic || "Math practice"),
    element("p", "", `Student: ${log.studentName || log.studentEmail || log.uid || "Unknown"}`),
    element("p", "", `Date: ${formatDate(log.date)} · ${safeNumber(log.questions)} questions · ${formatDuration(log.duration)}`),
    element("p", "", `Submitted: ${formatDateTime(log.createdAt)}`)
  );

  if (log.notes) {
    content.appendChild(element("p", "", `Notes: ${log.notes}`));
  }

  if (log.proofURL) {
    const link = document.createElement("a");
    link.href = log.proofURL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "View proof image";
    content.appendChild(link);
  }

  const status = createStatusBadge(log.status || "submitted");
  content.appendChild(status);

  const actions = element("div", "teacher-item-actions");

  if (!["verified", "rejected"].includes(log.status)) {
    const feedback = document.createElement("textarea");
    feedback.className = "teacher-feedback";
    feedback.placeholder = "Optional feedback for the student...";
    feedback.maxLength = 1000;
    feedback.setAttribute("aria-label", "Teacher feedback");

    const approve = button("Verify", async () => {
      await updateLogStatus(log, "verified", feedback.value.trim());
    });

    const reject = button("Reject", async () => {
      const confirmed = await confirmDialog({
        title: "Reject this practice log?",
        message: "The student will see the rejection status and your feedback.",
        confirmLabel: "Reject log",
        danger: true
      });

      if (confirmed) {
        await updateLogStatus(log, "rejected", feedback.value.trim());
      }
    }, "danger");

    actions.append(approve, reject);
    content.appendChild(feedback);
  } else if (log.teacherFeedback) {
    content.appendChild(
      element("p", "", `Feedback: ${log.teacherFeedback}`)
    );
  }

  card.append(content, actions);

  return card;
}

async function updateLogStatus(log, status, feedback) {
  if (!log.id) {
    notify("This practice record has no valid ID.", "error");
    return;
  }

  try {
    await update(
      ref(teacherState.db, `${PATHS.logs}/${log.id}`),
      {
        status,
        teacherFeedback: feedback,
        reviewedBy: currentUID(),
        reviewedByName: currentName(),
        reviewedAt: Date.now(),
        updatedAt: Date.now()
      }
    );

    notify(
      status === "verified"
        ? "Practice log verified."
        : "Practice log rejected.",
      "success"
    );

  } catch (error) {
    reportError(error, "Could not update practice log");
  }
}

function renderVerification() {
  const section = getPage(
    "verification",
    "Verification Queue",
    "Review student practice sessions and record your decision."
  );

  const panel = makeSection(
    "Practice submissions",
    "Pending submissions appear first."
  );

  const filter = document.createElement("select");
  filter.className = "teacher-filter";
  filter.setAttribute("aria-label", "Filter practice submissions");

  [
    ["all", "All submissions"],
    ["submitted", "Submitted"],
    ["verified", "Verified"],
    ["rejected", "Rejected"]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    filter.appendChild(option);
  });

  panel.heading.appendChild(filter);

  const list = element("div", "teacher-list");

  function renderList() {
    list.replaceChildren();

    let logs = [...teacherState.logs];

    if (filter.value !== "all") {
      logs = logs.filter(log => log.status === filter.value);
    }

    logs.sort((a, b) => {
      const aPending = !["verified", "rejected"].includes(a.status);
      const bPending = !["verified", "rejected"].includes(b.status);

      if (aPending !== bPending) return aPending ? -1 : 1;

      return safeNumber(b.createdAt) - safeNumber(a.createdAt);
    });

    if (!logs.length) {
      list.appendChild(createEmptyState({
        icon: "✓",
        title: "No submissions found",
        description: "Submissions matching this filter will appear here."
      }));

      return;
    }

    logs.forEach(log => list.appendChild(renderPracticeItem(log)));
  }

  filter.addEventListener("change", renderList);
  renderList();

  panel.section.appendChild(list);
  section.appendChild(panel.section);
}

// ============================================================
// ANNOUNCEMENT MANAGEMENT
// ============================================================

function renderAnnouncementItem(item) {
  const card = element("article", "teacher-item");
  const content = element("div", "teacher-item-content");

  content.append(
    element("h3", "", item.title || "Untitled announcement"),
    element("p", "", item.body || item.message || ""),
    element("p", "", `Created ${formatDateTime(item.createdAt)}`)
  );

  const status = createStatusBadge(
    item.published === false ? "inactive" : "published"
  );

  content.appendChild(status);

  if (item.attachmentURL) {
    const link = document.createElement("a");
    link.href = item.attachmentURL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.attachmentName || "View attachment";
    content.appendChild(link);
  }

  const actions = element("div", "teacher-item-actions");

  actions.append(
    button("Edit", () => openAnnouncementEditor(item), "secondary"),
    button(
      item.published === false ? "Publish" : "Unpublish",
      () => toggleAnnouncementPublished(item),
      "secondary"
    ),
    button("Delete", () => deleteAnnouncement(item), "danger")
  );

  card.append(content, actions);

  return card;
}

function openAnnouncementEditor(existing = null) {
  const form = document.createElement("form");
  form.className = "teacher-form";

  const titleField = document.createElement("div");
  titleField.className = "teacher-field";

  const titleLabel = element("label", "", "Announcement title");
  titleLabel.htmlFor = "teacherAnnouncementTitle";

  const titleInput = document.createElement("input");
  titleInput.id = "teacherAnnouncementTitle";
  titleInput.name = "title";
  titleInput.required = true;
  titleInput.maxLength = 150;
  titleInput.value = existing?.title || "";
  titleInput.placeholder = "e.g. Weekly practice assignment";

  titleField.append(titleLabel, titleInput);

  const bodyField = document.createElement("div");
  bodyField.className = "teacher-field";

  const bodyLabel = element("label", "", "Announcement details");
  bodyLabel.htmlFor = "teacherAnnouncementBody";

  const bodyInput = document.createElement("textarea");
  bodyInput.id = "teacherAnnouncementBody";
  bodyInput.name = "body";
  bodyInput.required = true;
  bodyInput.maxLength = MAX_ANNOUNCEMENT_LENGTH;
  bodyInput.value = existing?.body || existing?.message || "";
  bodyInput.placeholder = "Write the announcement...";

  bodyField.append(bodyLabel, bodyInput);

  const attachmentField = document.createElement("div");
  attachmentField.className = "teacher-field";

  const attachmentLabel = element("label", "", "Attachment (optional)");
  attachmentLabel.htmlFor = "teacherAnnouncementFile";

  const attachmentInput = document.createElement("input");
  attachmentInput.id = "teacherAnnouncementFile";
  attachmentInput.type = "file";
  attachmentInput.accept = ".pdf,image/jpeg,image/png,image/webp";

  attachmentField.append(attachmentLabel, attachmentInput);

  form.append(titleField, bodyField, attachmentField);

  const modal = openModal({
    title: existing ? "Edit announcement" : "Create announcement",
    description: "Publish a clear and useful classroom update.",
    contentElement: form,
    maxWidth: "620px",
    actions: [
      {
        label: "Cancel",
        variant: "secondary"
      },
      {
        label: existing ? "Save changes" : "Publish announcement",
        variant: "primary",
        closeOnClick: false,
        onClick: async () => {
          const title = titleInput.value.trim();
          const body = bodyInput.value.trim();

          if (!title || !body) {
            notify("Enter both a title and announcement details.", "warning");
            return;
          }

          if (body.length > MAX_ANNOUNCEMENT_LENGTH) {
            notify("Announcement is too long.", "warning");
            return;
          }

          await saveAnnouncement({
            existing,
            title,
            body,
            file: attachmentInput.files?.[0] || null
          });

          modal.close();
        }
      }
    ]
  });
}

async function saveAnnouncement({ existing, title, body, file }) {
  let uploadedPath = "";
  let attachmentURL = existing?.attachmentURL || "";
  let attachmentName = existing?.attachmentName || "";

  try {
    if (file) {
      if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
        notify(`Attachment must be smaller than ${MAX_ATTACHMENT_MB} MB.`, "warning");
        return;
      }

      const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp"
      ];

      if (!allowedTypes.includes(file.type)) {
        notify("Only PDF, JPG, PNG, and WebP attachments are allowed.", "warning");
        return;
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

      uploadedPath =
        `teacher-announcements/${currentUID()}/${Date.now()}-${safeName}`;

      const uploaded = await uploadBytes(
        storageRef(teacherState.storage, uploadedPath),
        file,
        { contentType: file.type }
      );

      attachmentURL = await getDownloadURL(uploaded.ref);
      attachmentName = file.name;
    }

    const record = {
      title,
      body,
      authorUID: currentUID(),
      authorName: currentName(),
      published: true,
      updatedAt: Date.now(),
      ...(attachmentURL ? { attachmentURL, attachmentName } : {})
    };

    if (existing?.id) {
      await update(
        ref(teacherState.db, `${PATHS.announcements}/${existing.id}`),
        record
      );
    } else {
      const announcementRef = push(
        ref(teacherState.db, PATHS.announcements)
      );

      await set(announcementRef, {
        ...record,
        id: announcementRef.key,
        createdAt: Date.now()
      });
    }

    notify(
      existing ? "Announcement updated." : "Announcement published.",
      "success"
    );

  } catch (error) {
    reportError(error, "Could not save announcement");

    if (uploadedPath) {
      try {
        await deleteObject(storageRef(teacherState.storage, uploadedPath));
      } catch {
        // A cleanup failure must not hide the original error.
      }
    }
  }
}

async function toggleAnnouncementPublished(item) {
  if (!item.id) return;

  try {
    await update(
      ref(teacherState.db, `${PATHS.announcements}/${item.id}`),
      {
        published: item.published === false,
        updatedAt: Date.now()
      }
    );

    notify("Announcement visibility updated.", "success");

  } catch (error) {
    reportError(error, "Could not update announcement");
  }
}

async function deleteAnnouncement(item) {
  const confirmed = await confirmDialog({
    title: "Delete announcement?",
    message: "This removes the announcement from the classroom notice board.",
    confirmLabel: "Delete",
    danger: true
  });

  if (!confirmed) return;

  try {
    await remove(
      ref(teacherState.db, `${PATHS.announcements}/${item.id}`)
    );

    notify("Announcement deleted.", "success");

  } catch (error) {
    reportError(error, "Could not delete announcement");
  }
}

function renderAnnouncements() {
  const section = getPage(
    "announcements",
    "Announcement Manager",
    "Publish class updates, study guidance, and resource attachments."
  );

  const panel = makeSection(
    "Class announcements",
    "Only publish information that students should be able to see."
  );

  panel.heading.appendChild(
    button("Create announcement", () => openAnnouncementEditor())
  );

  const list = element("div", "teacher-list");

  if (!teacherState.announcements.length) {
    list.appendChild(createEmptyState({
      icon: "✦",
      title: "No announcements yet",
      description: "Create your first classroom announcement.",
      actionLabel: "Create announcement",
      onAction: () => openAnnouncementEditor()
    }));
  } else {
    [...teacherState.announcements]
      .sort((a, b) => safeNumber(b.createdAt) - safeNumber(a.createdAt))
      .forEach(item => list.appendChild(renderAnnouncementItem(item)));
  }

  panel.section.appendChild(list);
  section.appendChild(panel.section);
}

// ============================================================
// PRIVATE DOUBT INBOX
// ============================================================

function renderDoubtItem(doubt) {
  const card = element("article", "teacher-item");
  const content = element("div", "teacher-item-content");

  content.append(
    element("h3", "", doubt.subject || "Math question"),
    element("p", "", `From: ${doubt.studentName || doubt.studentEmail || doubt.uid || "Student"}`),
    element("p", "", `Topic: ${doubt.category || "Other"}`),
    element("p", "", doubt.question || ""),
    element("p", "", `Submitted: ${formatDateTime(doubt.createdAt)}`)
  );

  if (doubt.reply) {
    content.appendChild(element("p", "", `Your reply: ${doubt.reply}`));
  }

  content.appendChild(
    createStatusBadge(doubt.status || "submitted")
  );

  const actions = element("div", "teacher-item-actions");

  actions.appendChild(
    button(
      doubt.reply ? "Edit reply" : "Reply",
      () => openDoubtReply(doubt)
    )
  );

  card.append(content, actions);

  return card;
}

function openDoubtReply(doubt) {
  const form = document.createElement("form");
  form.className = "teacher-form";

  const label = element("label", "", "Your response");
  label.htmlFor = "teacherDoubtReply";

  const textarea = document.createElement("textarea");
  textarea.id = "teacherDoubtReply";
  textarea.maxLength = 3000;
  textarea.required = true;
  textarea.value = doubt.reply || "";
  textarea.placeholder = "Explain the solution clearly...";

  const field = element("div", "teacher-field");
  field.append(label, textarea);

  form.appendChild(field);

  const modal = openModal({
    title: "Respond to student",
    description: doubt.subject || "Student doubt",
    contentElement: form,
    maxWidth: "620px",
    actions: [
      {
        label: "Cancel",
        variant: "secondary"
      },
      {
        label: "Send response",
        variant: "primary",
        closeOnClick: false,
        onClick: async () => {
          const reply = textarea.value.trim();

          if (!reply) {
            notify("Write a response before sending.", "warning");
            textarea.focus();
            return;
          }

          try {
            await update(
              ref(teacherState.db, `${PATHS.doubts}/${doubt.id}`),
              {
                reply,
                status: "resolved",
                repliedBy: currentUID(),
                repliedByName: currentName(),
                repliedAt: Date.now(),
                updatedAt: Date.now()
              }
            );

            notify("Response sent to the student.", "success");
            modal.close();

          } catch (error) {
            reportError(error, "Could not send response");
          }
        }
      }
    ]
  });
}

function renderDoubts() {
  const section = getPage(
    "doubts",
    "Doubt Inbox",
    "Respond to students' private mathematics questions."
  );

  const panel = makeSection(
    "Student questions",
    "Only respond to doubts you are authorized to access."
  );

  const list = element("div", "teacher-list");

  const doubts = [...teacherState.doubts]
    .sort((a, b) => safeNumber(b.createdAt) - safeNumber(a.createdAt));

  if (!doubts.length) {
    list.appendChild(createEmptyState({
      icon: "?",
      title: "No student doubts",
      description: "New questions will appear here when submitted."
    }));
  } else {
    doubts.forEach(doubt => list.appendChild(renderDoubtItem(doubt)));
  }

  panel.section.appendChild(list);
  section.appendChild(panel.section);
}

// ============================================================
// STUDENT INSIGHTS
// ============================================================

function renderStudentInsights() {
  const section = getPage(
    "student-insights",
    "Student Insights",
    "Review recorded practice activity and participation."
  );

  const grouped = new Map();

  teacherState.logs.forEach(log => {
    const key = log.uid || "unknown";

    if (!grouped.has(key)) {
      grouped.set(key, {
        uid: key,
        name: log.studentName || log.studentEmail || key,
        sessions: 0,
        questions: 0,
        minutes: 0,
        verified: 0
      });
    }

    const item = grouped.get(key);

    item.sessions += 1;
    item.questions += Math.max(0, safeNumber(log.questions));
    item.minutes += Math.max(0, safeNumber(log.duration));

    if (log.status === "verified") {
      item.verified += 1;
    }
  });

  const students = [...grouped.values()]
    .sort((a, b) => b.questions - a.questions);

  const panel = makeSection(
    "Practice activity",
    `${students.length} student account(s) with recorded sessions`
  );

  if (!students.length) {
    panel.section.appendChild(createEmptyState({
      icon: "∑",
      title: "No practice data yet",
      description: "Student insights will appear after practice logs are submitted."
    }));

    section.appendChild(panel.section);
    return;
  }

  const maxQuestions = Math.max(
    1,
    ...students.map(student => student.questions)
  );

  const tableWrap = element("div", "teacher-table-wrap");
  const table = element("table", "teacher-table");

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  [
    "Student",
    "Sessions",
    "Questions",
    "Study time",
    "Verified",
    "Activity"
  ].forEach(label => {
    headerRow.appendChild(element("th", "", label));
  });

  thead.appendChild(headerRow);

  const tbody = document.createElement("tbody");

  students.forEach(student => {
    const row = document.createElement("tr");

    row.append(
      element("td", "", student.name),
      element("td", "", String(student.sessions)),
      element("td", "", String(student.questions)),
      element("td", "", formatDuration(student.minutes)),
      element("td", "", String(student.verified))
    );

    const activityCell = document.createElement("td");
    const bar = element("div", "teacher-insight-bar");
    const fill = document.createElement("span");

    fill.style.width =
      `${Math.min(100, student.questions / maxQuestions * 100)}%`;

    bar.appendChild(fill);
    activityCell.appendChild(bar);
    row.appendChild(activityCell);

    tbody.appendChild(row);
  });

  table.append(thead, tbody);
  tableWrap.appendChild(table);
  panel.section.appendChild(tableWrap);
  section.appendChild(panel.section);
}

// ============================================================
// ACTION CENTER
// ============================================================

function renderActionCenter() {
  const section = getPage(
    "action-center",
    "Action Center",
    "A focused overview of tasks requiring your attention."
  );

  const pending = teacherState.logs.filter(
    log => !["verified", "rejected"].includes(log.status)
  ).length;

  const unanswered = teacherState.doubts.filter(
    doubt => !doubt.reply && !["resolved", "closed"].includes(doubt.status)
  ).length;

  const items = [
    {
      title: "Practice verification",
      description: `${pending} log(s) need review.`,
      page: "verification"
    },
    {
      title: "Student support",
      description: `${unanswered} doubt(s) await a response.`,
      page: "doubts"
    },
    {
      title: "Classroom communications",
      description: "Create or update a class announcement.",
      page: "announcements"
    },
    {
      title: "Learning insights",
      description: "Explore recorded student practice activity.",
      page: "student-insights"
    }
  ];

  const panel = makeSection("Your priorities");
  const list = element("div", "teacher-list");

  items.forEach(item => {
    const card = element("article", "teacher-item");
    const content = element("div", "teacher-item-content");

    content.append(
      element("h3", "", item.title),
      element("p", "", item.description)
    );

    card.append(
      content,
      button("Open", () => teacherState.showPage(item.page), "secondary")
    );

    list.appendChild(card);
  });

  panel.section.appendChild(list);
  section.appendChild(panel.section);
}

// ============================================================
// PAGE RENDERING
// ============================================================

function renderCurrentPage() {
  switch (teacherState.currentPage) {
    case "dashboard":
      renderDashboard();
      break;

    case "action-center":
      renderActionCenter();
      break;

    case "verification":
      renderVerification();
      break;

    case "announcements":
      renderAnnouncements();
      break;

    case "doubts":
      renderDoubts();
      break;

    case "student-insights":
      renderStudentInsights();
      break;
  }
}

function renderAllPages() {
  renderDashboard();
  renderActionCenter();
  renderVerification();
  renderAnnouncements();
  renderDoubts();
  renderStudentInsights();
}

// ============================================================
// SUBSCRIPTIONS
// ============================================================

function loadLogs() {
  return subscribe(PATHS.logs, value => {
    teacherState.logs = toArray(value);

    if (teacherState.initialized) {
      renderCurrentPage();
    }
  });
}

function loadAnnouncements() {
  return subscribe(PATHS.announcements, value => {
    teacherState.announcements = toArray(value);

    if (teacherState.initialized) {
      renderCurrentPage();
    }
  });
}

function loadDoubts() {
  return subscribe(PATHS.doubts, value => {
    teacherState.doubts = toArray(value);

    if (teacherState.initialized) {
      renderCurrentPage();
    }
  });
}

// ============================================================
// CLEANUP
// ============================================================

function cleanup() {
  teacherState.unsubscribers.forEach(unsubscribe => {
    try {
      unsubscribe();
    } catch (error) {
      console.warn("[Math Class Teacher] Listener cleanup failed:", error);
    }
  });

  teacherState.unsubscribers = [];
  teacherState.initialized = false;
}

// ============================================================
// INITIALIZATION
// ============================================================

export async function init(context) {
  cleanup();

  teacherState.auth = context.auth;
  teacherState.db = context.db;
  teacherState.user = context.user;
  teacherState.profile = context.profile;
  teacherState.toast = context.toast;
  teacherState.showPage = context.showPage;

  const config = await import("./firebase-config.js");
  teacherState.storage = config.storage;

  if (!teacherState.user?.uid) {
    throw new Error("A signed-in teacher account is required.");
  }

  if (context.role !== "teacher") {
    throw new Error("This module is only for teacher accounts.");
  }

  injectStyles();

  teacherState.currentPage = "dashboard";
  teacherState.initialized = true;

  renderAllPages();

  loadLogs();
  loadAnnouncements();
  loadDoubts();

  window.addEventListener("mathclass:pagechange", event => {
    if (event.detail?.role !== "teacher") return;

    teacherState.currentPage = event.detail.page || "dashboard";
    renderCurrentPage();
  });

  return {
    cleanup,
    refresh: renderAllPages
  };
}
