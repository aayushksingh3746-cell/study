import { db } from './firebase-config.js';

import {
  ref,
  get,
  update,
  remove,
  onValue,
  query,
  limitToLast
} from 'https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js';

let initialised = false;
let currentUser = null;
let chatListenerStarted = false;

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

/* -------------------------------------------------------
   ADMIN ROLE FORM
------------------------------------------------------- */

function initRoleForm() {
  const form = $('roleForm');

  if (!form || form.dataset.initialised === 'true') return;

  form.dataset.initialised = 'true';

  form.addEventListener('submit', async event => {
    event.preventDefault();

    if (!currentUser) return;

    const email = $('roleEmail')?.value.trim().toLowerCase();
    const button = $('assignTeacherButton');

    if (!email) {
      toast('Enter the registered email address.', 'error');
      return;
    }

    setBusy(button, true, 'Searching...');

    try {
      /*
       * Firebase client SDK cannot enumerate Firebase Authentication
       * accounts by email. This searches the Realtime Database users
       * collection for a matching email instead.
       *
       * The current database rules must allow the administrator to read
       * the users collection and update the selected user's role.
       */

      const snapshot = await get(ref(db, 'users'));

      if (!snapshot.exists()) {
        toast('No user profiles were found.', 'error');
        return;
      }

      let matchedUID = null;
      let matchedProfile = null;

      snapshot.forEach(child => {
        const profile = child.val() || '';

        if (
          profile &&
          typeof profile === 'object' &&
          String(profile.email || '').trim().toLowerCase() === email
        ) {
          matchedUID = child.key;
          matchedProfile = profile;
        }
      });

      if (!matchedUID || !matchedProfile) {
        toast(
          'No matching registered profile was found. Ask the user to sign in and create their profile first.',
          'error'
        );
        return;
      }

      if (matchedUID === currentUser.uid) {
        toast('You cannot change your own administrator role here.', 'error');
        return;
      }

      if (matchedProfile.role === 'admin') {
        toast('This user already has the administrator role.', 'error');
        return;
      }

      await update(ref(db, `users/${matchedUID}`), {
        role: 'teacher',
        roleUpdatedAt: Date.now(),
        roleUpdatedBy: currentUser.uid
      });

      form.reset();

      toast(
        `Teacher role assigned to ${matchedProfile.displayName || email}.`,
        'success'
      );

    } catch (error) {
      console.error('Role assignment failed:', error);

      toast(
        'Could not assign the role. Check that your administrator database rules allow this operation.',
        'error'
      );
    } finally {
      setBusy(button, false);
    }
  });
}

/* -------------------------------------------------------
   CLASS CHAT MODERATION
------------------------------------------------------- */

function initChatModeration() {
  if (chatListenerStarted) return;

  chatListenerStarted = true;

  const container = $('adminChatMessages');
  if (!container) return;

  container.innerHTML =
    '<p class="muted text-sm">Loading class chat...</p>';

  onValue(
    query(ref(db, 'class_chat'), limitToLast(150)),

    snapshot => {
      if (!snapshot.exists()) {
        container.innerHTML =
          '<p class="muted text-sm">There are no class messages to moderate.</p>';
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
        Number(b.timestamp || 0) - Number(a.timestamp || 0)
      );

      container.innerHTML = messages.map(message => `
        <article class="rounded-xl border border-slate-700/50 bg-slate-950/30 p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-semibold">
                ${escapeHTML(message.displayName || 'Class member')}
              </p>

              <p class="muted text-xs mt-1">
                ${escapeHTML(formatTime(message.timestamp))}
              </p>
            </div>

            <button type="button"
                    class="secondary-btn text-xs text-rose-300"
                    data-delete-message="${escapeHTML(message.id)}">
              <i class="fa-regular fa-trash-can mr-1"></i>
              Delete
            </button>
          </div>

          <p class="text-sm mt-3 whitespace-pre-wrap break-words">${
            escapeHTML(message.text || '')
          }</p>
        </article>
      `).join('');
    },

    error => {
      console.error('Chat moderation listener failed:', error);

      container.innerHTML = `
        <div class="content-card">
          <p class="text-rose-300">Unable to load class chat.</p>
          <p class="muted text-sm mt-2">
            Check the Realtime Database rules for administrator access.
          </p>
        </div>
      `;
    }
  );

  if (!container.dataset.initialised) {
    container.dataset.initialised = 'true';

    container.addEventListener('click', async event => {
      const button = event.target.closest('[data-delete-message]');

      if (!button) return;

      const messageID = button.dataset.deleteMessage;

      if (!messageID) return;

      const confirmed = window.confirm(
        'Are you sure you want to permanently delete this class chat message?'
      );

      if (!confirmed) return;

      setBusy(button, true, 'Deleting...');

      try {
        await remove(ref(db, `class_chat/${messageID}`));

        toast('Chat message deleted.', 'success');

      } catch (error) {
        console.error('Chat message deletion failed:', error);

        toast(
          'Message could not be deleted. Check your Firebase administrator permissions.',
          'error'
        );
      } finally {
        setBusy(button, false);
      }
    });
  }
}

/* -------------------------------------------------------
   MODULE ENTRY POINT
------------------------------------------------------- */

export function initAdmin(user) {
  if (!user) return;

  if (initialised && currentUser?.uid === user.uid) return;

  initialised = true;
  currentUser = user;

  try {
    initRoleForm();
    initChatModeration();
  } catch (error) {
    console.error('Admin module startup failed:', error);
    toast('Some administrator features could not start.', 'error');
  }
}
