import { supabase } from '@/js/supabase.js';
import { countUnreadNotifications, ensureProfile, fetchProfile, signOut, watch } from '@/js/data.js';
import { avatar, esc, icon, logoMark, toast } from '@/js/ui.js';
import { showAuth } from '@/js/auth-view.js';

const NAV = [
  { key: 'home', label: 'Akış', icon: 'home', href: '/' },
  { key: 'community', label: 'Topluluk', icon: 'users', href: '/community.html' },
  { key: 'messages', label: 'Mesajlar', icon: 'message', href: '/messages.html' },
  { key: 'profile', label: 'Profil', icon: 'user', href: '/profile.html' },
];

function renderNav(activeKey, profile) {
  const sideLinks = NAV.map(
    (item) => `
      <a class="side-link${item.key === activeKey ? ' is-active' : ''}" href="${item.href}" data-nav="${item.key}"${item.key === activeKey ? ' aria-current="page"' : ''}>
        ${icon(item.icon, 24)}<span class="label">${item.label}</span>
      </a>`,
  ).join('');
  const bottomLinks = NAV.map(
    (item) => `
      <a class="bottom-link${item.key === activeKey ? ' is-active' : ''}" href="${item.href}" data-nav="${item.key}"${item.key === activeKey ? ' aria-current="page"' : ''}>
        ${icon(item.icon, 22)}<span>${item.label}</span>
      </a>`,
  ).join('');

  document.getElementById('sidebar').innerHTML = `
    <div>
      <a class="brand" href="/" aria-label="Akım ana sayfa">${logoMark()}<span class="label">Akım</span></a>
      <nav class="side-nav" aria-label="Ana menü">${sideLinks}</nav>
    </div>
    <div class="side-footer">
      <a class="side-user" href="/profile.html" title="Profilim">
        ${avatar(profile.name, profile.color, 'sm')}
        <span class="side-name">${esc(profile.name)}</span>
      </a>
      <button class="icon-btn" type="button" data-signout aria-label="Çıkış yap" title="Çıkış yap">${icon('logout', 20)}</button>
    </div>`;

  document.getElementById('bottom-nav').innerHTML = bottomLinks;
}

export function setNavBadge(key, count) {
  document.querySelectorAll(`[data-nav="${key}"]`).forEach((link) => {
    link.querySelector('.nav-badge')?.remove();
    if (count > 0) {
      link.insertAdjacentHTML('beforeend', `<span class="nav-badge">${count > 99 ? '99+' : count}</span>`);
    }
  });
}

export async function refreshNotificationBadge(userId) {
  try {
    setNavBadge('community', await countUnreadNotifications(userId));
  } catch {
    setNavBadge('community', 0);
  }
}

function bindSignOut() {
  document.getElementById('app').addEventListener('click', async (event) => {
    if (!event.target.closest('[data-signout]')) return;
    try {
      await signOut();
      window.location.href = '/';
    } catch {
      toast('Çıkış yapılamadı. Tekrar dene.', 'error');
    }
  });
}

async function resolveProfile(user) {
  const existing = await fetchProfile(user.id);
  if (existing) return existing;
  const name = user.user_metadata?.name || user.email?.split('@')[0] || 'Kullanıcı';
  await ensureProfile(user.id, name);
  return fetchProfile(user.id);
}

export async function bootPage(activeKey, start) {
  const { data, error } = await supabase.auth.getSession();
  if (error) toast('Oturum bilgisi alınamadı.', 'error');

  const session = data?.session;
  if (!session) {
    showAuth(() => bootPage(activeKey, start));
    return;
  }

  const user = session.user;
  document.getElementById('auth-root').replaceChildren();
  document.getElementById('app').hidden = false;

  let profile;
  try {
    profile = await resolveProfile(user);
  } catch {
    document.getElementById('page').innerHTML = `<div class="state">Profilin yüklenemedi. Sayfayı yenileyip tekrar dene.</div>`;
    return;
  }
  if (!profile) {
    document.getElementById('page').innerHTML = `<div class="state">Profilin yüklenemedi. Sayfayı yenileyip tekrar dene.</div>`;
    return;
  }

  renderNav(activeKey, profile);
  bindSignOut();
  void refreshNotificationBadge(user.id);
  watch(`badge-${user.id}`, 'notifications', `user_id=eq.${user.id}`, () => refreshNotificationBadge(user.id));

  await start({ user, profile });
}
