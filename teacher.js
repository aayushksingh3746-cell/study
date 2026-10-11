/* ============================================================
   Math Class Virtual Classroom
   teacher.js
   Teacher dashboard / review / announcements / chat / doubts
   Firebase Modular SDK 10.5.0
   ============================================================ */

import {
  ref,
  get,
  set,
  push,
  update,
  remove,
  query,
  orderByChild,
  limitToLast,
  onValue,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

import {
  storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "./firebase-config.js";

import {
  escapeHTML,
  formatDate,
  formatDateTime,
  createStatusBadge,
  createEmptyState,
  createSkeleton,
  validateRequired,
  validateFileSize,
  openModal,
  safeFirebaseStorageURL
} from "./components.js";

const PATHS = {
  users: "users",
  logs: "daily_study_logs",
  announcements: "announcements",
  chat: "class_chat",
  doubts: "direct_doubts"
};

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_CHAT_LENGTH = 1000;
const MAX_ANNOUNCEMENT_TITLE = 120;
const MAX_ANNOUNCEMENT_BODY = 5000;

let state = {
  auth: null,
  db: null,
  storage: null,
  user: null,
  profile: null,
  toast: null,
  showPage: null,

  initialized: false,
  currentPage: "teacher-dashboard",

  logs: [],
  announcements: [],
  chatMessages: [],
  doubts: [],
  students: [],

  unsubscribers: [],
  pageChangeHandler: null,
  submitting: false
};

/* ============================================================
   BASIC HELPERS
   ============================================================ */

function uid() {
  return state.user?.uid || "";
}

function teacherName() {
  return (
    state.profile?.displayName ||
    state.profile?.name ||
    state.user?.displayName ||
    state.user?.email ||
    "Teacher"
  );
}

function now() {
  return Date.now();
}

function showToast(message, error = false) {
  if (typeof state.toast === "function") {
    state.toast(message, error);
  } else {
    console[error ? "error" : "log"](message);
  }
}

function el(selector) {
  return document.querySelector(selector);
}

function all(selector) {
  return [...document.querySelectorAll(selector)];
}

function escape(value) {
  return escapeHTML(String(value ?? ""));
}

function getRecords(snapshot) {
  const value = snapshot.val() || {};

  return Object.entries(value)
    .map(([id, record]) => ({
      id,
      ...(record || {})
    }))
    .filter(Boolean);
}

function sortNewest(records, field = "createdAt") {
  return [...records].sort(
    (a, b) => Number(b?.[field] || 0) - Number(a?.[field] || 0)
  );
}

function addUnsubscriber(unsubscribe) {
  if (typeof unsubscribe === "function") {
    state.unsubscribers.push(unsubscribe);
  }
}

function cleanupListeners() {
  for (const unsubscribe of state.unsubscribers.splice(0)) {
    try {
      unsubscribe();
    } catch (error) {
      console.warn("Teacher listener cleanup failed:", error);
    }
  }
}

function isTeacher() {
  const role = state.profile?.role;
  return role === "teacher" || role === "admin";
}

/* ============================================================
   SAFE PAGE NAVIGATION
   ============================================================ */

function navigate(page) {
  state.currentPage = page;

  if (typeof state.showPage === "function") {
    state.showPage(page);
  }

  renderCurrentPage();
}

function renderCurrentPage() {
  const container =
    el("#pageContent") ||
    el("#mainContent") ||
    el("#teacherContent");

  if (!container) return;

  switch (state.currentPage) {
    case "teacher-dashboard":
    case "teacher":
    case "dashboard":
      renderDashboard(container);
      break;

    case "teacher-logs":
    case "teacher-practice":
    case "practice-review":
      renderPracticeReview(container);
      break;

    case "teacher-announcements":
      renderAnnouncements(container);
      break;

    case "teacher-chat":
    case "class-chat":
      renderChat(container);
      break;

    case "teacher-doubts":
    case "doubt-inbox":
      renderDoubts(container);
      break;

    case "teacher-students":
      renderStudents(container);
      break;

    case "teacher-profile":
    case "profile":
      renderProfile(container);
      break;

    default:
      renderDashboard(container);
  }
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function renderDashboard(container) {
  const pendingLogs = state.logs.filter(
    item => item.status === "submitted" || !item.status
  ).length;

  const pendingDoubts = state.doubts.filter(
    item => !["resolved", "closed"].includes(item.status)
  ).length;

  const publishedAnnouncements = state.announcements.filter(
    item => item.published === true
  ).length;

  const visibleChat = state.chatMessages.filter(
    item => item.deleted !== true && item.hidden !== true
  ).length;

  container.innerHTML = `
    <section class="teacher-dashboard">
      <div class="page-header">
        <div>
          <p class="eyebrow">TEACHER PORTAL</p>
          <h1>Welcome, ${escape(teacherName())}</h1>
          <p>Manage student practice, doubts, announcements and classroom communication.</p>
        </div>
      </div>

      <div class="stats-grid">
        ${statCard("Practice Reviews", pendingLogs, "teacher-logs", "Pending student submissions")}
        ${statCard("Open Doubts", pendingDoubts, "teacher-doubts", "Questions waiting for a reply")}
        ${statCard("Announcements", publishedAnnouncements, "teacher-announcements", "Published classroom notices")}
        ${statCard("Chat Messages", visibleChat, "teacher-chat", "Visible classroom messages")}
      </div>

      <div class="teacher-dashboard-grid">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>Recent Practice</h2>
              <p>Latest student submissions requiring attention.</p>
            </div>
            <button class="btn btn-secondary" data-teacher-action="logs">
              View all
            </button>
          </div>

          ${renderRecentLogs()}
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>Recent Doubts</h2>
              <p>Private student questions.</p>
            </div>
            <button class="btn btn-secondary" data-teacher-action="doubts">
              Open inbox
            </button>
          </div>

          ${renderRecentDoubts()}
        </article>
      </div>

      <article class="panel">
        <div class="panel-heading">
          <div>
            <h2>Quick actions</h2>
            <p>Common classroom tasks.</p>
          </div>
        </div>

        <div class="quick-actions">
          <button class="btn btn-primary" data-teacher-action="new-announcement">
            New announcement
          </button>

          <button class="btn btn-secondary" data-teacher-action="logs">
            Review practice
          </button>

          <button class="btn btn-secondary" data-teacher-action="doubts">
            Answer doubts
          </button>

          <button class="btn btn-secondary" data-teacher-action="chat">
            Open class chat
          </button>
        </div>
      </article>
    </section>
  `;

  bindDashboardEvents(container);
}

function statCard(title, value, page, subtitle) {
  return `
    <button class="stat-card" data-teacher-action="${escape(page)}">
      <span class="stat-card-label">${escape(title)}</span>
      <strong class="stat-card-value">${escape(value)}</strong>
      <span class="stat-card-subtitle">${escape(subtitle)}</span>
    </button>
  `;
}

function renderRecentLogs() {
  const records = sortNewest(state.logs).slice(0, 5);

  if (!records.length) {
    return createEmptyState(
      "No practice submissions",
      "Student practice logs will appear here."
    );
  }

  return `
    <div class="record-list">
      ${records.map(log => `
        <button class="record-row" data-log-id="${escape(log.id)}">
          <div>
            <strong>${escape(log.studentName || "Student")}</strong>
            <span>${escape(log.topic || "Practice session")}</span>
          </div>
          <div class="record-row-meta">
            ${createStatusBadge(log.status || "submitted")}
            <small>${formatDate(log.createdAt || log.date)}</small>
          </div>
        </button>
      `).join("")}
    </div>
  `;
}

function renderRecentDoubts() {
  const records = sortNewest(state.doubts).slice(0, 5);

  if (!records.length) {
    return createEmptyState(
      "No doubts",
      "Student questions will appear here."
    );
  }

  return `
    <div class="record-list">
      ${records.map(doubt => `
        <button class="record-row" data-doubt-id="${escape(doubt.id)}">
          <div>
            <strong>${escape(doubt.studentName || "Student")}</strong>
            <span>${escape(doubt.subject || "Mathematics")}</span>
          </div>
          <div class="record-row-meta">
            ${createStatusBadge(doubt.status || "submitted")}
            <small>${formatDate(doubt.createdAt)}</small>
          </div>
        </button>
      `).join("")}
    </div>
  `;
}

function bindDashboardEvents(container) {
  all("[data-teacher-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.teacherAction;

      if (action === "new-announcement") {
        openAnnouncementEditor();
      } else if (action === "logs") {
        navigate("teacher-logs");
      } else if (action === "doubts") {
        navigate("teacher-doubts");
      } else if (action === "chat") {
        navigate("teacher-chat");
      } else if (action === "teacher-profile" || action === "profile") {
        navigate("teacher-profile");
      } else if (action === "teacher-students") {
        navigate("teacher-students");
      } else {
        navigate(action);
      }
    });
  });

  all("[data-log-id]").forEach(button => {
    button.addEventListener("click", () => {
      const log = state.logs.find(item => item.id === button.dataset.logId);
      if (log) openLogReview(log);
    });
  });

  all("[data-doubt-id]").forEach(button => {
    button.addEventListener("click", () => {
      const doubt = state.doubts.find(
        item => item.id === button.dataset.doubtId
      );

      if (doubt) openDoubtReply(doubt);
    });
  });
}

