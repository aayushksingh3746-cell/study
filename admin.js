import { auth, db } from './firebase-config.js';

import {
  ref,
  get,
  onValue,
  update,
  remove
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js';

import {
  $,
  ADMIN_UID,
  escapeHTML,
  formatDate,
  toArray,
  showToast
} from './app.js';

let initialized = false;
let chatListener = null;
let usersListener = null;
let logsListener = null;
let chatMessages = [];
let users = {};
let studyLogs = {};

function isAdministrator() {
  return auth.currentUser?.uid === ADMIN_UID;
}

function renderAdminStats() {
  $('adminStatUsers').textContent = Object.keys(users).length;
  $('adminStatMessages').textContent = chatMessages.length;
  $('adminStatLogs').textContent = Object.keys(studyLogs).length;
}

function renderModeratorChat() {
  const container = $('moderatorChatList');

  $('moderatorCount').textContent =
    `${chatMessages.length} message${chatMessages.length === 1 ? '' : 's'}`;

  if (!chatMessages.length) {
    container.innerHTML = '<div class="empty-state m-4">No messages to moderate.</div>';
    return;
  }

  container.innerHTML = [...chatMessages].reverse().map(message => `
    <article class="p-4 sm:p-5 flex items-start gap-3">
      <div class="avatar">${escapeHTML((message.displayName || 'U').charAt(0).toUpperCase())}</div>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold text-sm">${escapeHTML(message.displayName || 'Student')}</span>
          <span class="muted text-xs">${escapeHTML(formatDate(message.timestamp))}</span>
        </div>

        <p class="text-sm mt-2 whitespace-pre-wrap break-words">${escapeHTML(message.message || '')}</p>
        <p class="muted text-[10px] mt-2 break-all">UID: ${escapeHTML(message.uid || 'Unknown')}</p>
      </div>

      <button type="button"
        class="danger-btn text-xs shrink-0"
        data-delete-chat="${escapeHTML(message.id)}"
        aria-label="Delete message">
        <i class="fa-solid fa-trash"></i>
        <span>Delete</span>
      </button>
    </article>
  `).join('');
}

async function grantTeacherRole(event) {
  event.preventDefault();

  if (!isAdministrator()) {
    showToast('Only the designated administrator can change roles.', 'error');
    return;
  }

  const uid = $('targetUid').value.trim();

  if (!uid || uid.length < 10 || uid.length > 128) {
    showToast('Enter a valid Firebase UID.', 'error');
    return;
  }

  if (uid === ADMIN_UID) {
    showToast('The administrator role cannot be changed here.', 'error');
    return;
  }

  const button = $('makeTeacherBtn');
  button.disabled = true;
  button.textContent = 'Updating role...';

  try {
    const snapshot = await get(ref(db, `users/${uid}`));

    if (!snapshot.exists()) {
      throw new Error('No user profile exists for that UID. The user must register first.');
    }

    await update(ref(db, `users/${uid}`), {
      role: 'teacher'
    });

    $('roleForm').reset();
    showToast('Teacher role granted successfully.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to update the user role.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Grant teacher role';
  }
}

async function deleteChatMessage(event) {
  const button = event.target.closest('[data-delete-chat]');
  if (!button) return;

  if (!isAdministrator()) {
    showToast('Only the administrator can moderate chat.', 'error');
    return;
  }

  const messageId = button.dataset.deleteChat;

  if (!confirm('Permanently delete this chat message?')) return;

  button.disabled = true;

  try {
    await remove(ref(db, `class_chat/${messageId}`));
    showToast('Message deleted successfully.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to delete the message.', 'error');
  } finally {
    button.disabled = false;
  }
}

function bindAdminData() {
  if (chatListener) chatListener();
  if (usersListener) usersListener();
  if (logsListener) logsListener();

  chatListener = onValue(ref(db, 'class_chat'), snapshot => {
    chatMessages = toArray(snapshot.val())
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

    renderModeratorChat();
    renderAdminStats();
  }, error => {
    console.error(error);
    $('moderatorChatList').innerHTML =
      `<div class="empty-state m-4">${escapeHTML(error.message)}</div>`;
  });

  usersListener = onValue(ref(db, 'users'), snapshot => {
    users = snapshot.val() || {};
    renderAdminStats();
  }, error => console.error('Unable to load users:', error));

  logsListener = onValue(ref(db, 'daily_study_logs'), snapshot => {
    studyLogs = snapshot.val() || {};
    renderAdminStats();
  }, error => console.error('Unable to load study logs:', error));
}

export async function initializeAdmin() {
  if (!isAdministrator()) {
    showToast('Administrator access denied.', 'error');
    return;
  }

  if (!initialized) {
    $('roleForm').addEventListener('submit', grantTeacherRole);
    $('moderatorChatList').addEventListener('click', deleteChatMessage);
    initialized = true;
  }

  bindAdminData();
}

document.addEventListener('studyspace:logout', () => {
  if (chatListener) chatListener();
  if (usersListener) usersListener();
  if (logsListener) logsListener();

  chatListener = null;
  usersListener = null;
  logsListener = null;

  chatMessages = [];
  users = {};
  studyLogs = {};
});
