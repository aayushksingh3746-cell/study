import { db, storage } from './firebase-config.js';

import {
  ref,
  get,
  push,
  set,
  update,
  onValue,
  query,
  limitToLast
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js';

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-storage.js';

let initialised = false;
let currentUser = null;
let usersCache = {};
let selectedStudentUid = null;
let activeThreadListener = null;
let submissionListenerStarted = false;
let userListenerStarted = false;
let doubtListListenerStarted = false;

const $ = id => document.getElementById(id);

function classroom() {
  return window.classroom || {};
}

function escapeHTML(value) {
  return classroom().escapeHTML
    ? classroom().escapeHTML(value)
    : String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[c]);
}

function toast(message, type = 'info') {
  classroom().showToast?.(message, type);
}

function formatTime(timestamp) {
  if (classroom().formatTime) {
    return classroom().formatTime(timestamp);
  }

  return timestamp ? new Date(timestamp).toLocaleString() : '';
}

function setBusy(button, busy, text = 'Please wait...') {
  if (!button) return;

  if (busy) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.disabled = true;
    button.innerHTML =
      `<i class="fa-solid fa-spinner fa-spin mr-2"></i>${escapeHTML(text)}`;
  } else {
    button.disabled = false;

    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

function safeListen(databaseRef, callback, label) {
  return onValue(
    databaseRef,
    snapshot => {
      try {
        callback(snapshot);
      } catch (error) {
        console.error(`${label} rendering failed:`, error);
      }
    },
    error => {
      console.error(`${label} listener failed:`, error);
      toast(`${label} could not be loaded. Check Firebase permissions.`, 'error');
    }
  );
}

/* -------------------------------------------------------
   ANNOUNCEMENTS
------------------------------------------------------- */

function initAnnouncementForm() {
  const form = $('announcementForm');

  if (!form || form.dataset.initialised === 'true') return;

  form.dataset.initialised = 'true';

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const title = $('announcementTitle')?.value.trim();
    const message = $('announcementMessage')?.value.trim();
    const priority = $('announcementPriority')?.value || 'normal';
    const file = $('announcementPDF')?.files?.[0];
    const button = $('announcementSubmit');

    if (!title || !message) {
      toast('Enter an announcement title and message.', 'error');
      return;
    }

    if (title.length > 120 || message.length > 5000) {
      toast('The announcement exceeds the allowed length.', 'error');
      return;
    }

    if (file) {
      const isPDF =
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf');

      if (!isPDF) {
        toast('Only PDF attachments are supported.', 'error');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        toast('The PDF must be smaller than 10 MB.', 'error');
        return;
      }
    }

    setBusy(button, true, 'Publishing...');

    try {
      let fileURL = '';
      let fileName = '';
      let fileStoragePath = '';

      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

        fileStoragePath =
          `announcements/${currentUser.uid}/${Date.now()}_${safeName}`;

        const objectRef = storageRef(storage, fileStoragePath);

        const uploaded = await uploadBytes(objectRef, file, {
          contentType: 'application/pdf'
        });

        fileURL = await getDownloadURL(uploaded.ref);
        fileName = file.name;
      }

      const announcement = {
        title,
        message,
        priority: priority === 'important' ? 'important' : 'normal',
        fileURL,
        fileName,
        fileStoragePath,
        createdAt: Date.now(),
        createdBy: currentUser.uid,
        createdByName:
          classroom().profile?.displayName ||
          currentUser.displayName ||
          'Teacher'
      };

      await push(ref(db, 'announcements'), announcement);

      form.reset();

      toast('Announcement published successfully.', 'success');

    } catch (error) {
      console.error('Announcement publication failed:', error);

      toast(
        error.message || 'Announcement could not be published. Check your Firebase rules.',
        'error'
      );
    } finally {
      setBusy(button, false);
    }
  });
}

/* -------------------------------------------------------
   USERS CACHE
------------------------------------------------------- */

function initUsersCache() {
  if (userListenerStarted) return;

  userListenerStarted = true;

  safeListen(
    ref(db, 'users'),
    snapshot => {
      usersCache = snapshot.exists() ? snapshot.val() : {};

      renderVerificationTable();
      renderDoubtStudentList();
    },
    'Student profiles'
  );
}

/* -------------------------------------------------------
   STUDY VERIFICATION
------------------------------------------------------- */

let studyLogsCache = {};