/* ============================================================
   PRACTICE REVIEW
   ============================================================ */

function renderPracticeReview(container) {
  const logs = sortNewest(state.logs);

  container.innerHTML = `
    <section class="teacher-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">PRACTICE REVIEW</p>
          <h1>Student practice</h1>
          <p>Review submitted practice sessions and provide feedback.</p>
        </div>
      </div>

      <div class="toolbar">
        <select id="logStatusFilter" class="input">
          <option value="all">All submissions</option>
          <option value="submitted">Pending review</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>

        <input
          id="logSearch"
          class="input"
          type="search"
          placeholder="Search student or topic..."
        />
      </div>

      <div id="teacherLogsList">
        ${renderLogsTable(logs)}
      </div>
    </section>
  `;

  const filter = el("#logStatusFilter");
  const search = el("#logSearch");

  const refresh = () => {
    const status = filter?.value || "all";
    const term = (search?.value || "").trim().toLowerCase();

    const filtered = logs.filter(log => {
      const statusMatch =
        status === "all" ||
        (log.status || "submitted") === status;

      const searchMatch =
        !term ||
        String(log.studentName || "").toLowerCase().includes(term) ||
        String(log.studentEmail || "").toLowerCase().includes(term) ||
        String(log.topic || "").toLowerCase().includes(term);

      return statusMatch && searchMatch;
    });

    const list = el("#teacherLogsList");
    if (list) list.innerHTML = renderLogsTable(filtered);

    bindLogButtons();
  };

  filter?.addEventListener("change", refresh);
  search?.addEventListener("input", refresh);

  bindLogButtons();
}

