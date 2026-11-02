import { bootPage } from '@/js/shell.js';
import {
  PROFILE_COLORS,
  fetchFollows,
  fetchPosts,
  fetchProfile,
  followUser,
  unfollowUser,
  updateProfile,
} from '@/js/data.js';
import { openDm } from '@/js/chat.js';
import { fetchFriendships, friendAction, friendStatus } from '@/js/friends.js';
import { bindPostDeletes, postListHtml } from '@/js/posts.js';
import { avatar, esc, icon, openModal, safeColor, setBusy, toast } from '@/js/ui.js';

bootPage('profile', renderProfile);

function renderProfile({ user }) {
  const page = document.getElementById('page');
  const targetId = new URLSearchParams(window.location.search).get('id') || user.id;
  const isOwn = targetId === user.id;

  page.innerHTML = `
    <header class="page-header"><h1>${isOwn ? 'Profilim' : 'Profil'}</h1></header>
    <div id="profile-view"><div class="state">Yükleniyor…</div></div>`;

  const view = page.querySelector('#profile-view');
  let current = null;

  const load = async () => {
    try {
      const [target, posts, follows, friendships] = await Promise.all([
        fetchProfile(targetId),
        fetchPosts(targetId),
        fetchFollows(),
        fetchFriendships(),
      ]);
      if (!target) {
        view.innerHTML = `<div class="state">Bu profil bulunamadı.</div>`;
        return;
      }
      current = { target, posts, follows, friendships };
      view.innerHTML = profileHtml({ target, posts, follows, friendships, isOwn, viewerId: user.id });
    } catch {
      view.innerHTML = `<div class="state">Profil yüklenemedi. <button class="btn btn--ghost btn--sm" type="button" data-action="retry">Tekrar dene</button></div>`;
    }
  };

  view.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    if (action === 'retry') return void load();
    if (action === 'edit') return openEditModal(current.target);
    if (action === 'follow') return toggleFollow(button, targetId, user.id, load);
    if (action === 'message') return startMessage(button, targetId);
    if (action === 'friend') return toggleFriend(button, targetId, load);
  });

  bindPostDeletes(view, load);

  void load();
}

function profileHtml({ target, posts, follows, friendships, isOwn, viewerId }) {
  const color = safeColor(target.color);
  const followers = follows.filter((f) => f.following_id === target.id).length;
  const following = follows.filter((f) => f.follower_id === target.id).length;
  const iFollow = follows.some((f) => f.follower_id === viewerId && f.following_id === target.id);
  const theyFollow = follows.some((f) => f.follower_id === target.id && f.following_id === viewerId);
  const joined = new Date(target.created_at).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  const friend = friendStatus(friendships, viewerId, target.id);
  const friendLabel = {
    none: 'Arkadaş ekle',
    sent: 'İstek gönderildi',
    received: 'İsteği kabul et',
    friends: 'Arkadaşsın',
  }[friend.state];
  const friendNext = { none: 'request', sent: 'cancel', received: 'accept', friends: 'remove' }[friend.state];

  const actions = isOwn
    ? `<div class="profile-actions">
         <button class="btn btn--ghost btn--sm" type="button" data-action="edit">Profili düzenle</button>
         <button class="btn btn--ghost btn--sm" type="button" data-signout>${icon('logout', 16)}Çıkış yap</button>
       </div>`
    : `<div class="profile-actions">
         ${
           iFollow && theyFollow
             ? `<button class="btn btn--primary btn--sm" type="button" data-action="message">${icon('message', 16)}Mesaj</button>`
             : ''
         }
         <button class="btn btn--sm ${iFollow ? 'btn--ghost' : 'btn--light'}" type="button" data-action="follow" data-following="${iFollow}">
           ${iFollow ? 'Takiptesin' : 'Takip et'}
         </button>
         <button class="btn btn--ghost btn--sm" type="button" data-action="friend" data-friend-next="${friendNext}">${friendLabel}</button>
       </div>`;

  const authors = new Map([[target.id, target]]);

  return `
    <section class="profile-cover" style="background: radial-gradient(circle at 80% 20%, ${color}66, transparent 55%), linear-gradient(135deg, ${color}, #000 85%)" aria-hidden="true"></section>
    <div class="profile-head">
      <div class="profile-top">
        ${avatar(target.name, color, 'xl', true)}
        ${actions}
      </div>
      <h2 class="profile-name">${esc(target.name)}</h2>
      <p class="muted">Katılım: ${esc(joined)}</p>
      <p class="profile-bio">${target.bio ? esc(target.bio) : '<span class="muted">Henüz bir biyografi eklenmedi.</span>'}</p>
      <ul class="stats">
        <li><strong>${posts.length}</strong>Gönderi</li>
        <li><strong>${followers}</strong>Takipçi</li>
        <li><strong>${following}</strong>Takip</li>
      </ul>
    </div>
    <section>
      <h2 class="section-title">Gönderiler</h2>
      ${
        posts.length
          ? postListHtml(posts, authors, viewerId)
          : `<div class="state">${isOwn ? 'Henüz gönderin yok. Akıştan ilk paylaşımını yapabilirsin.' : 'Henüz gönderi yok.'}</div>`
      }
    </section>`;
}

