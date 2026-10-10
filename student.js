import { auth, db, storage } from './firebase-config.js';

import {
  ref,
  get,
  onValue,
  set,
  update,
  push
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js';

import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-storage.js';

import {
  $,
  currentUser as getCurrentUser,
  currentRole,
  currentProfile,
  escapeHTML,
  formatDate,
  getLocalDate,
  toArray,
  showToast
} from './app.js';

let initialized = false;
let announcementListener = null;
let chatListener = null;
let dailyLogListener = null;
let doubtListener = null;

let announcements = [];
let classMessages = [];
let currentDailyLog = null;
let currentDoubtMessages = [];

function user() {
  return auth.currentUser;
}

function todayLogPath() {
  return `daily_study_logs/${user().uid}_${getLocalDate()}`;
}

function renderAnnouncements() {
  const container = $('announcementFeed');

  $('noticeCount').textContent =
    `${announcements.length} announcement${announcements.length === 1 ? '' : 's'}`;

  if (!announcements.length) {
    container.innerHTML = '<div class="empty-state">No announcements yet. Check back later.</div>';
    return;
  }

  container.innerHTML = announcements.map(item => `
    <article class="notice-card ${item.priority === 'urgent' ? 'urgent' : ''}">
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <span class="badge ${item.priority === 'urgent' ? 'badge-red' : 'badge-purple'}">
          ${item.priority === 'urgent' ? 'URGENT' : 'ANNOUNCEMENT'}
        </span>
        <span class="muted text-xs">${escapeHTML(formatDate(item.createdAt))}</span>
      </div>

      <h3 class="font-bold text-lg">${escapeHTML(item.title || 'Announcement')}</h3>
      <p class="muted text-sm mt-2 whitespace-pre-wrap leading-6">${escapeHTML(item.message || '')}</p>

      ${item.attachmentURL
        ? `<a class="inline-block mt-4 text-sm" href="${escapeHTML(item.attachmentURL)}" target="_blank" rel="noopener noreferrer">Open attachment <i class="fa-solid fa-arrow-up-right-from-square ml-1"></i></a>`
        : ''}

      <p class="muted text-xs mt-4">Posted by ${escapeHTML(item.authorName || 'Teacher')}</p>
    </article>
  `).join('');

  renderHomeAnnouncements();
}

function renderHomeAnnouncements() {
  const container = $('homeAnnouncements');
  if (!container) return;

  if (!announcements.length) {
    container.innerHTML = '<div class="empty-state">No announcements yet.</div>';
    return;
  }

  container.innerHTML = announcements.slice(0, 3).map(item => `
    <article class="p-4 rounded-xl border ${item.priority === 'urgent' ? 'border-rose-900 bg-rose-950/20' : 'border-[#28344c] bg-[#0b1222]'}">
      <div class="flex items-center gap-2 mb-2">
        <span class="badge ${item.priority === 'urgent' ? 'badge-red' : 'badge-purple'}">
          ${item.priority === 'urgent' ? 'URGENT' : 'UPDATE'}
        </span>
        <span class="muted text-xs">${escapeHTML(formatDate(item.createdAt))}</span>
      </div>
      <h3 class="font-semibold">${escapeHTML(item.title || 'Announcement')}</h3>
      <p class="muted text-sm mt-2 whitespace-pre-wrap">${escapeHTML((item.message || '').slice(0, 180))}${(item.message || '').length > 180 ? '…' : ''}</p>
    </article>
  `).join('');
}

function renderProfile() {
  const profile = window.studySpaceProfile || {};

  $('profileName').value = profile.displayName || 'New Student';
  $('profileRoll').value = profile.rollNumber ?? 0;
  $('profileEmail').textContent = user()?.email || '—';
}

async function saveProfile(event) {
  event.preventDefault();

  const current = user();
  if (!current) return;

  const displayName = $('profileName').value.trim();
  const rollText = $('profileRoll').value.trim();
  const rollNumber = Number(rollText);

  if (!displayName || displayName.length > 70) {
    showToast('Enter a display name of 1–70 characters.', 'error');
    return;
  }

  if (!rollText || !Number.isInteger(rollNumber) || rollNumber < 0 || rollNumber > 999999) {
    showToast('Enter a valid non-negative roll number.', 'error');
    return;
  }

  const button = $('profileForm').querySelector('button[type="submit"]');
  button.disabled = true;

  try {
    await update(ref(db, `users/${current.uid}`), {
      displayName,
      rollNumber,
      email: current.email || ''
    });

    window.studySpaceProfile = {
      ...(window.studySpaceProfile || {}),
      displayName,
      rollNumber
    };

    document.dispatchEvent(new CustomEvent('studyspace:profile-updated', {
      detail: { displayName, rollNumber }
    }));

    showToast('Profile updated successfully.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to update your profile.', 'error');
  } finally {
    button.disabled = false;
  }
}

function renderDailyLog(log) {
  currentDailyLog = log || null;

  $('trackerToday').textContent = getLocalDate();
  $('trackerSummaryStatus').textContent = log ? 'Submitted' : 'Not submitted';
  $('trackerSummaryVerification').textContent = log?.verified_by_teacher
    ? 'Verified'
    : log
      ? 'Pending review'
      : 'Not submitted';

  $('statQuestions').textContent = log?.questionsSolved ?? 0;
  $('statMinutes').textContent = log?.timeSpent ?? 0;

  $('statVerified').innerHTML = log
    ? log.verified_by_teacher
      ? '<span class="badge badge-green"><i class="fa-solid fa-check"></i> Verified</span>'
      : '<span class="badge badge-gray">Pending review</span>'
    : '<span class="badge badge-gray">Not submitted</span>';

  $('trackerStatus').textContent = log
    ? 'A log already exists for today. Submitting again will replace it.'
    : '';
}

$('proofImage').addEventListener('change', () => {
  const file = $('proofImage').files[0];

  if (!file) {
    $('proofPreview').classList.add('hidden');
    return;
  }

  if (!file.type.startsWith('image/')) {
    $('proofImage').value = '';
    $('proofPreview').classList.add('hidden');
    showToast('Please choose an image file.', 'error');
    return;
  }

  const previousURL = $('proofPreviewImage').dataset.objectUrl;
  if (previousURL) URL.revokeObjectURL(previousURL);

  const objectURL = URL.createObjectURL(file);
  $('proofPreviewImage').src = objectURL;
  $('proofPreviewImage').dataset.objectUrl = objectURL;

  $('proofPreviewInfo').textContent =
    `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB before compression`;

  $('proofPreview').classList.remove('hidden');
});

async function submitDailyLog(event) {
  event.preventDefault();

  const current = user();
  if (!current) return;

  const questionsSolved = Number($('questionsSolved').value);
  const timeSpent = Number($('timeSpent').value);
  const file = $('proofImage').files[0];

  if (!Number.isInteger(questionsSolved) || questionsSolved < 0 || questionsSolved > 100000) {
    showToast('Enter a valid number of questions solved.', 'error');
    return;
  }

  if (!Number.isInteger(timeSpent) || timeSpent < 1 || timeSpent > 1440) {
    showToast('Study time must be between 1 and 1440 minutes.', 'error');
    return;
  }

  if (!file || !file.type.startsWith('image/')) {
    showToast('Please select a proof image.', 'error');
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    showToast('Choose an image smaller than 20 MB.', 'error');
    return;
  }

  if (!window.imageCompression) {
    showToast('Image compression library is unavailable. Refresh and try again.', 'error');
    return;
  }

  const button = $('trackerSubmit');
  button.disabled = true;

  try {
    $('trackerStatus').textContent = 'Compressing proof image...';
    button.textContent = 'Compressing...';

    const compressed = await window.imageCompression(file, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      initialQuality: 0.82
    });

    $('trackerStatus').textContent = 'Uploading proof image...';
    button.textContent = 'Uploading...';

    const date = getLocalDate();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    const path = `homework-proofs/${current.uid}/${date}_${Date.now()}_${safeName}`;

    const upload = await uploadBytes(storageRef(storage, path), compressed, {
      contentType: compressed.type || 'image/jpeg'
    });

    const proofURL = await getDownloadURL(upload.ref);

    const previousSnapshot = await get(ref(db, todayLogPath()));
    const previous = previousSnapshot.val();

    await set(ref(db, todayLogPath()), {
      uid: current.uid,
      studentName: window.studySpaceProfile?.displayName || 'New Student',
      rollNumber: window.studySpaceProfile?.rollNumber ?? 0,
      date,
      timestamp: Date.now(),
      questionsSolved,
      timeSpent,
      proof_image_url: proofURL,
      proof_storage_path: path,
      verified_by_teacher: false,
      previousSubmissionAt: previous?.timestamp || null
    });

    $('trackerForm').reset();
    $('proofPreview').classList.add('hidden');
    $('trackerStatus').textContent = 'Your daily log was submitted successfully.';

    showToast('Daily study log submitted.', 'success');
  } catch (error) {
    console.error(error);
    $('trackerStatus').textContent = error.message || 'Submission failed.';
    showToast(error.message || 'Unable to submit your study log.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Submit daily log';
  }
}

function renderClassChat() {
  const container = $('classChat');
  const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

  $('chatCount').textContent =
    `${classMessages.length} message${classMessages.length === 1 ? '' : 's'}`;

  if (!classMessages.length) {
    container.innerHTML = '<div class="empty-state">No messages yet. Start the conversation.</div>';
    return;
  }

  container.innerHTML = classMessages.slice(-300).map(message => {
    const mine = message.uid === user()?.uid;

    return `
      <div class="chat-bubble ${mine ? 'sender' : 'receiver'}">
        <div class="chat-meta">
          <span class="font-bold">${escapeHTML(message.displayName || 'Student')}</span>
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

async function sendClassMessage(event) {
  event.preventDefault();

  const current = user();
  if (!current) return;

  const input = $('classChatInput');
  const message = input.value.trim();

  if (!message) return;

  if (message.length > 1000) {
    showToast('Messages must be 1000 characters or fewer.', 'error');
    return;
  }

  const button = $('classChatSend');
  button.disabled = true;

  try {
    const messageRef = push(ref(db, 'class_chat'));

    await set(messageRef, {
      uid: current.uid,
      displayName: window.studySpaceProfile?.displayName || 'New Student',
      message: message.slice(0, 1000),
      timestamp: Date.now()
    });

    input.value = '';
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to send your message.', 'error');
  } finally {
    button.disabled = false;
  }
}

function renderStudentDoubts() {
  const container = $('studentDoubtChat');
  const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

  if (!currentDoubtMessages.length) {
    container.innerHTML = '<div class="empty-state">No messages yet. Send your first question below.</div>';
    return;
  }

  container.innerHTML = currentDoubtMessages.map(message => {
    const mine = message.senderUid === user()?.uid ||
      message.uid === user()?.uid ||
      message.senderRole === 'student';

    return `
      <div class="chat-bubble ${mine ? 'sender' : 'receiver'}">
        <div class="chat-meta">
          <span class="font-bold">${escapeHTML(message.displayName || (mine ? 'You' : 'Teacher'))}</span>
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

async function sendDoubt(event) {
  event.preventDefault();

  const current = user();
  if (!current) return;

  const input = $('studentDoubtInput');
  const message = input.value.trim();

  if (!message) return;

  const button = $('studentDoubtSend');
  button.disabled = true;

  try {
    const messageRef = push(ref(db, `direct_doubts/${current.uid}`));

    await set(messageRef, {
      uid: current.uid,
      senderUid: current.uid,
      senderRole: 'student',
      displayName: window.studySpaceProfile?.displayName || 'New Student',
      message: message.slice(0, 2000),
      timestamp: Date.now()
    });

    input.value = '';
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to send your doubt.', 'error');
  } finally {
    button.disabled = false;
  }
}

function bindStudentListeners() {
  const current = user();
  if (!current) return;

  if (announcementListener) announcementListener();
  if (chatListener) chatListener();
  if (dailyLogListener) dailyLogListener();
  if (doubtListener) doubtListener();

  announcementListener = onValue(ref(db, 'announcements'), snapshot => {
    announcements = toArray(snapshot.val()).sort(
      (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
    );

    renderAnnouncements();
  }, error => {
    console.error(error);
    showToast('Unable to load announcements.', 'error');
  });

  chatListener = onValue(ref(db, 'class_chat'), snapshot => {
    classMessages = toArray(snapshot.val()).sort(
      (a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0)
    );

    renderClassChat();
  }, error => {
    console.error(error);
    $('classChat').innerHTML =
      `<div class="empty-state">${escapeHTML(error.message)}</div>`;
  });

  dailyLogListener = onValue(ref(db, todayLogPath()), snapshot => {
    renderDailyLog(snapshot.val());
  }, error => {
    console.error(error);
    showToast('Unable to load today’s study log.', 'error');
  });

  doubtListener = onValue(ref(db, `direct_doubts/${current.uid}`), snapshot => {
    currentDoubtMessages = toArray(snapshot.val()).sort(
      (a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0)
    );

    renderStudentDoubts();
  }, error => {
    console.error(error);
    $('studentDoubtChat').innerHTML =
      `<div class="empty-state">${escapeHTML(error.message)}</div>`;
  });
}

export async function initializeStudent() {
  if (!user()) return;

  if (!initialized) {
    $('profileForm').addEventListener('submit', saveProfile);
    $('trackerForm').addEventListener('submit', submitDailyLog);
    $('classChatForm').addEventListener('submit', sendClassMessage);
    $('studentDoubtForm').addEventListener('submit', sendDoubt);
    initialized = true;
  }

  const snapshot = await get(ref(db, `users/${user().uid}`));

  window.studySpaceProfile = snapshot.val() || {
    displayName: 'New Student',
    rollNumber: 0
  };

  renderProfile();
  bindStudentListeners();
}

document.addEventListener('studyspace:logout', () => {
  if (announcementListener) announcementListener();
  if (chatListener) chatListener();
  if (dailyLogListener) dailyLogListener();
  if (doubtListener) doubtListener();

  announcementListener = null;
  chatListener = null;
  dailyLogListener = null;
  doubtListener = null;

  announcements = [];
  classMessages = [];
  currentDailyLog = null;
  currentDoubtMessages = [];
});
