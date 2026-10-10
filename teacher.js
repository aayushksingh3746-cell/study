import { auth, db, storage } from './firebase-config.js';

import {
  ref,
  get,
  onValue,
  push,
  set,
  update,
  remove
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js';

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-storage.js';

import {
  $,
  currentUser as getCurrentUser,
  escapeHTML,
  formatDate,
  toArray,
  showToast
} from './app.js';

let initialized = false;
let announcementListener = null;
let logsListener = null;
let usersListener = null;
let doubtsListener = null;

let announcements = [];
let logs = [];
let users = {};
let doubtThreads = {};
let selectedStudentUid = null;

function user() {
  return auth.currentUser;
}

function renderTeacherAnnouncements() {
  const container = $('teacherAnnouncementList');

  $('teacherNoticeCount').textContent = String(announcements.length);

  if (!announcements.length) {
    container.innerHTML = '<div class="empty-state">No announcements published.</div>';
    return;
  }

  container.innerHTML = announcements.map(item => `
    <article class="notice-card ${item.priority === 'urgent' ? 'urgent' : ''}">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <span class="badge ${item.priority === 'urgent' ? 'badge-red' : 'badge-purple'}">
            ${item.priority === 'urgent' ? 'URGENT' : 'REGULAR'}
          </span>
          <h3 class="font-bold mt-2">${escapeHTML(item.title || 'Announcement')}</h3>
          <p class="muted text-xs mt-1">${escapeHTML(formatDate(item.createdAt))}</p>
        </div>

        <button class="danger-btn text-xs shrink-0"
          type="button"
          data-delete-announcement="${escapeHTML(item.id)}">
          <i class="fa-solid fa-trash"></i> Delete
        </button>
      </div>

      <p class="muted text-sm mt-3 whitespace-pre-wrap">${escapeHTML(item.message || '')}</p>

      ${item.attachmentURL
        ? `<a class="inline-block mt-3 text-sm" href="${escapeHTML(item.attachmentURL)}" target="_blank" rel="noopener noreferrer">Open attachment <i class="fa-solid fa-arrow-up-right-from-square ml-1"></i></a>`
        : ''}
    </article>
  `).join('');
}

async function publishAnnouncement(event) {
  event.preventDefault();

  const current = user();

  if (!current) {
    showToast('Please sign in again.', 'error');
    return;
  }

  const title = $('announcementTitle').value.trim();
  const message = $('announcementBody').value.trim();
  const priority = $('announcementPriority').value;
  const file = $('announcementFile').files[0];

  if (!title || !message) {
    showToast('Enter an announcement title and message.', 'error');
    return;
  }

  if (file && file.size > 10 * 1024 * 1024) {
    showToast('The PDF must be smaller than 10 MB.', 'error');
    return;
  }

  if (file && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Only PDF attachments are allowed.', 'error');
    return;
  }

  const button = $('publishAnnouncementBtn');
  button.disabled = true;
  button.textContent = 'Publishing...';

  try {
    let attachmentURL = '';
    let attachmentName = '';

    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
      const path = `announcements/${current.uid}/${Date.now()}_${safeName}`;

      const upload = await uploadBytes(storageRef(storage, path), file, {
        contentType: 'application/pdf'
      });

      attachmentURL = await getDownloadURL(upload.ref);
      attachmentName = file.name;
    }

    const announcementRef = push(ref(db, 'announcements'));

    await set(announcementRef, {
      title: title.slice(0, 120),
      message: message.slice(0, 5000),
      priority: priority === 'urgent' ? 'urgent' : 'regular',
      attachmentURL,
      attachmentName,
      authorUid: current.uid,
      authorName: current.displayName || 'Teacher',
      createdAt: Date.now()
    });

    $('announcementForm').reset();
    showToast('Announcement published successfully.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to publish announcement.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Publish announcement';
  }
}

async function deleteAnnouncement(event) {
  const button = event.target.closest('[data-delete-announcement]');
  if (!button) return;

  const id = button.dataset.deleteAnnouncement;

  if (!confirm('Delete this announcement?')) return;

  button.disabled = true;

  try {
    await remove(ref(db, `announcements/${id}`));
    showToast('Announcement deleted.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to delete announcement.', 'error');
  } finally {
    button.disabled = false;
  }
}

function renderVerification() {
  const tbody = $('verificationTable');

  $('verificationCount').textContent =
    `${logs.length} log${logs.length === 1 ? '' : 's'}`;

  $('teacherStatLogs').textContent = logs.length;
  $('teacherStatPending').textContent = logs.filter(log => !log.verified_by_teacher).length;

  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center muted py-8">No study logs submitted yet.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(log => {
    const uid = log.uid || log.id.split('_')[0];
    const profile = users[uid] || {};
    const name = profile.displayName || log.studentName || 'Unknown student';
    const roll = profile.rollNumber ?? log.rollNumber ?? '—';
    const verified = Boolean(log.verified_by_teacher);

    return `
      <tr>
        <td>
          <div class="font-semibold">${escapeHTML(name)}</div>
          <div class="muted text-xs mt-1">Roll: ${escapeHTML(roll)}</div>
        </td>
        <td>${escapeHTML(log.date || '—')}</td>
        <td>${escapeHTML(log.questionsSolved ?? 0)}</td>
        <td>${escapeHTML(log.timeSpent ?? 0)} min</td>
        <td>
          ${log.proof_image_url
            ? `<a href="${escapeHTML(log.proof_image_url)}" target="_blank" rel="noopener noreferrer">View image ↗</a>`
            : '<span class="muted">No image</span>'}
        </td>
        <td>
          <button type="button"
            class="${verified ? 'secondary-btn' : 'primary-btn'} text-xs"
            data-verify-log="${escapeHTML(log.id)}"
            ${verified ? 'disabled' : ''}>
            <i class="fa-solid ${verified ? 'fa-check' : 'fa-circle-check'} mr-1"></i>
            ${verified ? 'Verified' : 'Verify'}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function verifyLog(event) {
  const button = event.target.closest('[data-verify-log]');
  if (!button) return;

  const id = button.dataset.verifyLog;
  const current = user();

  if (!current) return showToast('Please sign in again.', 'error');

  button.disabled = true;

  try {
    await update(ref(db, `daily_study_logs/${id}`), {
      verified_by_teacher: true,
      verified_by_uid: current.uid,
      verified_at: Date.now()
    });

    showToast('Study log verified.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to verify study log.', 'error');
    button.disabled = false;
  }
}

function getStudentName(uid, messages = []) {
  return users[uid]?.displayName ||
    messages.find(message => message.senderRole === 'student')?.displayName ||
    'Student';
}

function getLatestMessage(messages) {
  return messages.reduce((latest, message) =>
    Number(message.timestamp || 0) > Number(latest.timestamp || 0)
      ? message
      : latest, {});
}

function renderDoubtInbox() {
  const container = $('doubtStudentList');

  const students = Object.entries(doubtThreads).map(([uid, thread]) => {
    const messages = toArray(thread).sort(
      (a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0)
    );

    return {
      uid,
      messages,
      latest: getLatestMessage(messages)
    };
  }).sort((a, b) => Number(b.latest.timestamp || 0) - Number(a.latest.timestamp || 0));

  $('doubtStudentCount').textContent = String(students.length);
  $('teacherStatDoubts').textContent = students.length;

  if (!students.length) {
    container.innerHTML = '<div class="empty-state">No student conversations yet.</div>';
    selectedStudentUid = null;
    $('selectedDoubtHeader').innerHTML =
      '<h3 class="font-bold">Doubt inbox</h3><p class="muted text-sm mt-1">Waiting for student messages.</p>';
    $('teacherDoubtChat').innerHTML = '<div class="empty-state">No conversations to display.</div>';
    $('teacherDoubtInput').disabled = true;
    $('teacherDoubtSend').disabled = true;
    return;
  }

  if (!selectedStudentUid || !doubtThreads[selectedStudentUid]) {
    selectedStudentUid = students[0].uid;
  }

  container.innerHTML = students.map(student => {
    const name = getStudentName(student.uid, student.messages);
    const active = selectedStudentUid === student.uid;

    return `
      <button type="button"
        class="w-full text-left p-3 rounded-xl border transition ${active ? 'border-indigo-400/50 bg-indigo-500/10' : 'border-[#28344c] hover:bg-[#19243a]'}"
        data-select-doubt="${escapeHTML(student.uid)}">
        <div class="flex items-center gap-3">
          <div class="avatar">${escapeHTML(name.charAt(0).toUpperCase())}</div>
          <div class="min-w-0 flex-1">
            <div class="font-semibold text-sm truncate">${escapeHTML(name)}</div>
            <div class="muted text-xs mt-1 truncate">${escapeHTML(student.latest.message || 'No messages')}</div>
          </div>
          <span class="text-xs muted">${student.messages.length}</span>
        </div>
      </button>
    `;
  }).join('');

  renderSelectedDoubt();
}

function renderSelectedDoubt() {
  if (!selectedStudentUid) return;

  const messages = toArray(doubtThreads[selectedStudentUid]).sort(
    (a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0)
  );

  const name = getStudentName(selectedStudentUid, messages);

  $('selectedDoubtHeader').innerHTML = `
    <h3 class="font-bold">${escapeHTML(name)}</h3>
    <p class="muted text-xs mt-1">Student UID: ${escapeHTML(selectedStudentUid)}</p>
  `;

  $('teacherDoubtInput').disabled = false;
  $('teacherDoubtSend').disabled = false;

  const container = $('teacherDoubtChat');
  const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

  if (!messages.length) {
    container.innerHTML = '<div class="empty-state">This conversation has no messages yet.</div>';
    return;
  }

  container.innerHTML = messages.map(message => {
    const mine = message.senderRole === 'teacher' ||
      message.senderRole === 'admin' ||
      message.senderUid === user()?.uid;

    return `
      <div class="chat-bubble ${mine ? 'sender' : 'receiver'}">
        <div class="chat-meta">
          <span class="font-bold">${escapeHTML(message.displayName || (mine ? 'Teacher' : 'Student'))}</span>
          <span class="muted">${escapeHTML(formatDate(message.timestamp))}</span>
        </div>
        <p class="chat-message">${escapeHTML(message.message || '')}</p>
      </div>
    `;
  }).join('');

  if (nearBottom || container.scrollHeight < 500) {
    container.scrollTop = container.scrollHeight;
  }
}

async function replyToDoubt(event) {
  event.preventDefault();

  const current = user();
  if (!current || !selectedStudentUid) return;

  const input = $('teacherDoubtInput');
  const message = input.value.trim();
  if (!message) return;

  const button = $('teacherDoubtSend');
  button.disabled = true;

  try {
    const messageRef = push(ref(db, `direct_doubts/${selectedStudentUid}`));

    await set(messageRef, {
      uid: current.uid,
      senderUid: current.uid,
      senderRole: 'teacher',
      displayName: current.displayName || 'Teacher',
      message: message.slice(0, 2000),
      timestamp: Date.now()
    });

    input.value = '';
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to send reply.', 'error');
  } finally {
    button.disabled = false;
  }
}

function bindTeacherListeners() {
  if (announcementListener) announcementListener();
  if (logsListener) logsListener();
  if (usersListener) usersListener();
  if (doubtsListener) doubtsListener();

  announcementListener = onValue(ref(db, 'announcements'), snapshot => {
    announcements = toArray(snapshot.val()).sort(
      (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
    );

    renderTeacherAnnouncements();
  }, error => {
    console.error(error);
    showToast('Unable to load announcements.', 'error');
  });

  logsListener = onValue(ref(db, 'daily_study_logs'), snapshot => {
    logs = toArray(snapshot.val()).sort(
      (a, b) => String(b.date || '').localeCompare(String(a.date || ''))
    );

    renderVerification();
  }, error => {
    console.error(error);
    showToast('Unable to load study logs.', 'error');
  });

  usersListener = onValue(ref(db, 'users'), snapshot => {
    users = snapshot.val() || {};
    renderVerification();
    renderDoubtInbox();
  }, error => console.error('Unable to load user profiles:', error));

  doubtsListener = onValue(ref(db, 'direct_doubts'), snapshot => {
    doubtThreads = snapshot.val() || {};
    renderDoubtInbox();
  }, error => {
    console.error(error);
    showToast('Unable to load doubt inbox.', 'error');
  });
}

export async function initializeTeacher() {
  if (!user()) return;

  if (!initialized) {
    $('announcementForm').addEventListener('submit', publishAnnouncement);
    $('teacherAnnouncementList').addEventListener('click', deleteAnnouncement);
    $('verificationTable').addEventListener('click', verifyLog);
    $('doubtStudentList').addEventListener('click', event => {
      const button = event.target.closest('[data-select-doubt]');
      if (!button) return;

      selectedStudentUid = button.dataset.selectDoubt;
      renderDoubtInbox();
    });
    $('teacherDoubtForm').addEventListener('submit', replyToDoubt);
    initialized = true;
  }

  bindTeacherListeners();
}

document.addEventListener('studyspace:logout', () => {
  if (announcementListener) announcementListener();
  if (logsListener) logsListener();
  if (usersListener) usersListener();
  if (doubtsListener) doubtsListener();

  announcementListener = null;
  logsListener = null;
  usersListener = null;
  doubtsListener = null;

  announcements = [];
  logs = [];
  users = {};
  doubtThreads = {};
  selectedStudentUid = null;
});
