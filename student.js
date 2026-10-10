import { db, storage } from './firebase-config.js';

import {
  ref,
  get,
  set,
  push,
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
let chatListenerStarted = false;
let doubtListenerStarted = false;
let trackerListenerStarted = false;
let noticeListenerStarted = false;

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

function localDate() {
  if (classroom().localDateString) {
    return classroom().localDateString();
  }

  const d = new Date();

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function formatTime(timestamp) {
  if (classroom().formatTime) {
    return classroom().formatTime(timestamp);
  }

  if (!timestamp) return '';

  return new Date(timestamp).toLocaleString();
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
        toast(`Unable to display ${label.toLowerCase()}.`, 'error');
      }
    },
    error => {
      console.error(`${label} listener failed:`, error);
      toast(`${label} could not be loaded. Check Firebase permissions.`, 'error');
    }
  );
}

/* -------------------------------------------------------
   CLASS NOTICES
------------------------------------------------------- */

function initNotices() {
  if (noticeListenerStarted) return;

  noticeListenerStarted = true;

  const container = $('noticesList');
  if (!container) return;

  container.innerHTML =
    '<div class="content-card muted">Loading announcements...</div>';

  safeListen(
    query(ref(db, 'announcements'), limitToLast(100)),
    snapshot => {
      if (!snapshot.exists()) {
        container.innerHTML = `
          <div class="content-card">
            <i class="fa-regular fa-bell text-2xl text-indigo-300 mb-3"></i>
            <p class="font-semibold">No announcements yet</p>
            <p class="muted text-sm mt-2">New classroom notices will appear here.</p>
          </div>
        `;
        return;
      }

      const notices = [];

      snapshot.forEach(child => {
        notices.push({
          id: child.key,
          ...child.val()
        });
      });

      notices.sort((a, b) =>
        Number(b.createdAt || 0) - Number(a.createdAt || 0)
      );

      container.innerHTML = notices.map(notice => {
        const important = notice.priority === 'important';

        return `
          <article class="content-card">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <h2 class="text-lg font-bold">
                ${escapeHTML(notice.title || 'Class announcement')}
              </h2>

              <span class="status-pill ${
                important ? 'text-amber-300' : ''
              }">
                ${important ? 'Important' : 'Announcement'}
              </span>
            </div>

            <p class="muted text-xs mt-2">
              ${escapeHTML(formatTime(notice.createdAt))}
            </p>

            <p class="mt-4 whitespace-pre-wrap break-words">${
              escapeHTML(notice.message || '')
            }</p>

            ${
              notice.fileURL
                ? `<a class="inline-flex items-center gap-2 mt-4 text-indigo-300 hover:text-indigo-200"
                     href="${escapeHTML(notice.fileURL)}"
                     target="_blank" rel="noopener noreferrer">
                     <i class="fa-regular fa-file-pdf"></i>
                     ${escapeHTML(notice.fileName || 'Open attachment')}
                   </a>`
                : ''
            }
          </article>
        `;
      }).join('');
    },
    'Announcements'
  );
}

/* -------------------------------------------------------
   GLOBAL CLASS CHAT
------------------------------------------------------- */

function renderChatMessage(message, ownMessage) {
  const sender = message.displayName || 'Class member';

  return `
    <div class="chat-bubble ${ownMessage ? 'sent' : 'received'}">
      <p class="text-xs font-bold mb-1 ${
        ownMessage ? 'text-indigo-200' : 'text-slate-300'
      }">${escapeHTML(sender)}</p>

      <p class="text-sm whitespace-pre-wrap">${escapeHTML(message.text || '')}</p>

      <p class="text-[10px] opacity-70 text-right mt-2">
        ${escapeHTML(formatTime(message.timestamp))}
      </p>
    </div>
  `;
}

