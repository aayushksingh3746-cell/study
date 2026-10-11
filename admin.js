/* ============================================================
   Math Class Virtual Classroom
   admin.js
   Administrator dashboard and moderation tools
   Firebase Modular SDK 10.5.0
   ============================================================ */

import {
  ref,
  get,
  set,
  update,
  push,
  remove,
  query,
  orderByChild,
  limitToLast,
  onValue,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

import {
  escapeHTML,
  formatDate,
  formatDateTime,
  createStatusBadge,
  createEmptyState,
  openModal,
  safeFirebaseStorageURL
} from "./components.js";

const PATHS = {
  users: "users",
  adminUIDs: "admin_uids",
  logs: "daily_study_logs",
  announcements: "announcements",
  chat: "class_chat",
  doubts: "direct_doubts",
  audit: "auditLogs"
};

const BOOTSTRAP_ADMIN_UID = "YNdqDJRyZ1hFAtqrJeZJYScldfc2";

const state = {
  auth: null,
  db: null,
  user: null,
  profile: null,
  toast: null,
  showPage: null,

  initialized: false,
  currentPage: "admin-dashboard",

  users: [],
  adminUIDs: {},
  logs: [],
  announcements: [],
  chatMessages: [],
  doubts: [],
  auditLogs: [],

  unsubscribers: [],
  pageChangeHandler: null,
  loading: false
};

/* ============================================================
   HELPERS
   ============================================================ */

function uid() {
  return state.user?.uid || "";
}

function isPrimaryAdmin() {
  return uid() === BOOTSTRAP_ADMIN_UID;
}

function isAdmin() {
  return (
    isPrimaryAdmin() ||
    (
      state.profile?.role === "admin" &&
      state.adminUIDs?.[uid()] === true
    )
  );
}

function toast(message, error = false) {
  if (typeof state.toast === "function") {
    state.toast(message, error);
  } else {
    console[error ? "error" : "log"](message);
  }
}

function $$(selector) {
  return document.querySelector(selector);
}

function all(selector) {
  return [...document.querySelectorAll(selector)];
}

function esc(value) {
  return escapeHTML(String(value ?? ""));
}

function records(snapshot) {
  const value = snapshot.val() || {};

  return Object.entries(value).map(([id, data]) => ({
    id,
    ...(data || {})
  }));
}

function newest(items, field = "createdAt") {
  return [...items].sort(
    (a, b) =>
      Number(b?.[field] || 0) -
      Number(a?.[field] || 0)
  );
}

function addUnsubscriber(fn) {
  if (typeof fn === "function") {
    state.unsubscribers.push(fn);
  }
}

function cleanupListeners() {
  for (const unsubscribe of state.unsubscribers.splice(0)) {
    try {
      unsubscribe();
    } catch (error) {
      console.warn("Admin listener cleanup:", error);
    }
  }
}

function closeModal() {
  const overlay =
    $$("#modalOverlay") ||
    $$("#modalRoot") ||
    document.querySelector(".modal-overlay");

  if (!overlay) return;

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
   NAVIGATION
   ============================================================ */

const PAGE_ALIASES = {
  admin: "admin-dashboard",
  dashboard: "admin-dashboard",

  users: "admin-users",
  "user-management": "admin-users",

  moderation: "admin-moderation",
  "chat-moderation": "admin-moderation",

  announcements: "admin-announcements",

  audit: "admin-audit",
  "audit-logs": "admin-audit",

  system: "admin-system",

  profile: "admin-profile"
};

function normalizePage(page) {
  return PAGE_ALIASES[page] || page;
}

function navigate(page) {
  state.currentPage = normalizePage(page);

  if (typeof state.showPage === "function") {
    state.showPage(state.currentPage);
  }

  renderCurrentPage();
}

function renderCurrentPage() {
  const container =
    $$("#pageContent") ||
    $$("#mainContent") ||
    $$("#adminContent");

  if (!container) return;

  switch (state.currentPage) {
    case "admin-dashboard":
      renderDashboard(container);
      break;

    case "admin-users":
      renderUsers(container);
      break;

    case "admin-moderation":
      renderModeration(container);
      break;

    case "admin-announcements":
      renderAnnouncements(container);
      break;

    case "admin-audit":
      renderAudit(container);
      break;

    case "admin-system":
      renderSystem(container);
      break;

    case "admin-profile":
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
  const students = state.users.filter(
    user => user.role === "student"
  );

  const teachers = state.users.filter(
    user => user.role === "teacher"
  );

  const admins = state.users.filter(
    user => user.role === "admin"
  );

  const disabled = state.users.filter(
    user => user.status === "disabled"
  );

  const pendingLogs = state.logs.filter(
    log => !log.status || log.status === "submitted"
  ).length;

  const openDoubts = state.doubts.filter(
    doubt =>
      !["resolved", "closed"].includes(
        doubt.status
      )
  ).length;

  const activeChat = state.chatMessages.filter(
    message =>
      message.deleted !== true &&
      message.hidden !== true
  ).length;

  container.innerHTML = `
    <section class="admin-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">ADMINISTRATION</p>
          <h1>Control centre</h1>
          <p>
            Manage classroom users, moderation, announcements and
            system activity.
          </p>
        </div>
      </div>

      <div class="stats-grid">
        ${adminStat(
          "Students",
          students.length,
          "admin-users"
        )}

        ${adminStat(
          "Teachers",
          teachers.length,
          "admin-users"
        )}

        ${adminStat(
          "Pending reviews",
          pendingLogs,
          "admin-users"
        )}

        ${adminStat(
          "Open doubts",
          openDoubts,
          "admin-users"
        )}

        ${adminStat(
          "Active chat",
          activeChat,
          "admin-moderation"
        )}

        ${adminStat(
          "Disabled users",
          disabled.length,
          "admin-users"
        )}
      </div>

      <div class="admin-grid">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>Recent users</h2>
              <p>Latest registered classroom accounts.</p>
            </div>

            <button
              class="btn btn-secondary"
              data-admin-nav="admin-users"
            >
              Manage
            </button>
          </div>

          ${renderRecentUsers()}
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>Moderation</h2>
              <p>Recent classroom messages.</p>
            </div>

            <button
              class="btn btn-secondary"
              data-admin-nav="admin-moderation"
            >
              Open
            </button>
          </div>

          ${renderRecentModeration()}
        </article>
      </div>

      <article class="panel">
        <div class="panel-heading">
          <div>
            <h2>Administrative actions</h2>
            <p>
              Every sensitive action should be recorded in the
              audit trail.
            </p>
          </div>
        </div>

        <div class="quick-actions">
          <button
            class="btn btn-primary"
            data-admin-nav="admin-users"
          >
            Manage users
          </button>

          <button
            class="btn btn-secondary"
            data-admin-nav="admin-moderation"
          >
            Moderate chat
          </button>

          <button
            class="btn btn-secondary"
            data-admin-nav="admin-announcements"
          >
            Announcements
          </button>

          <button
            class="btn btn-secondary"
            data-admin-nav="admin-audit"
          >
            Audit logs
          </button>

          <button
            class="btn btn-secondary"
            data-admin-nav="admin-system"
          >
            System status
          </button>
        </div>
      </article>
    </section>
  `;

  bindNavigation();
}

function adminStat(label, value, page) {
  return `
    <button
      class="stat-card"
      data-admin-nav="${esc(page)}"
    >
      <span class="stat-card-label">${esc(label)}</span>
      <strong class="stat-card-value">${esc(value)}</strong>
    </button>
  `;
}

function renderRecentUsers() {
  const users = newest(state.users, "createdAt").slice(0, 6);

  if (!users.length) {
    return createEmptyState(
      "No users",
      "No user profiles are currently available."
    );
  }

  return `
    <div class="record-list">
      ${users.map(user => `
        <button
          class="record-row"
          data-open-user="${esc(user.uid || user.id)}"
        >
          <div>
            <strong>
              ${esc(
                user.displayName ||
                user.name ||
                "Unnamed user"
              )}
            </strong>

            <span>
              ${esc(user.email || "")}
            </span>
          </div>

          <div class="record-row-meta">
            ${createStatusBadge(user.role || "student")}
            <small>${formatDate(user.createdAt)}</small>
          </div>
        </button>
      `).join("")}
    </div>
  `;
}

function renderRecentModeration() {
  const messages = newest(
    state.chatMessages
  ).slice(0, 6);

  if (!messages.length) {
    return createEmptyState(
      "No chat activity",
      "There are no classroom messages to review."
    );
  }

  return `
    <div class="record-list">
      ${messages.map(message => `
        <button
          class="record-row"
          data-moderate-message="${esc(message.id)}"
        >
          <div>
            <strong>
              ${esc(message.displayName || "User")}
            </strong>

            <span>
              ${esc(
                String(message.message || "")
                  .slice(0, 80)
              )}
            </span>
          </div>

          <div class="record-row-meta">
            ${createStatusBadge(
              message.deleted ||
              message.hidden
                ? "hidden"
                : "active"
            )}

            <small>
              ${formatDate(message.createdAt)}
            </small>
          </div>
        </button>
      `).join("")}
    </div>
  `;
}

function bindNavigation() {
  all("[data-admin-nav]").forEach(button => {
    button.addEventListener("click", () => {
      navigate(button.dataset.adminNav);
    });
  });

  all("[data-open-user]").forEach(button => {
    button.addEventListener("click", () => {
      const user = state.users.find(
        item =>
          (item.uid || item.id) ===
          button.dataset.openUser
      );

      if (user) openUserEditor(user);
    });
  });

  all("[data-moderate-message]").forEach(button => {
    button.addEventListener("click", () => {
      const message = state.chatMessages.find(
        item =>
          item.id === button.dataset.moderateMessage
      );

      if (message) openModerationEditor(message);
    });
  });
}

/* ============================================================
   USER MANAGEMENT
   ============================================================ */

function renderUsers(container) {
  const users = newest(state.users, "createdAt");

  container.innerHTML = `
    <section class="admin-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">ACCESS CONTROL</p>
          <h1>User management</h1>
          <p>
            Manage classroom roles and account status.
          </p>
        </div>
      </div>

      <div class="toolbar">
        <select id="adminRoleFilter" class="input">
          <option value="all">All roles</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="admin">Admins</option>
        </select>

        <select id="adminStatusFilter" class="input">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>

        <input
          id="adminUserSearch"
          class="input"
          type="search"
          placeholder="Search name or email..."
        />
      </div>

      <div id="adminUsersList">
        ${renderUserTable(users)}
      </div>
    </section>
  `;

  const roleFilter = $$("#adminRoleFilter");
  const statusFilter = $$("#adminStatusFilter");
  const search = $$("#adminUserSearch");

  function refresh() {
    const role = roleFilter?.value || "all";
    const status = statusFilter?.value || "all";
    const term =
      search?.value.trim().toLowerCase() || "";

    const filtered = users.filter(user => {
      const roleMatch =
        role === "all" ||
        (user.role || "student") === role;

      const statusMatch =
        status === "all" ||
        (user.status || "active") === status;

      const textMatch =
        !term ||
        String(user.name || "")
          .toLowerCase()
          .includes(term) ||
        String(user.displayName || "")
          .toLowerCase()
          .includes(term) ||
        String(user.email || "")
          .toLowerCase()
          .includes(term);

      return roleMatch && statusMatch && textMatch;
    });

    const list = $$("#adminUsersList");

    if (list) {
      list.innerHTML = renderUserTable(filtered);
    }

    bindUserButtons();
  }

  roleFilter?.addEventListener("change", refresh);
  statusFilter?.addEventListener("change", refresh);
  search?.addEventListener("input", refresh);

  bindUserButtons();
}

function renderUserTable(users) {
  if (!users.length) {
    return createEmptyState(
      "No users found",
      "Try changing the current filters."
    );
  }

  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Role</th>
            <th>Status</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          ${users.map(user => `
            <tr>
              <td>
                <strong>
                  ${esc(
                    user.displayName ||
                    user.name ||
                    "Unnamed user"
                  )}
                </strong>

                <small>
                  ${esc(user.email || "")}
                </small>
              </td>

              <td>
                ${createStatusBadge(
                  user.role || "student"
                )}
              </td>

              <td>
                ${createStatusBadge(
                  user.status || "active"
                )}
              </td>

              <td>
                ${formatDate(user.createdAt)}
              </td>

              <td>
                <button
                  class="btn btn-small btn-secondary"
                  data-edit-user="${esc(
                    user.uid || user.id
                  )}"
                >
                  Manage
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function bindUserButtons() {
  all("[data-edit-user]").forEach(button => {
    button.addEventListener("click", () => {
      const user = state.users.find(
        item =>
          (item.uid || item.id) ===
          button.dataset.editUser
      );

      if (user) openUserEditor(user);
    });
  });
}

function openUserEditor(user) {
  const targetUID = user.uid || user.id;

  const cannotChangeSelfRole =
    targetUID === uid();

  const cannotDisableSelf =
    targetUID === uid();

  const isBootstrap =
    targetUID === BOOTSTRAP_ADMIN_UID;

  const content = `
    <div class="modal-header">
      <div>
        <p class="eyebrow">USER MANAGEMENT</p>
        <h2>
          ${esc(
            user.displayName ||
            user.name ||
            "User"
          )}
        </h2>

        <p>${esc(user.email || "")}</p>
      </div>
    </div>

    <form id="adminUserForm">
      <input
        type="hidden"
        id="adminTargetUID"
        value="${esc(targetUID)}"
      />

      <div class="form-group">
        <label for="adminUserRole">Role</label>

        <select
          id="adminUserRole"
          class="input"
          ${cannotChangeSelfRole || isBootstrap ? "disabled" : ""}
        >
          <option value="student" ${
            user.role === "student" ? "selected" : ""
          }>
            Student
          </option>

          <option value="teacher" ${
            user.role === "teacher" ? "selected" : ""
          }>
            Teacher
          </option>

          <option value="admin" ${
            user.role === "admin" ? "selected" : ""
          }>
            Administrator
          </option>
        </select>
      </div>

      <div class="form-group">
        <label for="adminUserStatus">Account status</label>

        <select
          id="adminUserStatus"
          class="input"
          ${
            cannotDisableSelf || isBootstrap
              ? "disabled"
              : ""
          }
        >
          <option value="active" ${
            user.status !== "disabled"
              ? "selected"
              : ""
          }>
            Active
          </option>

          <option value="disabled" ${
            user.status === "disabled"
              ? "selected"
              : ""
          }>
            Disabled
          </option>
        </select>
      </div>

      ${
        cannotChangeSelfRole
          ? `
            <div class="notice-box">
              You cannot change your own administrator role.
            </div>
          `
          : ""
      }

      ${
        isBootstrap
          ? `
            <div class="notice-box">
              The primary administrator account is protected
              from dashboard role/status changes.
            </div>
          `
          : ""
      }

      <div class="modal-actions">
        <button
          type="button"
          class="btn btn-secondary"
          data-close-admin-modal
        >
          Cancel
        </button>

        ${
          cannotChangeSelfRole && cannotDisableSelf
            ? ""
            : `
              <button
                type="submit"
                class="btn btn-primary"
              >
                Save changes
              </button>
            `
        }
      </div>
    </form>
  `;

  openModal(content);

  $$("[data-close-admin-modal]")?.addEventListener(
    "click",
    closeModal
  );

  $$("#adminUserForm")?.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      await saveUserChanges(user);
    }
  );
}

async function saveUserChanges(user) {
  const targetUID =
    user.uid ||
    user.id ||
    $$("#adminTargetUID")?.value;

  if (!targetUID || !state.db) return;

  if (targetUID === BOOTSTRAP_ADMIN_UID) {
    toast(
      "The primary administrator cannot be changed here.",
      true
    );
    return;
  }

  if (targetUID === uid()) {
    toast(
      "You cannot modify your own administrator access.",
      true
    );
    return;
  }

  const role =
    $$("#adminUserRole")?.value ||
    user.role ||
    "student";

  const status =
    $$("#adminUserStatus")?.value ||
    user.status ||
    "active";

  if (!["student", "teacher", "admin"].includes(role)) {
    toast("Invalid role.", true);
    return;
  }

  if (!["active", "disabled"].includes(status)) {
    toast("Invalid account status.", true);
    return;
  }

  try {
    const updates = {
      [`${PATHS.users}/${targetUID}/role`]: role,
      [`${PATHS.users}/${targetUID}/status`]: status,
      [`${PATHS.users}/${targetUID}/updatedAt`]:
        serverTimestamp()
    };

    /*
      Admin authorization requires BOTH:
      users/{uid}/role == admin
      AND
      admin_uids/{uid} == true
    */
    updates[
      `${PATHS.adminUIDs}/${targetUID}`
    ] = role === "admin" ? true : null;

    await update(
      ref(state.db),
      updates
    );

    await writeAuditLog(
      "user_access_updated",
      targetUID,
      {
        role,
        status,
        previousRole: user.role || "student",
        previousStatus: user.status || "active"
      }
    );

    closeModal();

    toast("User access updated.");
  } catch (error) {
    console.error(error);
    toast(
      error.message ||
        "Could not update user access.",
      true
    );
  }
}

/* ============================================================
   CHAT MODERATION
   ============================================================ */

function renderModeration(container) {
  const messages = newest(
    state.chatMessages
  );

  container.innerHTML = `
    <section class="admin-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">MODERATION</p>
          <h1>Class chat moderation</h1>
          <p>
            Review, hide and restore classroom messages.
          </p>
        </div>
      </div>

      <div class="toolbar">
        <select id="moderationFilter" class="input">
          <option value="all">All messages</option>
          <option value="active">Active</option>
          <option value="hidden">Hidden</option>
          <option value="flagged">Flagged</option>
        </select>

        <input
          id="moderationSearch"
          class="input"
          type="search"
          placeholder="Search message or sender..."
        />
      </div>

      <div id="moderationList">
        ${renderModerationList(messages)}
      </div>
    </section>
  `;

  const filter = $$("#moderationFilter");
  const search = $$("#moderationSearch");

  const refresh = () => {
    const mode = filter?.value || "all";
    const term =
      search?.value.trim().toLowerCase() || "";

    const filtered = messages.filter(message => {
      const hidden =
        message.deleted === true ||
        message.hidden === true;

      const flagged =
        message.flagged === true ||
        message.reported === true;

      const modeMatch =
        mode === "all" ||
        (mode === "active" && !hidden) ||
        (mode === "hidden" && hidden) ||
        (mode === "flagged" && flagged);

      const textMatch =
        !term ||
        String(message.displayName || "")
          .toLowerCase()
          .includes(term) ||
        String(message.message || "")
          .toLowerCase()
          .includes(term);

      return modeMatch && textMatch;
    });

    const list = $$("#moderationList");

    if (list) {
      list.innerHTML =
        renderModerationList(filtered);
    }

    bindModerationButtons();
  };

  filter?.addEventListener("change", refresh);
  search?.addEventListener("input", refresh);

  bindModerationButtons();
}

function renderModerationList(messages) {
  if (!messages.length) {
    return createEmptyState(
      "No messages found",
      "No messages match the selected moderation filter."
    );
  }

  return `
    <div class="moderation-list">
      ${messages.map(message => {
        const hidden =
          message.deleted === true ||
          message.hidden === true;

        return `
          <article class="moderation-card">
            <div class="moderation-header">
              <div>
                <strong>
                  ${esc(
                    message.displayName ||
                    "User"
                  )}
                </strong>

                <small>
                  ${formatDateTime(
                    message.createdAt
                  )}
                </small>
              </div>

              ${createStatusBadge(
                hidden
                  ? "hidden"
                  : message.flagged ||
                    message.reported
                    ? "flagged"
                    : "active"
              )}
            </div>

            <div class="moderation-message">
              ${esc(
                message.message || ""
              ).replace(/\n/g, "<br>")}
            </div>

            <div class="moderation-actions">
              <button
                class="btn btn-small btn-secondary"
                data-moderate="${esc(message.id)}"
              >
                Review
              </button>

              <button
                class="btn btn-small ${
                  hidden
                    ? "btn-secondary"
                    : "btn-danger"
                }"
                data-toggle-message="${esc(message.id)}"
              >
                ${hidden ? "Restore" : "Hide"}
              </button>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function bindModerationButtons() {
  all("[data-moderate]").forEach(button => {
    button.addEventListener("click", () => {
      const message = state.chatMessages.find(
        item => item.id === button.dataset.moderate
      );

      if (message) {
        openModerationEditor(message);
      }
    });
  });

  all("[data-toggle-message]").forEach(button => {
    button.addEventListener("click", () => {
      const message = state.chatMessages.find(
        item =>
          item.id === button.dataset.toggleMessage
      );

      if (message) {
        toggleMessageVisibility(message);
      }
    });
  });
}

function openModerationEditor(message) {
  const hidden =
    message.deleted === true ||
    message.hidden === true;

  const content = `
    <div class="modal-header">
      <div>
        <p class="eyebrow">MESSAGE MODERATION</p>
        <h2>
          ${esc(
            message.displayName ||
            "User"
          )}
        </h2>

        <p>
          ${formatDateTime(
            message.createdAt
          )}
        </p>
      </div>
    </div>

    <div class="readonly-box">
      ${esc(
        message.message || ""
      ).replace(/\n/g, "<br>")}
    </div>

    <div class="form-group">
      <label>Moderation status</label>

      <select
        id="moderationStatus"
        class="input"
      >
        <option value="active" ${
          !hidden &&
          !message.flagged &&
          !message.reported
            ? "selected"
            : ""
        }>
          Active
        </option>

        <option value="hidden" ${
          hidden ? "selected" : ""
        }>
          Hidden
        </option>

        <option value="flagged" ${
          message.flagged ||
          message.reported
            ? "selected"
            : ""
        }>
          Flagged
        </option>
      </select>
    </div>

    <div class="form-group">
      <label for="moderationNote">
        Moderator note
      </label>

      <textarea
        id="moderationNote"
        class="input textarea"
        rows="4"
        maxlength="1000"
        placeholder="Optional internal note..."
      >${esc(
        message.moderatorNote || ""
      )}</textarea>
    </div>

    <div class="modal-actions">
      <button
        type="button"
        class="btn btn-secondary"
        data-close-admin-modal
      >
        Cancel
      </button>

      <button
        type="button"
        class="btn btn-primary"
        id="saveModerationBtn"
      >
        Save moderation
      </button>
    </div>
  `;

  openModal(content);

  $$("[data-close-admin-modal]")?.addEventListener(
    "click",
    closeModal
  );

  $$("#saveModerationBtn")?.addEventListener(
    "click",
    async () => {
      await saveModeration(
        message,
        $$("#moderationStatus")?.value || "active",
        $$("#moderationNote")?.value.trim() || ""
      );
    }
  );
}

async function saveModeration(
  message,
  status,
  note
) {
  if (!state.db || !message?.id) return;

  const hidden = status === "hidden";
  const flagged = status === "flagged";

  try {
    await update(
      ref(
        state.db,
        `${PATHS.chat}/${message.id}`
      ),
      {
        deleted: hidden,
        hidden,
        flagged,
        reported: flagged,
        moderationStatus: status,
        moderatorUID: uid(),
        moderatorName:
          state.profile?.displayName ||
          state.user?.displayName ||
          "Administrator",
        moderatorNote: note,
        moderatedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    );

    await writeAuditLog(
      "chat_message_moderated",
      message.id,
      {
        status,
        previousStatus:
          message.moderationStatus ||
          "active"
      }
    );

    closeModal();
    toast("Moderation action saved.");
  } catch (error) {
    console.error(error);
    toast(
      error.message ||
        "Could not save moderation action.",
      true
    );
  }
}

async function toggleMessageVisibility(message) {
  if (!state.db || !message?.id) return;

  const hidden =
    message.deleted === true ||
    message.hidden === true;

  const nextHidden = !hidden;

  try {
    await update(
      ref(
        state.db,
        `${PATHS.chat}/${message.id}`
      ),
      {
        deleted: nextHidden,
        hidden: nextHidden,
        moderationStatus:
          nextHidden
            ? "hidden"
            : "active",
        moderatorUID: uid(),
        moderatorName:
          state.profile?.displayName ||
          "Administrator",
        moderatedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    );

    await writeAuditLog(
      nextHidden
        ? "chat_message_hidden"
        : "chat_message_restored",
      message.id,
      {}
    );

    toast(
      nextHidden
        ? "Message hidden."
        : "Message restored."
    );
  } catch (error) {
    console.error(error);
    toast(
      error.message ||
        "Could not update message.",
      true
    );
  }
}

/* ============================================================
   ANNOUNCEMENTS
   ============================================================ */

function renderAnnouncements(container) {
  const announcements =
    newest(state.announcements);

  container.innerHTML = `
    <section class="admin-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">CLASSROOM CONTENT</p>
          <h1>Announcements</h1>
          <p>
            Monitor published and unpublished announcements.
          </p>
        </div>
      </div>

      ${
        announcements.length
          ? `
            <div class="announcement-list">
              ${announcements.map(item => `
                <article class="announcement-card">
                  <div class="announcement-card-header">
                    <div>
                      <h3>
                        ${esc(
                          item.title ||
                          "Untitled"
                        )}
                      </h3>

                      <p>
                        By
                        ${esc(
                          item.authorName ||
                          "Teacher"
                        )}
                        ·
                        ${formatDateTime(
                          item.createdAt
                        )}
                      </p>
                    </div>

                    ${createStatusBadge(
                      item.published
                        ? "published"
                        : "draft"
                    )}
                  </div>

                  <div class="announcement-body">
                    ${esc(
                      item.body || ""
                    ).replace(
                      /\n/g,
                      "<br>"
                    )}
                  </div>

                  ${
                    item.attachmentURL ||
                    item.attachmentUrl
                      ? `
                        <a
                          class="attachment-link"
                          href="${esc(
                            safeFirebaseStorageURL?.(
                              item.attachmentURL ||
                              item.attachmentUrl
                            ) || "#"
                          )}"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          ${esc(
                            item.attachmentName ||
                            "Open attachment"
                          )}
                        </a>
                      `
                      : ""
                  }
                </article>
              `).join("")}
            </div>
          `
          : createEmptyState(
              "No announcements",
              "No classroom announcements are available."
            )
      }
    </section>
  `;
}

/* ============================================================
   AUDIT LOG
   ============================================================ */

function renderAudit(container) {
  const logs = newest(
    state.auditLogs
  );

  container.innerHTML = `
    <section class="admin-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">SECURITY</p>
          <h1>Audit logs</h1>
          <p>
            Administrative actions recorded by the application.
          </p>
        </div>
      </div>

      ${
        logs.length
          ? `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Administrator</th>
                    <th>Target</th>
                    <th>Time</th>
                    <th>Details</th>
                  </tr>
                </thead>

                <tbody>
                  ${logs.map(log => `
                    <tr>
                      <td>
                        <strong>
                          ${esc(
                            log.action ||
                            "unknown"
                          )}
                        </strong>
                      </td>

                      <td>
                        ${esc(
                          log.actorName ||
                          log.uid ||
                          "Admin"
                        )}
                      </td>

                      <td>
                        ${esc(
                          log.targetId ||
                          "—"
                        )}
                      </td>

                      <td>
                        ${formatDateTime(
                          log.createdAt
                        )}
                      </td>

                      <td>
                        <code>
                          ${esc(
                            compactJSON(
                              log.details
                            )
                          )}
                        </code>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
          : createEmptyState(
              "No audit records",
              "Administrative actions will appear here."
            )
      }
    </section>
  `;
}

/* ============================================================
   SYSTEM
   ============================================================ */

function renderSystem(container) {
  const students =
    state.users.filter(
      user => user.role === "student"
    ).length;

  const teachers =
    state.users.filter(
      user => user.role === "teacher"
    ).length;

  const admins =
    state.users.filter(
      user => user.role === "admin"
    ).length;

  const disabled =
    state.users.filter(
      user => user.status === "disabled"
    ).length;

  container.innerHTML = `
    <section class="admin-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">SYSTEM</p>
          <h1>System overview</h1>
          <p>
            Read-only operational information.
          </p>
        </div>
      </div>

      <div class="panel">
        <h2>Firebase application</h2>

        <dl class="profile-list">
          <div>
            <dt>Project</dt>
            <dd>study-c3017</dd>
          </div>

          <div>
            <dt>Database</dt>
            <dd>Realtime Database</dd>
          </div>

          <div>
            <dt>Authentication</dt>
            <dd>Email / Password</dd>
          </div>

          <div>
            <dt>Storage</dt>
            <dd>Firebase Cloud Storage</dd>
          </div>

          <div>
            <dt>Current administrator</dt>
            <dd>${esc(uid())}</dd>
          </div>
        </dl>
      </div>

      <div class="stats-grid">
        ${adminStat(
          "Students",
          students,
          "admin-users"
        )}

        ${adminStat(
          "Teachers",
          teachers,
          "admin-users"
        )}

        ${adminStat(
          "Admins",
          admins,
          "admin-users"
        )}

        ${adminStat(
          "Disabled",
          disabled,
          "admin-users"
        )}
      </div>

      <div class="notice-box">
        <strong>Security reminder</strong>
        <p>
          The admin interface is not itself an authorization
          boundary. Realtime Database Rules must independently
          enforce every privileged read and write.
        </p>
      </div>
    </section>
  `;
}

/* ============================================================
   ADMIN PROFILE
   ============================================================ */

function renderProfile(container) {
  const profile = state.profile || {};

  container.innerHTML = `
    <section class="admin-page">
      <div class="page-header">
        <div>
          <p class="eyebrow">ADMIN ACCOUNT</p>
          <h1>Administrator profile</h1>
          <p>
            Current account and authorization information.
          </p>
        </div>
      </div>

      <div class="profile-card">
        <div class="profile-avatar">
          ${esc(
            String(
              profile.displayName ||
              profile.name ||
              state.user?.email ||
              "A"
            ).charAt(0).toUpperCase()
          )}
        </div>

        <div class="profile-details">
          <h2>
            ${esc(
              profile.displayName ||
              profile.name ||
              "Administrator"
            )}
          </h2>

          <p>
            ${esc(
              profile.email ||
              state.user?.email ||
              ""
            )}
          </p>

          <span class="role-badge">
            Administrator
          </span>
        </div>
      </div>

      <div class="panel">
        <h2>Authorization</h2>

        <dl class="profile-list">
          <div>
            <dt>Firebase UID</dt>
            <dd>${esc(uid())}</dd>
          </div>

          <div>
            <dt>Profile role</dt>
            <dd>${esc(profile.role || "admin")}</dd>
          </div>

          <div>
            <dt>Allowlist</dt>
            <dd>
              ${
                state.adminUIDs?.[uid()] === true ||
                isPrimaryAdmin()
                  ? "Authorized"
                  : "Not authorized"
              }
            </dd>
          </div>

          <div>
            <dt>Account status</dt>
            <dd>${esc(profile.status || "active")}</dd>
          </div>
        </dl>
      </div>
    </section>
  `;
}

/* ============================================================
   AUDIT WRITER
   ============================================================ */

async function writeAuditLog(
  action,
  targetId = "",
  details = {}
) {
  if (!state.db || !uid()) {
    throw new Error(
      "Cannot write audit log without an authenticated administrator."
    );
  }

  const auditRef = push(
    ref(state.db, PATHS.audit)
  );

  await set(auditRef, {
    id: auditRef.key,
    action,
    targetId,
    actorUID: uid(),
    actorName:
      state.profile?.displayName ||
      state.user?.displayName ||
      state.user?.email ||
      "Administrator",
    details,
    createdAt: serverTimestamp()
  });
}

/* ============================================================
   REALTIME LISTENERS
   ============================================================ */

function subscribeUsers() {
  if (!state.db) return;

  const unsubscribe = onValue(
    ref(state.db, PATHS.users),
    snapshot => {
      state.users = records(snapshot);
      renderCurrentPage();
    },
    error => {
      console.error("Users listener:", error);
      toast(
        "Unable to load users.",
        true
      );
    }
  );

  addUnsubscriber(unsubscribe);
}

function subscribeAdminUIDs() {
  if (!state.db) return;

  const unsubscribe = onValue(
    ref(state.db, PATHS.adminUIDs),
    snapshot => {
      state.adminUIDs =
        snapshot.val() || {};

      renderCurrentPage();
    },
    error => {
      console.error("Admin allowlist:", error);
    }
  );

  addUnsubscriber(unsubscribe);
}

function subscribeLogs() {
  if (!state.db) return;

  const logsQuery = query(
    ref(state.db, PATHS.logs),
    limitToLast(500)
  );

  const unsubscribe = onValue(
    logsQuery,
    snapshot => {
      state.logs = records(snapshot);
      renderCurrentPage();
    },
    error => {
      console.error("Logs listener:", error);
      toast(
        "Unable to load study logs.",
        true
      );
    }
  );

  addUnsubscriber(unsubscribe);
}

function subscribeAnnouncements() {
  if (!state.db) return;

  const announcementsQuery = query(
    ref(state.db, PATHS.announcements),
    limitToLast(200)
  );

  const unsubscribe = onValue(
    announcementsQuery,
    snapshot => {
      state.announcements =
        newest(records(snapshot));

      renderCurrentPage();
    },
    error => {
      console.error(
        "Announcements listener:",
        error
      );
      toast(
        "Unable to load announcements.",
        true
      );
    }
  );

  addUnsubscriber(unsubscribe);
}

function subscribeChat() {
  if (!state.db) return;

  const chatQuery = query(
    ref(state.db, PATHS.chat),
    limitToLast(200)
  );

  const unsubscribe = onValue(
    chatQuery,
    snapshot => {
      state.chatMessages =
        newest(records(snapshot));

      renderCurrentPage();
    },
    error => {
      console.error(
        "Chat listener:",
        error
      );
      toast(
        "Unable to load chat messages.",
        true
      );
    }
  );

  addUnsubscriber(unsubscribe);
}

function subscribeDoubts() {
  if (!state.db) return;

  const doubtsQuery = query(
    ref(state.db, PATHS.doubts),
    limitToLast(200)
  );

  const unsubscribe = onValue(
    doubtsQuery,
    snapshot => {
      state.doubts =
        newest(records(snapshot));

      renderCurrentPage();
    },
    error => {
      console.error(
        "Doubts listener:",
        error
      );
      toast(
        "Unable to load doubts.",
        true
      );
    }
  );

  addUnsubscriber(unsubscribe);
}

function subscribeAuditLogs() {
  if (!state.db) return;

  const auditQuery = query(
    ref(state.db, PATHS.audit),
    limitToLast(300)
  );

  const unsubscribe = onValue(
    auditQuery,
    snapshot => {
      state.auditLogs =
        newest(records(snapshot));

      renderCurrentPage();
    },
    error => {
      console.error(
        "Audit listener:",
        error
      );

      /*
        Audit permission failure should not destroy the
        rest of the admin dashboard.
      */
    }
  );

  addUnsubscriber(unsubscribe);
}

/* ============================================================
   LIFECYCLE
   ============================================================ */

async function init(context = {}) {
  cleanup();

  state.auth = context.auth || null;
  state.db = context.db || null;
  state.user = context.user || null;
  state.profile = context.profile || null;
  state.toast = context.toast || null;
  state.showPage = context.showPage || null;

  state.users = [];
  state.adminUIDs = {};
  state.logs = [];
  state.announcements = [];
  state.chatMessages = [];
  state.doubts = [];
  state.auditLogs = [];

  state.currentPage = "admin-dashboard";
  state.initialized = true;

  if (!state.user || !state.db) {
    throw new Error(
      "Admin module requires an authenticated Firebase user and database."
    );
  }

  /*
    This is only an early UI guard.
    Firebase Rules must independently verify the account.
  */
  if (!isAdmin()) {
    throw new Error(
      "This account does not have administrator access."
    );
  }

  subscribeUsers();
  subscribeAdminUIDs();
  subscribeLogs();
  subscribeAnnouncements();
  subscribeChat();
  subscribeDoubts();
  subscribeAuditLogs();

  state.pageChangeHandler = event => {
    const requested =
      event?.detail?.page ||
      event?.detail?.route ||
      event?.detail;

    const page = normalizePage(requested);

    const adminPages = [
      "admin-dashboard",
      "admin-users",
      "admin-moderation",
      "admin-announcements",
      "admin-audit",
      "admin-system",
      "admin-profile"
    ];

    if (!adminPages.includes(page)) {
      return;
    }

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
   JSON / DISPLAY HELPERS
   ============================================================ */

function compactJSON(value) {
  if (value === undefined || value === null) {
    return "—";
  }

  try {
    const result =
      typeof value === "string"
        ? value
        : JSON.stringify(value);

    return result.length > 180
      ? result.slice(0, 177) + "..."
      : result;
  } catch {
    return String(value);
  }
}

/* ============================================================
   PUBLIC API
   ============================================================ */

export {
  init,
  cleanup
};
