// ============================================================
// MATH CLASS — REUSABLE UI COMPONENTS
// File: components.js
// Compatible with Firebase Modular SDK 10.5.0
// ============================================================

// ============================================================
// CONSTANTS
// ============================================================

export const COLORS = Object.freeze({
  primary: "#4F46E5",
  secondary: "#7C3AED",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  text: "#111827",
  muted: "#64748B",
  border: "#E2E8F0",
  success: "#15803D",
  warning: "#B45309",
  danger: "#B91C1C"
});

const STATUS_STYLES = Object.freeze({
  pending: {
    label: "Pending",
    color: "#92400E",
    background: "#FEF3C7"
  },
  submitted: {
    label: "Submitted",
    color: "#1D4ED8",
    background: "#DBEAFE"
  },
  "under-review": {
    label: "Under Review",
    color: "#6D28D9",
    background: "#EDE9FE"
  },
  assigned: {
    label: "Assigned",
    color: "#0369A1",
    background: "#E0F2FE"
  },
  approved: {
    label: "Approved",
    color: "#166534",
    background: "#DCFCE7"
  },
  verified: {
    label: "Verified",
    color: "#166534",
    background: "#DCFCE7"
  },
  rejected: {
    label: "Rejected",
    color: "#991B1B",
    background: "#FEE2E2"
  },
  resolved: {
    label: "Resolved",
    color: "#166534",
    background: "#DCFCE7"
  },
  completed: {
    label: "Completed",
    color: "#166534",
    background: "#DCFCE7"
  },
  active: {
    label: "Active",
    color: "#166534",
    background: "#DCFCE7"
  },
  inactive: {
    label: "Inactive",
    color: "#475569",
    background: "#E2E8F0"
  },
  cancelled: {
    label: "Cancelled",
    color: "#991B1B",
    background: "#FEE2E2"
  }
});

// ============================================================
// GENERAL HELPERS
// ============================================================

/**
 * Escape HTML special characters.
 *
 * Use this when inserting untrusted text into an HTML string.
 * Prefer textContent when creating DOM elements.
 */
export function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return replacements[character];
  });
}

/**
 * Convert supported date representations into a Date.
 *
 * Supports:
 * - Date objects
 * - Millisecond timestamps
 * - Date strings
 * - Firebase timestamp objects with a seconds property
 */
function normalizeDate(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value;
  }

  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      try {
        const result = value.toDate();

        return result instanceof Date &&
          !Number.isNaN(result.getTime())
          ? result
          : null;
      } catch {
        return null;
      }
    }

    if (typeof value.seconds === "number") {
      const result = new Date(value.seconds * 1000);

      return Number.isNaN(result.getTime())
        ? null
        : result;
    }

    return null;
  }

  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    value = `${value}T00:00:00`;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

/**
 * Format a date for the Indian locale.
 */
export function formatDate(value, options = {}) {
  const date = normalizeDate(value);

  if (!date) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      ...options
    }).format(date);
  } catch {
    return "—";
  }
}

/**
 * Format a date and time.
 */
export function formatDateTime(value) {
  const date = normalizeDate(value);

  if (!date) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  } catch {
    return "—";
  }
}

/**
 * Format a duration expressed in minutes.
 */
export function formatDuration(minutes = 0) {
  const parsed = Number(minutes);

  const total = Number.isFinite(parsed)
    ? Math.max(0, Math.floor(parsed))
    : 0;

  const hours = Math.floor(total / 60);
  const remainingMinutes = total % 60;

  if (hours === 0) {
    return `${remainingMinutes} min`;
  }

  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

/**
 * Format a number using Indian number grouping.
 */
export function formatNumber(value) {
  const parsed = Number(value);

  return new Intl.NumberFormat("en-IN").format(
    Number.isFinite(parsed) ? parsed : 0
  );
}

/**
 * Generate initials from a person's name.
 */
export function getInitials(name = "") {
  const initials = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("");

  return initials || "U";
}

/**
 * Produce a human-readable relative time.
 */
export function getRelativeTime(value) {
  const date = normalizeDate(value);

  if (!date) {
    return "";
  }

  const seconds = Math.round(
    (date.getTime() - Date.now()) / 1000
  );

  const intervals = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1]
  ];

  try {
    const formatter = new Intl.RelativeTimeFormat("en", {
      numeric: "auto"
    });

    for (const [unit, length] of intervals) {
      if (
        Math.abs(seconds) >= length ||
        unit === "second"
      ) {
        return formatter.format(
          Math.round(seconds / length),
          unit
        );
      }
    }
  } catch {
    return "";
  }

  return "";
}