function initClassChat() {
  if (chatListenerStarted) return;

  chatListenerStarted = true;

  const messagesElement = $('classChatMessages');
  const form = $('classChatForm');

  if (!messagesElement || !form) return;

  safeListen(
    query(ref(db, 'class_chat'), limitToLast(150)),
    snapshot => {
      if (!snapshot.exists()) {
        messagesElement.innerHTML = `
          <p class="muted text-sm text-center py-8">
            No messages yet. Start the conversation!
          </p>
        `;
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

      messagesElement.innerHTML = messages.map(message =>
        renderChatMessage(
          message,
          message.uid === currentUser.uid
        )
      ).join('');

      messagesElement.scrollTop = messagesElement.scrollHeight;
    },
    'Class chat'
  );

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const input = $('classChatInput');
    const button = form.querySelector('button[type="submit"]');
    const text = input?.value.trim();

    if (!text || !currentUser) return;

    setBusy(button, true, 'Sending...');

    try {
      const profile = classroom().profile || {};

      await push(ref(db, 'class_chat'), {
        uid: currentUser.uid,
        displayName:
          profile.displayName ||
          currentUser.displayName ||
          currentUser.email ||
          'Student',
        text,
        timestamp: Date.now()
      });

      input.value = '';
    } catch (error) {
      console.error('Sending class message failed:', error);
      toast('Message could not be sent. Check your connection and permissions.', 'error');
    } finally {
      setBusy(button, false);
    }
  });
}

/* -------------------------------------------------------
   PRIVATE DOUBT CHAT
------------------------------------------------------- */

function initDoubtChat() {
  if (doubtListenerStarted) return;

  doubtListenerStarted = true;

  const messagesElement = $('doubtMessages');
  const form = $('doubtForm');

  if (!messagesElement || !form) return;

  safeListen(
    query(
      ref(db, `direct_doubts/${currentUser.uid}/messages`),
      limitToLast(150)
    ),
    snapshot => {
      if (!snapshot.exists()) {
        messagesElement.innerHTML = `
          <p class="muted text-sm text-center py-8">
            No messages yet. Send your first question to your teacher.
          </p>
        `;
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
              ${escapeHTML(message.displayName || (ownMessage ? 'You' : 'Teacher'))}
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
    'Private doubt conversation'
  );

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const input = $('doubtInput');
    const button = form.querySelector('button[type="submit"]');
    const text = input?.value.trim();

    if (!text || !currentUser) return;

    setBusy(button, true, 'Sending...');

    try {
      const profile = classroom().profile || {};

      await push(
        ref(db, `direct_doubts/${currentUser.uid}/messages`),
        {
          senderUid: currentUser.uid,
          senderRole: 'student',
          displayName:
            profile.displayName ||
            currentUser.displayName ||
            'Student',
          text,
          timestamp: Date.now()
        }
      );

      input.value = '';
    } catch (error) {
      console.error('Sending doubt failed:', error);
      toast('Your question could not be sent. Check your connection and permissions.', 'error');
    } finally {
      setBusy(button, false);
    }
  });
}

/* -------------------------------------------------------
   STUDY TRACKER
------------------------------------------------------- */

function initTrackerHistory() {
  if (trackerListenerStarted) return;

  trackerListenerStarted = true;

  const container = $('trackerHistory');
  if (!container) return;

  safeListen(
    ref(db, 'daily_study_logs'),
    snapshot => {
      const entries = [];

      if (snapshot.exists()) {
        snapshot.forEach(child => {
          const item = child.val();

          if (item.uid === currentUser.uid) {
            entries.push({
              id: child.key,
              ...item
            });
          }
        });
      }

      entries.sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || ''))
      );

      if (!entries.length) {
        container.innerHTML = `
          <div class="content-card muted">
            You haven't submitted any study logs yet.
          </div>
        `;
        return;
      }

      container.innerHTML = entries.map(entry => `
        <article class="content-card">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="font-bold">${escapeHTML(entry.date || 'Study log')}</h3>
              <p class="muted text-sm mt-1">
                ${escapeHTML(String(entry.questionsSolved ?? 0))} questions ·
                ${escapeHTML(String(entry.timeSpentMins ?? 0))} minutes
              </p>
            </div>

            <span class="status-pill">
              ${entry.verified_by_teacher ? 'Verified' : 'Pending verification'}
            </span>
          </div>

          ${
            entry.proof_image_url
              ? `<a href="${escapeHTML(entry.proof_image_url)}"
                    target="_blank" rel="noopener noreferrer"
                    class="inline-flex mt-4 items-center gap-2 text-indigo-300">
                    <i class="fa-regular fa-image"></i> View submitted proof
                 </a>`
              : ''
          }
        </article>
      `).join('');
    },
    'Study history'
  );
}