function openEditModal(profile) {
  let selectedColor = safeColor(profile.color);
  const swatches = PROFILE_COLORS.map(
    (color) =>
      `<button class="swatch" type="button" data-color="${color}" aria-pressed="${color === selectedColor}" aria-label="Renk ${color}" style="background:${color}"></button>`,
  ).join('');

  const { root, close } = openModal(
    'Profili düzenle',
    `<form class="stack" id="edit-form" novalidate>
       <div class="field-group">
         <label class="field-label" for="edit-name">Ad</label>
         <input class="field" id="edit-name" name="name" maxlength="24" required value="${esc(profile.name)}" />
       </div>
       <div class="field-group">
         <label class="field-label" for="edit-bio">Biyografi</label>
         <textarea class="field" id="edit-bio" name="bio" maxlength="160" rows="3">${esc(profile.bio)}</textarea>
       </div>
       <div class="field-group">
         <span class="field-label" id="swatch-label">Profil rengi</span>
         <div class="swatches" role="group" aria-labelledby="swatch-label">${swatches}</div>
       </div>
       <p class="form-error" id="edit-error" role="alert" hidden></p>
       <div class="modal-footer">
         <button class="btn btn--ghost" type="button" data-close>Vazgeç</button>
         <button class="btn btn--primary" type="submit" id="edit-submit">Kaydet</button>
       </div>
     </form>`,
  );

  const form = root.querySelector('#edit-form');
  const errorEl = root.querySelector('#edit-error');
  const submit = root.querySelector('#edit-submit');

  root.querySelectorAll('[data-color]').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      selectedColor = swatch.dataset.color;
      root.querySelectorAll('[data-color]').forEach((other) => {
        other.setAttribute('aria-pressed', String(other === swatch));
      });
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = form.name.value.trim();
    if (!name) {
      errorEl.textContent = 'Adını boş bırakma.';
      errorEl.hidden = false;
      return;
    }
    setBusy(submit, true);
    try {
      await updateProfile(profile.id, { name, bio: form.bio.value.trim(), color: selectedColor });
      close();
      toast('Profilin güncellendi.');
      window.location.reload();
    } catch {
      setBusy(submit, false);
      errorEl.textContent = 'Profil kaydedilemedi. Tekrar dene.';
      errorEl.hidden = false;
    }
  });
}

async function toggleFollow(button, targetId, viewerId, reload) {
  const isFollowing = button.dataset.following === 'true';
  setBusy(button, true);
  try {
    if (isFollowing) {
      await unfollowUser(viewerId, targetId);
    } else {
      await followUser(viewerId, targetId);
    }
    await reload();
  } catch {
    setBusy(button, false);
    toast('İşlem tamamlanamadı. Tekrar dene.', 'error');
  }
}

async function toggleFriend(button, targetId, reload) {
  setBusy(button, true);
  try {
    await friendAction(targetId, button.dataset.friendNext);
    await reload();
  } catch {
    setBusy(button, false);
    toast('İşlem tamamlanamadı. Tekrar dene.', 'error');
  }
}

async function startMessage(button, peerId) {
  setBusy(button, true);
  try {
    const conversationId = await openDm(peerId);
    window.location.href = `/messages.html?c=${encodeURIComponent(conversationId)}`;
  } catch {
    setBusy(button, false);
    toast('Mesaj başlatılamadı. Karşılıklı takip gerekiyor.', 'error');
  }
}