function renderLogsTable(logs) {
  if (!logs.length) {
    return createEmptyState(
      "No practice logs found",
      "There are no submissions matching your current filter."
    );
  }

  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Topic</th>
            <th>Questions</th>
            <th>Duration</th>
            <th>Date</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          ${logs.map(log => `
            <tr>
              <td>
                <strong>${escape(log.studentName || "Student")}</strong>
                <small>${escape(log.studentEmail || "")}</small>
              </td>

              <td>${escape(log.topic || "—")}</td>
              <td>${escape(log.questions ?? log.questionsSolved ?? "—")}</td>
              <td>${escape(log.duration ?? log.durationMinutes ?? "—")} min</td>
              <td>${formatDate(log.date || log.createdAt)}</td>

              <td>
                ${createStatusBadge(log.status || "submitted")}
              </td>

              <td>
                <button
                  class="btn btn-small btn-secondary"
                  data-review-log="${escape(log.id)}"
                >
                  Review
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function bindLogButtons() {
  all("[data-review-log]").forEach(button => {
    button.addEventListener("click", () => {
      const log = state.logs.find(
        item => item.id === button.dataset.reviewLog
      );

      if (log) openLogReview(log);
    });
  });
}

function openLogReview(log) {
  const proofURL = safeFirebaseStorageURL?.(
    log.proofURL || log.proofUrl || ""
  );

  const content = `
    <div class="modal-header">
      <div>
        <p class="eyebrow">PRACTICE REVIEW</p>
        <h2>${escape(log.studentName || "Student")}</h2>
      </div>
    </div>

    <div class="review-grid">
      <div>
        <span class="field-label">Topic</span>
        <strong>${escape(log.topic || "—")}</strong>
      </div>

      <div>
        <span class="field-label">Date</span>
        <strong>${formatDate(log.date || log.createdAt)}</strong>
      </div>

      <div>
        <span class="field-label">Questions</span>
        <strong>${escape(log.questions ?? log.questionsSolved ?? "—")}</strong>
      </div>

      <div>
        <span class="field-label">Duration</span>
        <strong>${escape(log.duration ?? log.durationMinutes ?? "—")} minutes</strong>
      </div>
    </div>

    <div class="form-group">
      <label>Student notes</label>
      <div class="readonly-box">${escape(log.notes || "No notes provided.")}</div>
    </div>

    ${
      proofURL
        ? `
          <div class="form-group">
            <label>Proof</label>
            <a
              class="btn btn-secondary"
              href="${escape(proofURL)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open proof
            </a>
          </div>
        `
        : ""
    }

    <div class="form-group">
      <label for="teacherFeedback">Teacher feedback</label>
      <textarea
        id="teacherFeedback"
        class="input textarea"
        maxlength="2000"
        rows="5"
        placeholder="Write useful feedback for the student..."
      >${escape(log.teacherFeedback || "")}</textarea>
    </div>

    <div class="modal-actions">
      <button
        type="button"
        class="btn btn-secondary"
        data-review-action="reject"
      >
        Reject
      </button>

      <button
        type="button"
        class="btn btn-primary"
        data-review-action="verify"
      >
        Mark verified
      </button>
    </div>
  `;

  openModal(content);

  all("[data-review-action]").forEach(button => {
    button.addEventListener("click", async () => {
      const feedback =
        el("#teacherFeedback")?.value.trim() || "";

      const status =
        button.dataset.reviewAction === "verify"
          ? "verified"
          : "rejected";

      await reviewLog(log, status, feedback);
    });
  });
}

async function reviewLog(log, status, feedback) {
  if (!state.db || !uid() || !log.id) return;

  try {
    const updates = {
      status,
      teacherFeedback: feedback,
      reviewedBy: uid(),
      reviewedByName: teacherName(),
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await update(ref(state.db, `${PATHS.logs}/${log.id}`), updates);

    closeAnyModal();
    showToast(
      status === "verified"
        ? "Practice marked as verified."
        : "Practice marked as rejected."
    );
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not update practice log.", true);
  }
}

/* ============================================================
   ANNOUNCEMENTS
   ============================================================ */

function renderAnnouncements(container) {
  const records = sortNewest(state.announcements);

  container.innerHTML = `
    <section class="teacher-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">CLASSROOM COMMUNICATION</p>
          <h1>Announcements</h1>
          <p>Create and manage notices for your mathematics class.</p>
        </div>

        <button id="newAnnouncementBtn" class="btn btn-primary">
          New announcement
        </button>
      </div>

      <div id="announcementList">
        ${renderAnnouncementList(records)}
      </div>
    </section>
  `;

  el("#newAnnouncementBtn")?.addEventListener(
    "click",
    () => openAnnouncementEditor()
  );

  bindAnnouncementButtons();
}

function renderAnnouncementList(records) {
  if (!records.length) {
    return createEmptyState(
      "No announcements",
      "Create your first classroom announcement."
    );
  }

  return `
    <div class="announcement-list">
      ${records.map(item => `
        <article class="announcement-card">
          <div class="announcement-card-header">
            <div>
              <h3>${escape(item.title || "Untitled announcement")}</h3>
              <p>
                ${formatDateTime(item.createdAt || item.updatedAt)}
                · ${item.published ? "Published" : "Draft"}
              </p>
            </div>

            ${createStatusBadge(item.published ? "published" : "draft")}
          </div>

          <div class="announcement-body">
            ${escape(item.body || "").replace(/\n/g, "<br>")}
          </div>

          ${
            item.attachmentURL || item.attachmentUrl
              ? `
                <a
                  class="attachment-link"
                  href="${escape(
                    safeFirebaseStorageURL?.(
                      item.attachmentURL || item.attachmentUrl
                    ) || "#"
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ${escape(item.attachmentName || "Open attachment")}
                </a>
              `
              : ""
          }

          <div class="announcement-actions">
            <button
              class="btn btn-small btn-secondary"
              data-edit-announcement="${escape(item.id)}"
            >
              Edit
            </button>

            <button
              class="btn btn-small btn-secondary"
              data-toggle-announcement="${escape(item.id)}"
            >
              ${item.published ? "Unpublish" : "Publish"}
            </button>

            <button
              class="btn btn-small btn-danger"
              data-delete-announcement="${escape(item.id)}"
            >
              Delete
            </button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function bindAnnouncementButtons() {
  all("[data-edit-announcement]").forEach(button => {
    button.addEventListener("click", () => {
      const item = state.announcements.find(
        announcement =>
          announcement.id === button.dataset.editAnnouncement
      );

      if (item) openAnnouncementEditor(item);
    });
  });

  all("[data-toggle-announcement]").forEach(button => {
    button.addEventListener("click", () => {
      const item = state.announcements.find(
        announcement =>
          announcement.id === button.dataset.toggleAnnouncement
      );

      if (item) toggleAnnouncement(item);
    });
  });

  all("[data-delete-announcement]").forEach(button => {
    button.addEventListener("click", () => {
      const item = state.announcements.find(
        announcement =>
          announcement.id === button.dataset.deleteAnnouncement
      );

      if (item) deleteAnnouncement(item);
    });
  });
}

function openAnnouncementEditor(existing = null) {
  const editing = Boolean(existing);

  const content = `
    <div class="modal-header">
      <div>
        <p class="eyebrow">
          ${editing ? "EDIT ANNOUNCEMENT" : "NEW ANNOUNCEMENT"}
        </p>
        <h2>${editing ? "Edit announcement" : "Create announcement"}</h2>
      </div>
    </div>

    <form id="announcementForm">
      <div class="form-group">
        <label for="announcementTitle">Title</label>
        <input
          id="announcementTitle"
          class="input"
          maxlength="${MAX_ANNOUNCEMENT_TITLE}"
          required
          value="${escape(existing?.title || "")}"
          placeholder="e.g. Mathematics practice update"
        />
      </div>

      <div class="form-group">
        <label for="announcementBody">Message</label>
        <textarea
          id="announcementBody"
          class="input textarea"
          maxlength="${MAX_ANNOUNCEMENT_BODY}"
          rows="8"
          required
          placeholder="Write the announcement..."
        >${escape(existing?.body || "")}</textarea>
      </div>

      <div class="form-group">
        <label for="announcementAttachment">Attachment</label>
        <input
          id="announcementAttachment"
          class="input"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
        />

        <small>
          Optional. Maximum 10 MB.
        </small>

        ${
          existing?.attachmentName
            ? `
              <p class="existing-file">
                Existing: ${escape(existing.attachmentName)}
              </p>
            `
            : ""
        }
      </div>

      <label class="checkbox-row">
        <input
          id="announcementPublished"
          type="checkbox"
          ${existing?.published !== false ? "checked" : ""}
        />
        <span>Publish immediately</span>
      </label>

      <div class="modal-actions">
        <button
          type="button"
          class="btn btn-secondary"
          data-close-modal
        >
          Cancel
        </button>

        <button class="btn btn-primary" type="submit">
          ${editing ? "Save changes" : "Create announcement"}
        </button>
      </div>
    </form>
  `;

  openModal(content);

  el("#announcementForm")?.addEventListener(
    "submit",
    async event => {
      event.preventDefault();
      await saveAnnouncement(existing);
    }
  );

  el("[data-close-modal]")?.addEventListener(
    "click",
    closeAnyModal
  );
}

async function saveAnnouncement(existing = null) {
  if (state.submitting || !state.db || !uid()) return;

  const title = el("#announcementTitle")?.value.trim() || "";
  const body = el("#announcementBody")?.value.trim() || "";
  const published =
    el("#announcementPublished")?.checked === true;

  const file = el("#announcementAttachment")?.files?.[0] || null;

  if (!validateRequired(title)) {
    showToast("Enter an announcement title.", true);
    return;
  }

  if (!validateRequired(body)) {
    showToast("Enter an announcement message.", true);
    return;
  }

  if (file && file.size > MAX_ATTACHMENT_SIZE) {
    showToast("Attachment must be 10 MB or smaller.", true);
    return;
  }

  state.submitting = true;

  try {
    const announcementRef = existing?.id
      ? ref(state.db, `${PATHS.announcements}/${existing.id}`)
      : push(ref(state.db, PATHS.announcements));

    const announcementId = existing?.id || announcementRef.key;

    let attachmentURL =
      existing?.attachmentURL ||
      existing?.attachmentUrl ||
      "";

    let attachmentName =
      existing?.attachmentName || "";

    let attachmentPath =
      existing?.attachmentPath || "";

    let newUploadedPath = "";

    if (file) {
      const safeFileName = sanitizeFileName(file.name);
      const path =
        `teacher-announcements/${uid()}/${Date.now()}_${safeFileName}`;

      const fileRef = storageRef(state.storage, path);

      await uploadBytes(fileRef, file, {
        contentType: file.type || "application/octet-stream"
      });

      attachmentURL = await getDownloadURL(fileRef);
      attachmentName = file.name;
      attachmentPath = path;
      newUploadedPath = path;
    }

    const data = {
      id: announcementId,
      title,
      body,
      authorUID: existing?.authorUID || uid(),
      authorName: existing?.authorName || teacherName(),
      published,
      attachmentURL,
      attachmentName,
      attachmentPath,
      createdAt: existing?.createdAt || now(),
      updatedAt: serverTimestamp()
    };

    await set(announcementRef, data);

    /*
      Delete replaced attachment only after the database write
      succeeds. This prevents an old file being deleted when
      the database update fails.
    */
    if (
      newUploadedPath &&
      existing?.attachmentPath &&
      existing.attachmentPath !== newUploadedPath
    ) {
      try {
        await deleteObject(
          storageRef(state.storage, existing.attachmentPath)
        );
      } catch (error) {
        console.warn(
          "Old announcement attachment could not be deleted:",
          error
        );
      }
    }

    closeAnyModal();

    showToast(
      existing
        ? "Announcement updated."
        : "Announcement created."
    );
  } catch (error) {
    console.error(error);

    /*
      If Storage upload succeeded but the RTDB write failed,
      remove the newly-created orphan file.
    */
    if (newUploadedPath) {
      try {
        await deleteObject(
          storageRef(state.storage, newUploadedPath)
        );
      } catch (cleanupError) {
        console.warn(
          "Failed to clean up uploaded attachment:",
          cleanupError
        );
      }
    }

    showToast(
      error.message || "Could not save announcement.",
      true
    );
  } finally {
    state.submitting = false;
  }
}

async function toggleAnnouncement(item) {
  if (!state.db || !item?.id) return;

  try {
    await update(
      ref(state.db, `${PATHS.announcements}/${item.id}`),
      {
        published: item.published !== true,
        updatedAt: serverTimestamp()
      }
    );

    showToast(
      item.published
        ? "Announcement unpublished."
        : "Announcement published."
    );
  } catch (error) {
    console.error(error);
    showToast(
      error.message || "Could not update announcement.",
      true
    );
  }
}

async function deleteAnnouncement(item) {
  if (!state.db || !item?.id) return;

  const confirmed = window.confirm(
    `Delete "${item.title || "this announcement"}"?`
  );

  if (!confirmed) return;

  try {
    await remove(
      ref(state.db, `${PATHS.announcements}/${item.id}`)
    );

    if (item.attachmentPath) {
      try {
        await deleteObject(
          storageRef(state.storage, item.attachmentPath)
        );
      } catch (storageError) {
        console.warn(
          "Announcement database record deleted, but attachment cleanup failed:",
          storageError
        );
      }
    }

    showToast("Announcement deleted.");
  } catch (error) {
    console.error(error);
    showToast(
      error.message || "Could not delete announcement.",
      true
    );
  }
}

/* ============================================================
   CLASS CHAT
   ============================================================ */

function renderChat(container) {
  const messages = [...state.chatMessages]
    .filter(item => item.deleted !== true && item.hidden !== true)
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));

  container.innerHTML = `
    <section class="teacher-page chat-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">CLASSROOM</p>
          <h1>Class chat</h1>
          <p>Communicate with students in the shared classroom.</p>
        </div>
      </div>

      <div class="chat-panel">
        <div id="teacherChatMessages" class="chat-messages">
          ${
            messages.length
              ? messages.map(renderChatMessage).join("")
              : createEmptyState(
                  "No messages yet",
                  "The classroom conversation will appear here."
                )
          }
        </div>

        <form id="teacherChatForm" class="chat-composer">
          <textarea
            id="teacherChatInput"
            class="input textarea"
            rows="2"
            maxlength="${MAX_CHAT_LENGTH}"
            placeholder="Write a message..."
            required
          ></textarea>

          <button class="btn btn-primary" type="submit">
            Send
          </button>
        </form>
      </div>
    </section>
  `;

  el("#teacherChatForm")?.addEventListener(
    "submit",
    sendChatMessage
  );
}

function renderChatMessage(message) {
  const own = message.uid === uid();

  return `
    <article class="chat-message ${own ? "own" : ""}">
      <div class="chat-message-meta">
        <strong>${escape(message.displayName || "Student")}</strong>
        <time>${formatDateTime(message.createdAt)}</time>
      </div>

      <div class="chat-message-body">
        ${escape(message.message || "").replace(/\n/g, "<br>")}
      </div>
    </article>
  `;
}

async function sendChatMessage(event) {
  event.preventDefault();

  const input = el("#teacherChatInput");
  const message = input?.value.trim() || "";

  if (!message || message.length > MAX_CHAT_LENGTH) return;

  if (!state.db || !uid()) return;

  try {
    const messageRef = push(ref(state.db, PATHS.chat));

    await set(messageRef, {
      id: messageRef.key,
      uid: uid(),
      displayName: teacherName(),
      message,
      createdAt: serverTimestamp(),
      deleted: false,
      hidden: false,
      flagged: false,
      reported: false,
      moderationStatus: "active"
    });

    input.value = "";
  } catch (error) {
    console.error(error);
    showToast(
      error.message || "Could not send message.",
      true
    );
  }
}

/* ============================================================
   DOUBTS
   ============================================================ */

function renderDoubts(container) {
  const doubts = sortNewest(state.doubts);

  container.innerHTML = `
    <section class="teacher-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">STUDENT SUPPORT</p>
          <h1>Doubt inbox</h1>
          <p>Answer questions privately and help students move forward.</p>
        </div>
      </div>

      <div class="toolbar">
        <select id="doubtStatusFilter" class="input">
          <option value="all">All doubts</option>
          <option value="submitted">Open</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>

        <input
          id="doubtSearch"
          class="input"
          type="search"
          placeholder="Search student, subject or question..."
        />
      </div>

      <div id="teacherDoubtList">
        ${renderDoubtList(doubts)}
      </div>
    </section>
  `;

  const filter = el("#doubtStatusFilter");
  const search = el("#doubtSearch");

  const refresh = () => {
    const status = filter?.value || "all";
    const term = (search?.value || "").trim().toLowerCase();

    const filtered = doubts.filter(doubt => {
      const statusMatch =
        status === "all" ||
        (doubt.status || "submitted") === status;

      const searchMatch =
        !term ||
        String(doubt.studentName || "").toLowerCase().includes(term) ||
        String(doubt.subject || "").toLowerCase().includes(term) ||
        String(doubt.question || "").toLowerCase().includes(term);

      return statusMatch && searchMatch;
    });

    const list = el("#teacherDoubtList");

    if (list) {
      list.innerHTML = renderDoubtList(filtered);
    }

    bindDoubtButtons();
  };

  filter?.addEventListener("change", refresh);
  search?.addEventListener("input", refresh);

  bindDoubtButtons();
}

function renderDoubtList(doubts) {
  if (!doubts.length) {
    return createEmptyState(
      "No doubts found",
      "There are no student questions matching this filter."
    );
  }

  return `
    <div class="doubt-list">
      ${doubts.map(doubt => `
        <article class="doubt-card">
          <div class="doubt-header">
            <div>
              <strong>${escape(doubt.studentName || "Student")}</strong>
              <span>${escape(doubt.studentEmail || "")}</span>
            </div>

            ${createStatusBadge(doubt.status || "submitted")}
          </div>

          <p class="doubt-subject">
            ${escape(doubt.subject || "Mathematics")}
          </p>

          <div class="doubt-question">
            ${escape(doubt.question || "").replace(/\n/g, "<br>")}
          </div>

          ${
            doubt.reply
              ? `
                <div class="doubt-reply">
                  <strong>Your reply</strong>
                  <p>${escape(doubt.reply).replace(/\n/g, "<br>")}</p>
                </div>
              `
              : ""
          }

          <div class="doubt-actions">
            <button
              class="btn btn-small btn-primary"
              data-reply-doubt="${escape(doubt.id)}"
            >
              ${doubt.reply ? "Edit reply" : "Reply"}
            </button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function bindDoubtButtons() {
  all("[data-reply-doubt]").forEach(button => {
    button.addEventListener("click", () => {
      const doubt = state.doubts.find(
        item => item.id === button.dataset.replyDoubt
      );

      if (doubt) openDoubtReply(doubt);
    });
  });
}

function openDoubtReply(doubt) {
  const content = `
    <div class="modal-header">
      <div>
        <p class="eyebrow">PRIVATE DOUBT</p>
        <h2>${escape(doubt.studentName || "Student")}</h2>
        <p>${escape(doubt.subject || "Mathematics")}</p>
      </div>
    </div>

    <div class="readonly-box doubt-question">
      ${escape(doubt.question || "").replace(/\n/g, "<br>")}
    </div>

    <form id="doubtReplyForm">
      <div class="form-group">
        <label for="doubtReply">Your reply</label>
        <textarea
          id="doubtReply"
          class="input textarea"
          rows="7"
          maxlength="4000"
          required
          placeholder="Explain the solution clearly..."
        >${escape(doubt.reply || "")}</textarea>
      </div>

      <div class="form-group">
        <label for="doubtStatus">Status</label>
        <select id="doubtStatus" class="input">
          <option value="submitted" ${
            doubt.status === "submitted" ? "selected" : ""
          }>Open</option>

          <option value="resolved" ${
            doubt.status === "resolved" ? "selected" : ""
          }>Resolved</option>

          <option value="closed" ${
            doubt.status === "closed" ? "selected" : ""
          }>Closed</option>
        </select>
      </div>

      <div class="modal-actions">
        <button
          type="button"
          class="btn btn-secondary"
          data-close-modal
        >
          Cancel
        </button>

        <button type="submit" class="btn btn-primary">
          Save reply
        </button>
      </div>
    </form>
  `;

  openModal(content);

  el("#doubtReplyForm")?.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const reply =
        el("#doubtReply")?.value.trim() || "";

      const status =
        el("#doubtStatus")?.value || "resolved";

      if (!reply) {
        showToast("Write a reply first.", true);
        return;
      }

      await saveDoubtReply(doubt, reply, status);
    }
  );

  el("[data-close-modal]")?.addEventListener(
    "click",
    closeAnyModal
  );
}

async function saveDoubtReply(doubt, reply, status) {
  if (!state.db || !doubt?.id) return;

  try {
    await update(
      ref(state.db, `${PATHS.doubts}/${doubt.id}`),
      {
        reply,
        status,
        repliedBy: uid(),
        repliedByName: teacherName(),
        repliedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    );

    closeAnyModal();
    showToast("Doubt reply saved.");
  } catch (error) {
    console.error(error);
    showToast(
      error.message || "Could not save reply.",
      true
    );
  }
}

/* ============================================================
   STUDENT INSIGHTS
   ============================================================ */

function renderStudents(container) {
  const students = state.students;

  container.innerHTML = `
    <section class="teacher-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">CLASS OVERVIEW</p>
          <h1>Students</h1>
          <p>Overview of students currently registered in the classroom.</p>
        </div>
      </div>

      ${
        students.length
          ? `
            <div class="student-grid">
              ${students.map(student => {
                const studentLogs = state.logs.filter(
                  log => log.uid === student.uid
                );

                const verified = studentLogs.filter(
                  log => log.status === "verified"
                ).length;

                return `
                  <article class="student-card">
                    <div class="student-avatar">
                      ${escape(
                        String(
                          student.displayName ||
                          student.name ||
                          "S"
                        ).charAt(0).toUpperCase()
                      )}
                    </div>

                    <h3>
                      ${escape(
                        student.displayName ||
                        student.name ||
                        "Student"
                      )}
                    </h3>

                    <p>${escape(student.email || "")}</p>

                    <div class="student-card-stats">
                      <span>
                        <strong>${studentLogs.length}</strong>
                        Logs
                      </span>

                      <span>
                        <strong>${verified}</strong>
                        Verified
                      </span>
                    </div>
                  </article>
                `;
              }).join("")}
            </div>
          `
          : createEmptyState(
              "No students found",
              "Student profiles will appear here."
            )
      }
    </section>
  `;
}

/* ============================================================
   PROFILE
   ============================================================ */

function renderProfile(container) {
  const profile = state.profile || {};

  container.innerHTML = `
    <section class="teacher-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">ACCOUNT</p>
          <h1>Teacher profile</h1>
          <p>Information associated with your classroom account.</p>
        </div>
      </div>

      <div class="profile-card">
        <div class="profile-avatar">
          ${escape(
            String(
              profile.displayName ||
              profile.name ||
              teacherName()
            ).charAt(0).toUpperCase()
          )}
        </div>

        <div class="profile-details">
          <h2>${escape(
            profile.displayName ||
            profile.name ||
            teacherName()
          )}</h2>

          <p>${escape(
            profile.email ||
            state.user?.email ||
            ""
          )}</p>

          <span class="role-badge">Teacher</span>
        </div>
      </div>

      <div class="panel">
        <h2>Account information</h2>

        <dl class="profile-list">
          <div>
            <dt>Name</dt>
            <dd>${escape(
              profile.displayName ||
              profile.name ||
              "—"
            )}</dd>
          </div>

          <div>
            <dt>Email</dt>
            <dd>${escape(
              profile.email ||
              state.user?.email ||
              "—"
            )}</dd>
          </div>

          <div>
            <dt>Role</dt>
            <dd>${escape(profile.role || "teacher")}</dd>
          </div>

          <div>
            <dt>Status</dt>
            <dd>${escape(profile.status || "active")}</dd>
          </div>
        </dl>
      </div>
    </section>
  `;
}

/* ============================================================
   REALTIME SUBSCRIPTIONS
   ============================================================ */

function subscribeToLogs() {
  if (!state.db) return;

  const logsQuery = query(
    ref(state.db, PATHS.logs),
    limitToLast(500)
  );

  const unsubscribe = onValue(
    logsQuery,
    snapshot => {
      state.logs = getRecords(snapshot);
      renderCurrentPage();
    },
    error => {
      console.error("Teacher logs listener:", error);
      showToast(
        "Unable to load student practice logs.",
        true
      );
    }
  );

  addUnsubscriber(unsubscribe);
}

function subscribeToAnnouncements() {
  if (!state.db) return;

  const announcementsQuery = query(
    ref(state.db, PATHS.announcements),
    limitToLast(200)
  );

  const unsubscribe = onValue(
    announcementsQuery,
    snapshot => {
      state.announcements = sortNewest(
        getRecords(snapshot)
      ).filter(item => {
        /*
          Teacher sees announcements they authored.
          Admin accounts can see the broader collection if
          database rules allow the read.
        */
        return (
          item.authorUID === uid() ||
          state.profile?.role === "admin"
        );
      });

      renderCurrentPage();
    },
    error => {
      console.error("Teacher announcements listener:", error);
      showToast(
        "Unable to load announcements.",
        true
      );
    }
  );

  addUnsubscriber(unsubscribe);
}

function subscribeToChat() {
  if (!state.db) return;

  const chatQuery = query(
    ref(state.db, PATHS.chat),
    orderByChild("deleted"),
    limitToLast(100)
  );

  const unsubscribe = onValue(
    chatQuery,
    snapshot => {
      state.chatMessages = getRecords(snapshot)
        .filter(item => item.deleted !== true);

      renderCurrentPage();
    },
    error => {
      console.error("Teacher chat listener:", error);
      showToast(
        "Unable to load class chat.",
        true
      );
    }
  );

  addUnsubscriber(unsubscribe);
}

function subscribeToDoubts() {
  if (!state.db) return;

  const doubtsQuery = query(
    ref(state.db, PATHS.doubts),
    limitToLast(200)
  );

  const unsubscribe = onValue(
    doubtsQuery,
    snapshot => {
      state.doubts = sortNewest(
        getRecords(snapshot)
      );

      renderCurrentPage();
    },
    error => {
      console.error("Teacher doubts listener:", error);
      showToast(
        "Unable to load student doubts.",
        true
      );
    }
  );

  addUnsubscriber(unsubscribe);
}

/* ============================================================
   STUDENTS
   ============================================================ */

async function loadStudents() {
  if (!state.db) return;

  try {
    const snapshot = await get(
      ref(state.db, PATHS.users)
    );

    state.students = getRecords(snapshot)
      .filter(
        user =>
          user.role === "student" &&
          user.status !== "disabled"
      );
  } catch (error) {
    /*
      Teachers may not have permission to list users under
      a stricter production ruleset. This is intentionally
      non-fatal.
    */
    console.warn(
      "Student directory unavailable:",
      error
    );

    state.students = [];
  }
}

/* ============================================================
   ROUTING / LIFECYCLE
   ============================================================ */

const PAGE_ALIASES = {
  teacher: "teacher-dashboard",
  dashboard: "teacher-dashboard",

  "teacher-practice": "teacher-logs",
  "practice-review": "teacher-logs",

  announcements: "teacher-announcements",

  "class-chat": "teacher-chat",

  "doubt-inbox": "teacher-doubts",
  doubts: "teacher-doubts",

  students: "teacher-students",

  profile: "teacher-profile"
};

function normalizePage(page) {
  return PAGE_ALIASES[page] || page;
}

async function init(context = {}) {
  cleanup();

  state.auth = context.auth || null;
  state.db = context.db || null;
  state.storage = context.storage || null;
  state.user = context.user || null;
  state.profile = context.profile || null;
  state.toast = context.toast || null;
  state.showPage = context.showPage || null;

  state.logs = [];
  state.announcements = [];
  state.chatMessages = [];
  state.doubts = [];
  state.students = [];

  state.currentPage = "teacher-dashboard";
  state.initialized = true;

  if (!state.user || !state.db) {
    throw new Error(
      "Teacher module requires an authenticated Firebase user and database."
    );
  }

  if (!isTeacher()) {
    throw new Error(
      "This account does not have teacher access."
    );
  }

  /*
    Storage is supplied by firebase-config.js where available.
    The teacher module can still operate without Storage for
    database-only functions.
  */

  subscribeToLogs();
  subscribeToAnnouncements();
  subscribeToChat();
  subscribeToDoubts();

  await loadStudents();

  state.pageChangeHandler = event => {
    const requestedPage =
      event?.detail?.page ||
      event?.detail?.route ||
      event?.detail;

    const page = normalizePage(requestedPage);

    if (!page) return;

    const teacherPages = [
      "teacher-dashboard",
      "teacher-logs",
      "teacher-announcements",
      "teacher-chat",
      "teacher-doubts",
      "teacher-students",
      "teacher-profile"
    ];

    if (!teacherPages.includes(page)) return;

    state.currentPage = page;
    renderCurrentPage();
  };

  window.addEventListener(
    "mathclass:pagechange",
    state.pageChangeHandler
  );

  renderCurrentPage();

  return {
    cleanup,
    refresh: renderCurrentPage
  };
}

function cleanup() {
  cleanupListeners();

  if (state.pageChangeHandler) {
    window.removeEventListener(
      "mathclass:pagechange",
      state.pageChangeHandler
    );
  }

  state.pageChangeHandler = null;
  state.initialized = false;
}

/* ============================================================
   MODAL HELPERS
   ============================================================ */

function closeAnyModal() {
  const overlay =
    el("#modalOverlay") ||
    el("#modalRoot") ||
    el(".modal-overlay");

  if (!overlay) return;

  /*
    Support the different modal implementations that may be
    present in components.js.
  */
  const closeButton =
    overlay.querySelector("[data-modal-close]") ||
    overlay.querySelector(".modal-close");

  if (closeButton) {
    closeButton.click();
    return;
  }

  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = "";
}

/* ============================================================
   FILE HELPERS
   ============================================================ */

function sanitizeFileName(name) {
  return String(name || "attachment")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

/* ============================================================
   PUBLIC API
   ============================================================ */

export {
  init,
  cleanup
};