function initVerification() {
  if (submissionListenerStarted) return;

  submissionListenerStarted = true;

  safeListen(
    ref(db, 'daily_study_logs'),
    snapshot => {
      studyLogsCache = snapshot.exists() ? snapshot.val() : {};
      renderVerificationTable();
    },
    'Study submissions'
  );
}

function renderVerificationTable() {
  const tbody = $('verificationTable');
  if (!tbody) return;

  const entries = Object.entries(studyLogsCache || {})
    .map(([id, record]) => ({ id, ...record }))
    .sort((a, b) =>
      Number(b.submittedAt || 0) - Number(a.submittedAt || 0)
    );

  if (!entries.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="p-4 muted">
          No study submissions yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = entries.map(entry => {
    const student =
      usersCache[entry.uid] ||
      { displayName: entry.displayName || 'Student' };

    const verified = entry.verified_by_teacher === true;

    return `
      <tr class="border-b border-slate-700/40">
        <td class="p-3">
          <p class="font-semibold">${escapeHTML(student.displayName || 'Student')}</p>
          <p class="muted text-xs">${escapeHTML(student.email || '')}</p>
        </td>

        <td class="p-3 whitespace-nowrap">
          ${escapeHTML(entry.date || '')}
        </td>

        <td class="p-3">${escapeHTML(String(entry.questionsSolved ?? 0))}</td>

        <td class="p-3">${escapeHTML(String(entry.timeSpentMins ?? 0))} min</td>

        <td class="p-3">
          ${
            entry.proof_image_url
              ? `<a class="text-indigo-300 underline"
                    href="${escapeHTML(entry.proof_image_url)}"
                    target="_blank" rel="noopener noreferrer">
                    View proof
                 </a>`
              : '<span class="muted">No proof</span>'
          }
        </td>

        <td class="p-3">
          <span class="status-pill ${
            verified ? 'text-emerald-300' : 'text-amber-300'
          }">
            ${verified ? 'Verified' : 'Pending'}
          </span>
        </td>

        <td class="p-3">
          ${
            verified
              ? '<span class="muted text-xs">Completed</span>'
              : `<button type="button"
                         class="secondary-btn text-xs"
                         data-verify-id="${escapeHTML(entry.id)}">
                   Verify
                 </button>`
          }
        </td>
      </tr>
    `;
  }).join('');
}

function initVerificationActions() {
  const tbody = $('verificationTable');

  if (!tbody || tbody.dataset.initialised === 'true') return;

  tbody.dataset.initialised = 'true';

  tbody.addEventListener('click', async event => {
    const button = event.target.closest('[data-verify-id]');

    if (!button) return;

    const id = button.dataset.verifyId;
    const entry = studyLogsCache[id];

    if (!entry) {
      toast('This study submission no longer exists.', 'error');
      return;
    }

    setBusy(button, true, 'Verifying...');

    try {
      await update(ref(db, `daily_study_logs/${id}`), {
        verified_by_teacher: true,
        verified_by: currentUser.uid,
        verifiedAt: Date.now()
      });

      toast('Study submission verified.', 'success');

    } catch (error) {
      console.error('Verification failed:', error);
      toast('Could not verify this submission. Check your Firebase permissions.', 'error');
    } finally {
      setBusy(button, false);
    }
  });
}

/* -------------------------------------------------------
   PRIVATE DOUBT INBOX
------------------------------------------------------- */

function initDoubtInbox() {
  if (doubtListListenerStarted) return;

  doubtListListenerStarted = true;

  safeListen(
    ref(db, 'direct_doubts'),
    snapshot => {
      const threadUIDs = [];

      if (snapshot.exists()) {
        snapshot.forEach(child => {
          const uid = child.key;

          if (uid) threadUIDs.push(uid);
        });
      }

      renderDoubtStudentList(threadUIDs);
    },
    'Doubt inbox'
  );
}

function renderDoubtStudentList(threadUIDs = null) {
  const container = $('doubtStudentList');
  if (!container) return;

  if (threadUIDs === null) {
    // If the thread list has not yet been fetched, do not invent threads.
    return;
  }

  if (!threadUIDs.length) {
    container.innerHTML =
      '<p class="muted text-sm">No student conversations yet.</p>';
    return;
  }

  container.innerHTML = threadUIDs.map(uid => {
    const profile = usersCache[uid] || {};
    const name = profile.displayName || profile.email || 'Student';

    return `
      <button type="button"
              data-student-uid="${escapeHTML(uid)}"
              class="secondary-btn w-full text-left ${
                selectedStudentUid === uid ? 'border-indigo-400' : ''
              }">
        <span class="block font-semibold truncate">${escapeHTML(name)}</span>
        <span class="block muted text-xs truncate">${escapeHTML(profile.email || uid)}</span>
      </button>
    `;
  }).join('');

  if (!container.dataset.initialised) {
    container.dataset.initialised = 'true';

    container.addEventListener('click', event => {
      const button = event.target.closest('[data-student-uid]');

      if (!button) return;

      openDoubtThread(button.dataset.studentUid);
    });
  }
}

function openDoubtThread(uid) {
  if (!uid) return;

  selectedStudentUid = uid;

  renderDoubtStudentList(
    Object.keys(
      usersCache
    ).filter(key => key === uid)
  );

  const replyInput = $('teacherDoubtReply');
  const replyButton = $('teacherDoubtReplyButton');
  const messagesElement = $('teacherDoubtMessages');

  if (replyInput) replyInput.disabled = false;
  if (replyButton) replyButton.disabled = false;

  if (messagesElement) {
    messagesElement.innerHTML =
      '<p class="muted text-sm">Loading conversation...</p>';
  }

  if (typeof activeThreadListener === 'function') {
    activeThreadListener();
    activeThreadListener = null;
  }

  activeThreadListener = safeListen(
    query(
      ref(db, `direct_doubts/${uid}/messages`),
      limitToLast(150)
    ),
    snapshot => {
      if (!messagesElement) return;

      if (!snapshot.exists()) {
        messagesElement.innerHTML =
          '<p class="muted text-sm text-center py-8">No messages in this conversation yet.</p>';
        return;
      }

      const messages = [];

      snapshot.forEach(child => {
        messages.push({
          id: child.key,
          ...child.val()
        });
      });

      messages.sort((a, b) =>
        Number(a.timestamp || 0) - Number(b.timestamp || 0)
      );

      messagesElement.innerHTML = messages.map(message => {
        const ownMessage = message.senderUid === currentUser.uid;

        return `
          <div class="chat-bubble ${ownMessage ? 'sent' : 'received'}">
            <p class="text-xs font-bold mb-1">
              ${escapeHTML(message.displayName || 'User')}
            </p>

            <p class="text-sm whitespace-pre-wrap">${escapeHTML(message.text || '')}</p>

            <p class="text-[10px] opacity-70 text-right mt-2">
              ${escapeHTML(formatTime(message.timestamp))}
            </p>
          </div>
        `;
      }).join('');

      messagesElement.scrollTop = messagesElement.scrollHeight;
    },
    'Selected doubt conversation'
  );

  renderDoubtStudentListFromCurrentSelection();
}

function renderDoubtStudentListFromCurrentSelection() {
  const container = $('doubtStudentList');
  if (!container || !selectedStudentUid) return;

  container.querySelectorAll('[data-student-uid]').forEach(button => {
    button.classList.toggle(
      'border-indigo-400',
      button.dataset.studentUid === selectedStudentUid
    );
  });
}

function initTeacherReplyForm() {
  const form = $('teacherDoubtReplyForm');

  if (!form || form.dataset.initialised === 'true') return;

  form.dataset.initialised = 'true';

  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (!selectedStudentUid) {
      toast('Select a student first.', 'error');
      return;
    }

    const input = $('teacherDoubtReply');
    const button = $('teacherDoubtReplyButton');
    const text = input?.value.trim();

    if (!text) return;

    setBusy(button, true, 'Sending...');

    try {
      const profile = classroom().profile || {};

      await push(
        ref(db, `direct_doubts/${selectedStudentUid}/messages`),
        {
          senderUid: currentUser.uid,
          senderRole: 'teacher',
          displayName:
            profile.displayName ||
            currentUser.displayName ||
            'Teacher',
          text,
          timestamp: Date.now()
        }
      );

      input.value = '';

    } catch (error) {
      console.error('Teacher reply failed:', error);
      toast('Reply could not be sent. Check your Firebase permissions.', 'error');
    } finally {
      setBusy(button, false);
    }
  });
}

/* -------------------------------------------------------
   MODULE ENTRY POINT
------------------------------------------------------- */

export function initTeacher(user) {
  if (!user) return;

  if (initialised && currentUser?.uid === user.uid) return;

  initialised = true;
  currentUser = user;

  try {
    initAnnouncementForm();
    initUsersCache();
    initVerification();
    initVerificationActions();
    initDoubtInbox();
    initTeacherReplyForm();
  } catch (error) {
    console.error('Teacher module startup failed:', error);
    toast('Some teacher features could not start.', 'error');
  }
}