// ============================================================
// COMPONENT STYLES
// ============================================================

let stylesAdded = false;

export function injectComponentStyles() {
  if (typeof document === "undefined") {
    return;
  }

  const existing = document.getElementById(
    "mathclass-component-styles"
  );

  if (existing) {
    stylesAdded = true;
    return;
  }

  if (stylesAdded) {
    return;
  }

  const style = document.createElement("style");

  style.id = "mathclass-component-styles";

  style.textContent = `
    .mc-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 11000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      overflow-y: auto;
      background: rgba(15, 23, 42, .52);
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
      animation: mcFadeIn .18s ease;
    }

    .mc-modal {
      width: 100%;
      max-width: 480px;
      max-height: min(85vh, 760px);
      overflow-y: auto;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 18px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, .2);
      animation: mcModalIn .22s ease;
    }

    .mc-modal-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 22px 24px;
      border-bottom: 1px solid #E2E8F0;
    }

    .mc-modal-heading {
      min-width: 0;
    }

    .mc-modal-title {
      margin: 0;
      color: #111827;
      font-size: 19px;
      font-weight: 700;
      letter-spacing: -.4px;
      overflow-wrap: anywhere;
    }

    .mc-modal-description {
      margin: 7px 0 0;
      color: #64748B;
      font-size: 14px;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }

    .mc-modal-close {
      flex: 0 0 auto;
      display: inline-grid;
      place-items: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 0;
      border-radius: 10px;
      background: #F1F5F9;
      color: #475569;
      font-size: 22px;
      cursor: pointer;
    }

    .mc-modal-close:hover {
      background: #E2E8F0;
    }

    .mc-modal-body {
      padding: 24px;
      color: #334155;
      font-size: 14px;
      line-height: 1.7;
      overflow-wrap: anywhere;
    }

    .mc-modal-footer {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 10px;
      padding: 18px 24px;
      border-top: 1px solid #E2E8F0;
    }

    .mc-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 44px;
      padding: 10px 16px;
      border: 1px solid transparent;
      border-radius: 10px;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition:
        background .18s ease,
        transform .18s ease;
    }

    .mc-button:focus-visible,
    .mc-modal-close:focus-visible {
      outline: 3px solid #A5B4FC;
      outline-offset: 3px;
    }

    .mc-button:active {
      transform: scale(.98);
    }

    .mc-button:disabled {
      opacity: .55;
      cursor: not-allowed;
      transform: none;
    }

    .mc-button-primary {
      background: #4F46E5;
      color: #FFFFFF;
    }

    .mc-button-primary:hover:not(:disabled) {
      background: #4338CA;
    }

    .mc-button-secondary {
      background: #FFFFFF;
      border-color: #CBD5E1;
      color: #334155;
    }

    .mc-button-secondary:hover:not(:disabled) {
      background: #F8FAFC;
    }

    .mc-button-danger {
      background: #DC2626;
      color: #FFFFFF;
    }

    .mc-button-danger:hover:not(:disabled) {
      background: #B91C1C;
    }

    .mc-empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 44px 22px;
      text-align: center;
      border: 1px dashed #CBD5E1;
      border-radius: 14px;
      background: #FFFFFF;
    }

    .mc-empty-icon {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      margin-bottom: 15px;
      border-radius: 15px;
      background: #EEF2FF;
      color: #4F46E5;
      font-size: 23px;
    }

    .mc-empty-title {
      margin: 0;
      color: #111827;
      font-size: 16px;
      font-weight: 700;
    }

    .mc-empty-description {
      max-width: 340px;
      margin: 8px 0 0;
      color: #64748B;
      font-size: 14px;
      line-height: 1.6;
    }

    .mc-empty-action {
      margin-top: 18px;
    }

    .mc-skeleton {
      position: relative;
      overflow: hidden;
      background: #E2E8F0;
      border-radius: 8px;
    }

    .mc-skeleton::after {
      position: absolute;
      inset: 0;
      content: "";
      transform: translateX(-100%);
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255,255,255,.7),
        transparent
      );
      animation: mcShimmer 1.4s infinite;
    }

    .mc-skeleton-line {
      height: 12px;
      margin-bottom: 12px;
    }

    .mc-skeleton-line:last-child {
      margin-bottom: 0;
    }

    .mc-skeleton-card {
      padding: 20px;
      border: 1px solid #E2E8F0;
      border-radius: 14px;
      background: #FFFFFF;
    }

    .mc-field-error {
      display: block;
      margin-top: 6px;
      color: #B91C1C;
      font-size: 12px;
      line-height: 1.5;
    }

    .mc-field-invalid {
      border-color: #DC2626 !important;
      outline-color: #FCA5A5 !important;
    }

    .mc-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 12px;
      line-height: 1.5;
      font-weight: 600;
      white-space: nowrap;
    }

    .mc-status-dot {
      width: 6px;
      height: 6px;
      flex: 0 0 6px;
      border-radius: 50%;
      background: currentColor;
    }

    @keyframes mcFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes mcModalIn {
      from {
        opacity: 0;
        transform: translateY(10px) scale(.99);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes mcShimmer {
      to { transform: translateX(100%); }
    }

    @media (max-width: 480px) {
      .mc-modal-backdrop {
        padding: 12px;
        align-items: center;
      }

      .mc-modal {
        max-height: 90vh;
        border-radius: 14px;
      }

      .mc-modal-header {
        padding: 18px;
      }

      .mc-modal-body {
        padding: 18px;
      }

      .mc-modal-footer {
        padding: 16px 18px;
      }

      .mc-modal-footer .mc-button {
        flex: 1 1 auto;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .mc-modal-backdrop,
      .mc-modal,
      .mc-skeleton::after {
        animation: none !important;
      }

      .mc-button {
        transition: none !important;
      }
    }
  `;

  document.head.appendChild(style);
  stylesAdded = true;
}

