// ============================================================
// MATH CLASS — REUSABLE UI COMPONENTS
// File: components.js
// ============================================================

const COLORS = {
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
};

const STATUS_STYLES = {
  pending: { label: "Pending", color: "#92400E", background: "#FEF3C7" },
  submitted: { label: "Submitted", color: "#1D4ED8", background: "#DBEAFE" },
  "under-review": { label: "Under Review", color: "#6D28D9", background: "#EDE9FE" },
  assigned: { label: "Assigned", color: "#0369A1", background: "#E0F2FE" },
  approved: { label: "Approved", color: "#166534", background: "#DCFCE7" },
  verified: { label: "Verified", color: "#166534", background: "#DCFCE7" },
  rejected: { label: "Rejected", color: "#991B1B", background: "#FEE2E2" },
  resolved: { label: "Resolved", color: "#166534", background: "#DCFCE7" },
  completed: { label: "Completed", color: "#166534", background: "#DCFCE7" },
  active: { label: "Active", color: "#166534", background: "#DCFCE7" },
  inactive: { label: "Inactive", color: "#475569", background: "#E2E8F0" },
  cancelled: { label: "Cancelled", color: "#991B1B", background: "#FEE2E2" }
};

// ============================================================
// GENERAL HELPERS
// ============================================================

export function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

export function formatDate(value, options = {}) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  let date;

  if (typeof value === "number") {
    date = new Date(value);
  } else if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    date = new Date(`${value}T00:00:00`);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options
  }).format(date);
}

export function formatDateTime(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function formatDuration(minutes = 0) {
  const total = Math.max(0, Math.floor(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const remainingMinutes = total % 60;

  if (hours === 0) return `${remainingMinutes} min`;

  if (remainingMinutes === 0) return `${hours} hr`;

  return `${hours} hr ${remainingMinutes} min`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-IN").format(
    Number(value) || 0
  );
}

export function getInitials(name = "") {
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("") || "U";
}

export function getRelativeTime(value) {
  const date = new Date(value);
  const timestamp = date.getTime();

  if (Number.isNaN(timestamp)) return "";

  const seconds = Math.round((timestamp - Date.now()) / 1000);

  const formatter = new Intl.RelativeTimeFormat("en", {
    numeric: "auto"
  });

  const intervals = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1]
  ];

  for (const [unit, length] of intervals) {
    if (Math.abs(seconds) >= length || unit === "second") {
      return formatter.format(Math.round(seconds / length), unit);
    }
  }

  return "";
}

// ============================================================
// DYNAMIC COMPONENT STYLES
// ============================================================

let stylesAdded = false;