function validateStudyImage(file) {
  if (!file) {
    throw new Error('Please select an image of your study work.');
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('The study proof must be an image.');
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('The image must be smaller than 10 MB.');
  }
}

async function compressImage(file) {
  if (typeof window.imageCompression !== 'function') {
    return file;
  }

  return window.imageCompression(file, {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    useWebWorker: false
  });
}

function initTrackerForm() {
  const form = $('trackerForm');

  if (!form || form.dataset.initialised === 'true') return;

  form.dataset.initialised = 'true';

  if ($('studyDate')) {
    $('studyDate').value = localDate();
    $('studyDate').max = localDate();
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (!currentUser) return;

    const date = $('studyDate')?.value;
    const questions = Number($('questionsSolved')?.value);
    const minutes = Number($('timeSpent')?.value);
    const file = $('studyProof')?.files?.[0];
    const button = $('trackerSubmit');

    if (!date || date > localDate()) {
      toast('Choose a valid study date.', 'error');
      return;
    }

    if (!Number.isInteger(questions) || questions < 0 || questions > 10000) {
      toast('Enter a valid number of questions.', 'error');
      return;
    }

    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      toast('Study time must be between 1 and 1440 minutes.', 'error');
      return;
    }

    try {
      validateStudyImage(file);
    } catch (error) {
      toast(error.message, 'error');
      return;
    }

    setBusy(button, true, 'Uploading proof...');

    try {
      const existingKey = `${currentUser.uid}_${date}`;
      const existingSnapshot = await get(
        ref(db, `daily_study_logs/${existingKey}`)
      );

      if (existingSnapshot.exists()) {
        toast(
          'A study log already exists for this date. Contact your teacher if you need it corrected.',
          'error'
        );
        return;
      }

      const compressed = await compressImage(file);

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path =
        `homework-proofs/${currentUser.uid}/${date}_${Date.now()}_${safeName}`;

      const imageReference = storageRef(storage, path);

      const uploaded = await uploadBytes(
        imageReference,
        compressed,
        {
          contentType: compressed.type || file.type
        }
      );

      const downloadURL = await getDownloadURL(uploaded.ref);

      const profile = classroom().profile || {};

      const record = {
        uid: currentUser.uid,
        displayName:
          profile.displayName ||
          currentUser.displayName ||
          'Student',
        date,
        questionsSolved: questions,
        timeSpentMins: minutes,
        proof_image_url: downloadURL,
        proof_storage_path: path,
        verified_by_teacher: false,
        submittedAt: Date.now()
      };

      await set(
        ref(db, `daily_study_logs/${existingKey}`),
        record
      );

      form.reset();

      if ($('studyDate')) {
        $('studyDate').value = localDate();
      }

      toast('Your study progress has been submitted.', 'success');

    } catch (error) {
      console.error('Study submission failed:', error);
      toast(
        error.message || 'Submission failed. Check your Firebase Storage and Database rules.',
        'error'
      );
    } finally {
      setBusy(button, false);
    }
  });
}

/* -------------------------------------------------------
   MODULE ENTRY POINT
------------------------------------------------------- */

export function initStudent(user) {
  if (!user) return;

  if (initialised && currentUser?.uid === user.uid) return;

  initialised = true;
  currentUser = user;

  try {
    initNotices();
    initClassChat();
    initDoubtChat();
    initTrackerForm();
    initTrackerHistory();
  } catch (error) {
    console.error('Student module startup failed:', error);
    toast('Some student features could not start.', 'error');
  }
        }