// ============================================================
// BUTTON COMPONENT
// ============================================================

export function createButton({
  label = "Button",
  variant = "primary",
  onClick = null,
  disabled = false,
  type = "button",
  className = "",
  title = "",
  ariaLabel = ""
} = {}) {
  const button = document.createElement("button");

  button.type = ["button", "submit", "reset"].includes(type)
    ? type
    : "button";

  const validVariants = [
    "primary",
    "secondary",
    "danger"
  ];

  const safeVariant = validVariants.includes(variant)
    ? variant
    : "secondary";

  button.className = [
    "mc-button",
    `mc-button-${safeVariant}`,
    String(className || "")
  ].filter(Boolean).join(" ");

  button.textContent = String(label);
  button.disabled = Boolean(disabled);

  if (title) {
    button.title = String(title);
  }

  if (ariaLabel) {
    button.setAttribute("aria-label", String(ariaLabel));
  }

  if (typeof onClick === "function") {
    button.addEventListener("click", async event => {
      if (button.disabled) {
        return;
      }

      try {
        await onClick(event);
      } catch (error) {
        console.error(
          "[Math Class] Button action failed:",
          error
        );
      }
    });
  }

  return button;
}

// ============================================================
// STATUS BADGE
// ============================================================

export function createStatusBadge(status = "pending") {
  injectComponentStyles();

  const normalizedStatus = String(status || "pending")
    .trim()
    .toLowerCase();

  const config = STATUS_STYLES[normalizedStatus] || {
    label: normalizedStatus
      ? normalizedStatus
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, letter => letter.toUpperCase())
      : "Unknown",
    color: "#475569",
    background: "#F1F5F9"
  };

  const badge = document.createElement("span");

  badge.className = "mc-status-badge";

  badge.style.color = config.color;
  badge.style.backgroundColor = config.background;

  const dot = document.createElement("span");

  dot.className = "mc-status-dot";
  dot.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");

  text.textContent = config.label;

  badge.append(dot, text);

  return badge;
}

// ============================================================
// MODAL COMPONENT
// ============================================================

