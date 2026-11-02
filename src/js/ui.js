const ICON_PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  message: '<path d="M21 11.5a8.5 8.5 0 0 1-12.2 7.6L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  hash: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>',
  back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function safeColor(color) {
  return HEX_COLOR.test(color ?? '') ? color : '#1269ae';
}

export function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

export function logoMark() {
  return `<span class="brand-mark">${icon('sparkles', 18)}</span>`;
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function avatar(name, color, size = 'md', ring = false) {
  const initial = esc((name ?? '').trim().charAt(0).toLocaleUpperCase('tr-TR') || '?');
  const el = `<span class="avatar avatar--${size}" style="background:${safeColor(color)}" aria-hidden="true">${initial}</span>`;
  return ring ? `<span class="avatar-ring">${el}</span>` : el;
}

const relative = new Intl.RelativeTimeFormat('tr', { numeric: 'auto' });

export function formatRelative(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'şimdi';
  if (minutes < 60) return relative.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return relative.format(-hours, 'hour');
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export function formatTime(iso) {
  return new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function toast(message, tone = 'info') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    document.body.append(stack);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.textContent = message;
  stack.append(el);
  setTimeout(() => el.remove(), 3500);
}

export function setBusy(button, busy) {
  button.classList.toggle('is-busy', busy);
  button.disabled = busy;
}

export function byId(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

export function confirmDialog({ title, message, confirmLabel }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const { root, close } = openModal(
      title,
      `<p class="muted">${esc(message)}</p>
       <div class="modal-footer">
         <button class="btn btn--ghost" type="button" data-close>Vazgeç</button>
         <button class="btn btn--primary" type="button" data-confirm>${esc(confirmLabel)}</button>
       </div>`,
      () => finish(false),
    );
    root.querySelector('[data-confirm]').addEventListener('click', () => {
      finish(true);
      close();
    });
  });
}

export function openModal(title, bodyHtml, onClose) {
  const root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-header">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" type="button" data-close aria-label="Kapat">${icon('x', 18)}</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
    </div>`;

  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    root.remove();
    onClose?.();
  };

  root.addEventListener('click', (event) => {
    if (event.target === root || event.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(root);
  return { root, close };
}