export function injectComponentStyles() {
  if (stylesAdded || document.getElementById("mathclass-component-styles")) {
    stylesAdded = true;
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
      background: rgba(15, 23, 42, .48);
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
      animation: mcFadeIn .18s ease;
    }

    .mc-modal {
      width: 100%;
      max-width: 480px;
      max-height: min(85vh, 760px);
      overflow: auto;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 18px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, .2);
      animation: mcModalIn .22s ease;
    }

    .mc-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding: 22px 24px;
      border-bottom: 1px solid #E2E8F0;
    }

    .mc-modal-title {
      margin: 0;
      color: #111827;
      font-size: 19px;
      font-weight: 700;
      letter-spacing: -.4px;
    }

    .mc-modal-description {
      margin: 7px 0 0;
      color: #64748B;
      font-size: 14px;
      line-height: 1.6;
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
      transition: background .18s ease, transform .18s ease;
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
      from { opacity: 0; transform: translateY(10px) scale(.99); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes mcShimmer {
      100% { transform: translateX(100%); }
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

    @media (max-width: 480px) {
      .mc-modal-backdrop {
        align-items: flex-end;
        padding: 0;
      }

      .mc-modal {
        max-height: 90vh;
        border-radius: 20px 20px 0 0;
      }

      .mc-modal-header,
      .mc-modal-body {
        padding: 20px;
      }

      .mc-modal-footer {
        padding: 16px 20px;
      }

      .mc-modal-footer .mc-button {
        flex: 1;
      }
    }
  `;

  document.head.appendChild(style);
  stylesAdded = true;
}

// ============================================================
// BUTTON FACTORY
// ============================================================

export function createButton({
  label = "Continue",
  variant = "primary",
  type = "button",
  disabled = false,
  onClick = null,
  className = "",
  ariaLabel = ""
} = {}) {
  const button = document.createElement("button");

  button.type = type;
  button.textContent = label;
  button.disabled = disabled;
  button.className =
    `mc-button mc-button-${variant} ${className}`.trim();

  if (ariaLabel) {
    button.setAttribute("aria-label", ariaLabel);
  }

  if (typeof onClick === "function") {
    button.addEventListener("click", onClick);
  }

  injectComponentStyles();

  return button;
}

// ============================================================
// STATUS BADGE
// ============================================================

export function createStatusBadge(status = "pending") {
  injectComponentStyles();

  const key = String(status)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");

  const config = STATUS_STYLES[key] || {
    label: String(status || "Unknown"),
    color: "#475569",
    background: "#F1F5F9"
  };

  const badge = document.createElement("span");
  badge.className = "mc-status-badge";
  badge.style.color = config.color;
  badge.style.background = config.background;

  const dot = document.createElement("span");
  dot.className = "mc-status-dot";
  dot.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.textContent = config.label;

  badge.append(dot, label);
  badge.setAttribute("aria-label", `Status: ${config.label}`);

  return badge;
}

// ============================================================
// MODAL
// ============================================================

export function openModal({
  title = "Details",
  description = "",
  content = "",
  contentElement = null,
  actions = [],
  closeOnBackdrop = true,
  closeOnEscape = true,
  maxWidth = "480px",
  onClose = null
} = {}) {
  injectComponentStyles();

  const previousFocus = document.activeElement;

  const backdrop = document.createElement("div");
  backdrop.className = "mc-modal-backdrop";
  backdrop.setAttribute("data-mc-modal", "");
  backdrop.setAttribute("role", "presentation");

  const modal = document.createElement("section");
  modal.className = "mc-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "mcModalTitle");
  modal.style.maxWidth = maxWidth;

  const header = document.createElement("header");
  header.className = "mc-modal-header";

  const headingGroup = document.createElement("div");

  const heading = document.createElement("h2");
  heading.className = "mc-modal-title";
  heading.id = "mcModalTitle";
  heading.textContent = title;

  headingGroup.appendChild(heading);

  if (description) {
    const descriptionElement = document.createElement("p");
    descriptionElement.className = "mc-modal-description";
    descriptionElement.textContent = description;
    headingGroup.appendChild(descriptionElement);
  }

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "mc-modal-close";
  closeButton.setAttribute("aria-label", "Close dialog");
  closeButton.innerHTML = "&times;";

  header.append(headingGroup, closeButton);

  const body = document.createElement("div");
  body.className = "mc-modal-body";

  if (contentElement instanceof Node) {
    body.appendChild(contentElement);
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else {
    // Plain strings are rendered as text, not executable HTML.
    body.textContent = String(content);
  }

  modal.append(header, body);

  let footer = null;

  if (actions.length) {
    footer = document.createElement("footer");
    footer.className = "mc-modal-footer";

    actions.forEach(action => {
      const button = createButton({
        label: action.label || "Continue",
        variant: action.variant || "secondary",
        disabled: Boolean(action.disabled),
        onClick: async event => {
          if (typeof action.onClick !== "function") {
            if (action.closeOnClick !== false) close();
            return;
          }

          try {
            button.disabled = true;
            await action.onClick(event, { close, modal, body });

            if (action.closeOnClick !== false) close();
          } catch (error) {
            console.error("[Math Class] Modal action failed:", error);
          } finally {
            if (button.isConnected) button.disabled = false;
          }
        }
      });

      footer.appendChild(button);
    });

    modal.appendChild(footer);
  }

  backdrop.appendChild(modal);

  let isClosed = false;

  function close() {
    if (isClosed) return;

    isClosed = true;
    backdrop.remove();
    document.removeEventListener("keydown", handleKeydown);

    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus();
    }

    if (typeof onClose === "function") {
      onClose();
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && closeOnEscape) {
      close();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = [
      ...modal.querySelectorAll(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )
    ].filter(element => !element.hidden);

    if (!focusable.length) {
      event.preventDefault();
      modal.tabIndex = -1;
      modal.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
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
    if (closeOnBackdrop && event.target === backdrop) {
      close();
    }
  });

  document.addEventListener("keydown", handleKeydown);
  document.body.appendChild(backdrop);
  closeButton.focus();

  return {
    element: backdrop,
    modal,
    body,
    close,
    setContent(value) {
      body.replaceChildren();

      if (value instanceof Node) {
        body.appendChild(value);
      } else {
        body.textContent = String(value ?? "");
      }
    }
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

    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const modal = openModal({
      title,
      description: message,
      closeOnBackdrop: false,
      onClose: () => finish(false),
      actions: [
        {
          label: cancelLabel,
          variant: "secondary",
          onClick: () => finish(false)
        },
        {
          label: confirmLabel,
          variant: danger ? "danger" : "primary",
          onClick: () => finish(true)
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
  iconElement.textContent = icon;

  const heading = document.createElement("h3");
  heading.className = "mc-empty-title";
  heading.textContent = title;

  const paragraph = document.createElement("p");
  paragraph.className = "mc-empty-description";
  paragraph.textContent = description;

  container.append(iconElement, heading, paragraph);

  if (actionLabel && typeof onAction === "function") {
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

  for (let index = 0; index < Math.max(1, lines); index++) {
    const line = document.createElement("div");

    line.className = "mc-skeleton mc-skeleton-line";

    line.style.width = index === lines - 1 && lines > 1
      ? "65%"
      : width;

    container.appendChild(line);
  }

  return container;
}

// ============================================================
// FORM VALIDATION
// ============================================================

export function setFieldError(field, message = "") {
  if (!(field instanceof HTMLElement)) return;

  injectComponentStyles();

  const fieldId = field.id || field.name;

  if (!fieldId) {
    field.setAttribute("aria-invalid", String(Boolean(message)));
    return;
  }

  const errorId = `mc-error-${fieldId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  let errorElement = document.getElementById(errorId);

  if (!message) {
    errorElement?.remove();
    field.classList.remove("mc-field-invalid");
    field.removeAttribute("aria-invalid");
    field.removeAttribute("aria-describedby");
    return;
  }

  if (!errorElement) {
    errorElement = document.createElement("span");
    errorElement.id = errorId;
    errorElement.className = "mc-field-error";
    field.insertAdjacentElement("afterend", errorElement);
  }

  errorElement.textContent = message;
  field.classList.add("mc-field-invalid");
  field.setAttribute("aria-invalid", "true");
  field.setAttribute("aria-describedby", errorId);
}

export function validateRequired(fields = []) {
  let firstInvalid = null;
  let valid = true;

  fields.forEach(({ field, label = "This field" }) => {
    if (!(field instanceof HTMLInputElement ||
          field instanceof HTMLSelectElement ||
          field instanceof HTMLTextAreaElement)) {
      return;
    }

    const value = String(field.value || "").trim();

    if (!value) {
      setFieldError(field, `${label} is required.`);
      valid = false;

      if (!firstInvalid) firstInvalid = field;
    } else {
      setFieldError(field, "");
    }
  });

  if (firstInvalid) firstInvalid.focus();

  return valid;
}

export function validateEmail(field) {
  const email = String(field?.value || "").trim();

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

export function validateIndianMobile(field) {
  const mobile = String(field?.value || "").replace(/\D/g, "");

  if (!/^[6-9]\d{9}$/.test(mobile)) {
    setFieldError(field, "Enter a valid 10-digit mobile number.");
    return false;
  }

  setFieldError(field, "");
  return true;
}

// ============================================================
// FILE SIZE VALIDATION
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

  const maxBytes = maxSizeMB * 1024 * 1024;

  if (file.size > maxBytes) {
    return {
      valid: false,
      message: `File must be smaller than ${maxSizeMB} MB.`
    };
  }

  if (
    allowedTypes.length &&
    !allowedTypes.includes(file.type)
  ) {
    return {
      valid: false,
      message: `Allowed file types: ${allowedTypes.join(", ")}.`
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

export function createExternalLink(url, label) {
  const link = document.createElement("a");

  try {
    const parsed = new URL(url, window.location.origin);

    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new Error("Unsupported link protocol.");
    }

    link.href = parsed.href;
  } catch {
    link.href = "#";
    link.setAttribute("aria-disabled", "true");
  }

  link.textContent = label || "Open link";
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  return link;
}

// ============================================================
// INITIALIZE COMPONENT STYLES
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