export function openModal({
  title = "Dialog",
  description = "",
  content = "",
  actions = [],
  closeOnBackdrop = true,
  closeOnEscape = true,
  onClose = null
} = {}) {
  injectComponentStyles();

  const previousFocus = document.activeElement;

  const backdrop = document.createElement("div");

  backdrop.className = "mc-modal-backdrop";

  backdrop.setAttribute("role", "presentation");

  const modal = document.createElement("section");

  modal.className = "mc-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "mc-modal-title");

  const header = document.createElement("header");

  header.className = "mc-modal-header";

  const headingContainer = document.createElement("div");

  headingContainer.className = "mc-modal-heading";

  const heading = document.createElement("h2");

  heading.className = "mc-modal-title";
  heading.id = "mc-modal-title";
  heading.textContent = String(title);

  headingContainer.appendChild(heading);

  if (description) {
    const descriptionElement = document.createElement("p");

    descriptionElement.className = "mc-modal-description";
    descriptionElement.textContent = String(description);

    headingContainer.appendChild(descriptionElement);
  }

  const closeButton = document.createElement("button");

  closeButton.type = "button";
  closeButton.className = "mc-modal-close";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Close dialog");

  header.append(headingContainer, closeButton);

  const body = document.createElement("div");

  body.className = "mc-modal-body";

  if (content instanceof Node) {
    body.appendChild(content);
  } else if (content !== null && content !== undefined) {
    body.textContent = String(content);
  }

  modal.append(header, body);

  let footer = null;
  let isClosed = false;

  const previousBodyOverflow = document.body.style.overflow;

  function close() {
    if (isClosed) {
      return;
    }

    isClosed = true;

    backdrop.remove();
    document.removeEventListener("keydown", handleKeydown);

    document.body.style.overflow = previousBodyOverflow;

    if (
      previousFocus instanceof HTMLElement &&
      previousFocus.isConnected
    ) {
      previousFocus.focus();
    }

    if (typeof onClose === "function") {
      try {
        onClose();
      } catch (error) {
        console.error(
          "[Math Class] Modal close handler failed:",
          error
        );
      }
    }
  }

  function setContent(value) {
    body.replaceChildren();

    if (value instanceof Node) {
      body.appendChild(value);
    } else if (value !== null && value !== undefined) {
      body.textContent = String(value);
    }
  }

  if (Array.isArray(actions) && actions.length > 0) {
    footer = document.createElement("footer");

    footer.className = "mc-modal-footer";

    actions.forEach(action => {
      if (!action || typeof action !== "object") {
        return;
      }

      const button = createButton({
        label: action.label || "Continue",
        variant: action.variant || "secondary",
        disabled: Boolean(action.disabled)
      });

      button.addEventListener("click", async event => {
        if (button.disabled || isClosed) {
          return;
        }

        button.disabled = true;

        try {
          if (typeof action.onClick === "function") {
            await action.onClick(event, {
              close,
              modal,
              body,
              setContent
            });
          }

          if (action.closeOnClick !== false) {
            close();
          }
        } catch (error) {
          console.error(
            "[Math Class] Modal action failed:",
            error
          );

          // Keep the modal open so the user can retry.
        } finally {
          if (button.isConnected && !isClosed) {
            button.disabled = false;
          }
        }
      });

      footer.appendChild(button);
    });

    if (footer.childElementCount > 0) {
      modal.appendChild(footer);
    }
  }

  backdrop.appendChild(modal);

  function handleKeydown(event) {
    if (isClosed) {
      return;
    }

    if (event.key === "Escape" && closeOnEscape) {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = [
      ...modal.querySelectorAll(
        'button:not(:disabled), ' +
        'a[href], ' +
        'input:not(:disabled), ' +
        'select:not(:disabled), ' +
        'textarea:not(:disabled), ' +
        '[tabindex]:not([tabindex="-1"])'
      )
    ].filter(element => {
      return (
        !element.hidden &&
        element.getAttribute("aria-hidden") !== "true"
      );
    });

    if (focusable.length === 0) {
      event.preventDefault();

      modal.tabIndex = -1;
      modal.focus();

      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (
      event.shiftKey &&
      document.activeElement === first
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === last
    ) {
      event.preventDefault();
      first.focus();
    }
  }

  closeButton.addEventListener("click", close);

  backdrop.addEventListener("click", event => {
    if (
      closeOnBackdrop &&
      event.target === backdrop
    ) {
      close();
    }
  });

  document.addEventListener("keydown", handleKeydown);

  document.body.style.overflow = "hidden";
  document.body.appendChild(backdrop);

  closeButton.focus();

  return {
    element: backdrop,
    modal,
    body,
    close,
    setContent
  };
}

// ============================================================
// CONFIRMATION DIALOG
// ============================================================

export function confirmDialog({
  title = "Are you sure?",
  message = "This action cannot be undone.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false
} = {}) {
  return new Promise(resolve => {
    let settled = false;

    function finish(value) {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    }

    openModal({
      title,
      description: message,
      closeOnBackdrop: false,
      closeOnEscape: true,

      onClose: () => {
        finish(false);
      },

      actions: [
        {
          label: cancelLabel,
          variant: "secondary",
          onClick: () => {
            finish(false);
          }
        },
        {
          label: confirmLabel,
          variant: danger ? "danger" : "primary",
          onClick: () => {
            finish(true);
          }
        }
      ]
    });
  });
}

// ============================================================
// EMPTY STATE
// ============================================================

export function createEmptyState({
  icon = "✦",
  title = "Nothing here yet",
  description = "Your information will appear here when available.",
  actionLabel = "",
  onAction = null
} = {}) {
  injectComponentStyles();

  const container = document.createElement("div");

  container.className = "mc-empty-state";

  const iconElement = document.createElement("div");

  iconElement.className = "mc-empty-icon";
  iconElement.setAttribute("aria-hidden", "true");
  iconElement.textContent = String(icon);

  const heading = document.createElement("h3");

  heading.className = "mc-empty-title";
  heading.textContent = String(title);

  const paragraph = document.createElement("p");

  paragraph.className = "mc-empty-description";
  paragraph.textContent = String(description);

  container.append(iconElement, heading, paragraph);

  if (
    actionLabel &&
    typeof onAction === "function"
  ) {
    const action = createButton({
      label: actionLabel,
      variant: "primary",
      onClick: onAction,
      className: "mc-empty-action"
    });

    container.appendChild(action);
  }

  return container;
}

// ============================================================
// LOADING SKELETON
// ============================================================

export function createSkeleton({
  lines = 3,
  card = false,
  width = "100%"
} = {}) {
  injectComponentStyles();

  const container = document.createElement("div");

  if (card) {
    container.className = "mc-skeleton-card";
  }

  container.setAttribute("aria-busy", "true");
  container.setAttribute("aria-label", "Loading content");

  const requestedLines = Number(lines);

  const count = Number.isFinite(requestedLines)
    ? Math.min(20, Math.max(1, Math.floor(requestedLines)))
    : 3;

  const safeWidth =
    typeof width === "string" &&
    /^(100%|[0-9]+(?:\.[0-9]+)?(?:%|px|rem))$/.test(width)
      ? width
      : "100%";

  for (let index = 0; index < count; index++) {
    const line = document.createElement("div");

    line.className = "mc-skeleton mc-skeleton-line";

    line.style.width =
      index === count - 1 && count > 1
        ? "65%"
        : safeWidth;

    container.appendChild(line);
  }

  return container;
}

// ============================================================
// FORM FIELD VALIDATION
// ============================================================

export function setFieldError(field, message = "") {
  if (
    typeof HTMLElement === "undefined" ||
    !(field instanceof HTMLElement)
  ) {
    return;
  }

  injectComponentStyles();

  const fieldId = field.id || field.name;

  if (!fieldId) {
    field.setAttribute(
      "aria-invalid",
      String(Boolean(message))
    );

    return;
  }

  const errorId =
    `mc-error-${fieldId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  let errorElement = document.getElementById(errorId);

  if (!message) {
    errorElement?.remove();

    field.classList.remove("mc-field-invalid");
    field.removeAttribute("aria-invalid");

    const existingDescription =
      field.getAttribute("aria-describedby");

    if (existingDescription) {
      const remaining = existingDescription
        .split(/\s+/)
        .filter(id => id && id !== errorId);

      if (remaining.length > 0) {
        field.setAttribute(
          "aria-describedby",
          remaining.join(" ")
        );
      } else {
        field.removeAttribute("aria-describedby");
      }
    }

    return;
  }

  if (!errorElement) {
    errorElement = document.createElement("span");

    errorElement.id = errorId;
    errorElement.className = "mc-field-error";

    field.insertAdjacentElement(
      "afterend",
      errorElement
    );
  }

  errorElement.textContent = String(message);

  field.classList.add("mc-field-invalid");
  field.setAttribute("aria-invalid", "true");

  const describedBy = new Set(
    (field.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .filter(Boolean)
  );

  describedBy.add(errorId);

  field.setAttribute(
    "aria-describedby",
    [...describedBy].join(" ")
  );
}

// ============================================================
// REQUIRED-FIELD VALIDATION
// ============================================================

export function validateRequired(fields = []) {
  if (!Array.isArray(fields)) {
    return false;
  }

  let firstInvalid = null;
  let valid = true;

  fields.forEach(({ field, label = "This field" } = {}) => {
    if (
      typeof HTMLInputElement === "undefined" ||
      !(
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      )
    ) {
      return;
    }

    // A disabled or hidden optional field should not fail
    // ordinary required-field validation.
    if (field.disabled || field.type === "hidden") {
      return;
    }

    if (
      field instanceof HTMLInputElement &&
      field.type === "checkbox"
    ) {
      if (!field.checked) {
        setFieldError(field, `${label} is required.`);

        valid = false;

        if (!firstInvalid) {
          firstInvalid = field;
        }
      } else {
        setFieldError(field, "");
      }

      return;
    }

    const value = String(field.value || "").trim();

    if (!value) {
      setFieldError(field, `${label} is required.`);

      valid = false;

      if (!firstInvalid) {
        firstInvalid = field;
      }
    } else {
      setFieldError(field, "");
    }
  });

  if (firstInvalid) {
    firstInvalid.focus();
  }

  return valid;
}

// ============================================================
// EMAIL VALIDATION
// ============================================================

export function validateEmail(field) {
  if (
    typeof HTMLInputElement === "undefined" ||
    !(field instanceof HTMLInputElement)
  ) {
    return false;
  }

  const email = String(field.value || "").trim();

  if (!email) {
    setFieldError(field, "Email address is required.");

    return false;
  }

  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!pattern.test(email)) {
    setFieldError(field, "Enter a valid email address.");

    return false;
  }

  setFieldError(field, "");

  return true;
}

// ============================================================
// INDIAN MOBILE NUMBER VALIDATION
// ============================================================

export function validateIndianMobile(field) {
  if (
    typeof HTMLInputElement === "undefined" ||
    !(field instanceof HTMLInputElement)
  ) {
    return false;
  }

  const mobile = String(field.value || "")
    .replace(/\D/g, "");

  if (!/^[6-9]\d{9}$/.test(mobile)) {
    setFieldError(
      field,
      "Enter a valid 10-digit mobile number."
    );

    return false;
  }

  setFieldError(field, "");

  return true;
}

// ============================================================
// FILE VALIDATION
// ============================================================

export function validateFileSize(
  file,
  maxSizeMB = 5,
  allowedTypes = []
) {
  if (!file) {
    return {
      valid: false,
      message: "Please select a file."
    };
  }

  const maxSize = Number(maxSizeMB);

  if (
    !Number.isFinite(maxSize) ||
    maxSize <= 0
  ) {
    return {
      valid: false,
      message: "The file size limit is invalid."
    };
  }

  const maxBytes = maxSize * 1024 * 1024;

  if (file.size > maxBytes) {
    return {
      valid: false,
      message: `File must be no larger than ${maxSizeMB} MB.`
    };
  }

  if (
    Array.isArray(allowedTypes) &&
    allowedTypes.length > 0 &&
    !allowedTypes.includes(file.type)
  ) {
    return {
      valid: false,
      message:
        `Allowed file types: ${allowedTypes.join(", ")}.`
    };
  }

  return {
    valid: true,
    message: ""
  };
}

// ============================================================
// SAFE EXTERNAL LINK
// ============================================================

export function createExternalLink(url, label = "Open link") {
  const link = document.createElement("a");

  link.textContent = String(label);

  try {
    const parsed = new URL(
      String(url),
      window.location.origin
    );

    if (
      !["https:", "http:"].includes(parsed.protocol)
    ) {
      throw new Error("Unsupported URL protocol.");
    }

    link.href = parsed.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } catch {
    link.removeAttribute("href");
    link.removeAttribute("target");

    link.setAttribute("aria-disabled", "true");
    link.title = "This link is invalid.";
  }

  return link;
}

// ============================================================
// INITIALIZE STYLES
// ============================================================

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      injectComponentStyles,
      { once: true }
    );
  } else {
    injectComponentStyles();
  }
}
