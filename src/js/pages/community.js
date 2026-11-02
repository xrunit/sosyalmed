import { bootPage, refreshNotificationBadge } from '@/js/shell.js';
import {
  fetchFollows,
  fetchNotifications,
  fetchProfiles,
  followUser,
  markNotificationsRead,
  unfollowUser,
  watch,
} from '@/js/data.js';
import { acceptedFriendIds, fetchFriendships, friendAction, friendStatus } from '@/js/friends.js';
import { avatar, byId, esc, formatRelative, icon, setBusy, toast } from '@/js/ui.js';

bootPage('community', renderCommunity);

const NOTIFICATION_TEXT = {
  follow: 'seni takip etmeye başladı.',
  friend_request: 'sana arkadaşlık isteği gönderdi.',
  friend_accept: 'arkadaşlık isteğini kabul etti.',
  group_add: 'seni bir gruba ekledi.',
};

function renderCommunity({ user }) {
  const page = document.getElementById('page');
  page.innerHTML = `
    <header class="page-header"><h1>Topluluk</h1></header>
    <div class="tabs" role="tablist" aria-label="Topluluk bölümleri">
      <button class="tab" type="button" role="tab" data-tab="people" aria-selected="true">Kişiler</button>
      <button class="tab" type="button" role="tab" data-tab="friends" aria-selected="false">Arkadaşlar</button>
      <button class="tab" type="button" role="tab" data-tab="notifications" aria-selected="false">Bildirimler</button>
    </div>
    <section id="people-panel">
      <div class="search">
        ${icon('search', 18)}
        <input class="field search-field" id="people-search" type="search" placeholder="Kişi ara" aria-label="Kişi ara" />
      </div>
      <div id="people-list"></div>
    </section>
    <section id="friends-panel" hidden><div id="friends-list"></div></section>
    <section id="notifications-panel" hidden><div id="notifications-list"></div></section>`;

  const peopleList = page.querySelector('#people-list');
  const friendsList = page.querySelector('#friends-list');
  const notificationsList = page.querySelector('#notifications-list');
  const search = page.querySelector('#people-search');
  const state = { profiles: new Map(), follows: [], friendships: [], tab: 'people' };

  const loadAll = async () => {
    try {
      const [profiles, follows, friendships] = await Promise.all([fetchProfiles(), fetchFollows(), fetchFriendships()]);
      state.profiles = byId(profiles);
      state.follows = follows;
      state.friendships = friendships;
      renderPeople();
      if (state.tab === 'friends') renderFriends();
    } catch {
      peopleList.innerHTML = retryState();
    }
  };

  const renderPeople = () => {
    const query = search.value.trim().toLocaleLowerCase('tr-TR');
    const followingIds = new Set(state.follows.filter((f) => f.follower_id === user.id).map((f) => f.following_id));
    const people = [...state.profiles.values()].filter(
      (person) => person.id !== user.id && (!query || person.name.toLocaleLowerCase('tr-TR').includes(query)),
    );

    if (!people.length) {
      peopleList.innerHTML = `<div class="state">${query ? 'Aramana uyan kimse bulunamadı.' : 'Henüz başka üye yok.'}</div>`;
      return;
    }

    peopleList.innerHTML = `<ul class="list">${people
      .map((person) => {
        const following = followingIds.has(person.id);
        const friend = friendStatus(state.friendships, user.id, person.id);
        return `
          <li class="row">
            <a href="/profile.html?id=${encodeURIComponent(person.id)}" aria-label="${esc(person.name)} profilini aç">${avatar(person.name, person.color, 'md')}</a>
            <div class="row-main">
              <a href="/profile.html?id=${encodeURIComponent(person.id)}"><strong>${esc(person.name)}</strong></a>
              <span class="muted clamp">${esc(person.bio || 'Akım üyesi')}</span>
            </div>
            <div class="request-actions">
              <button class="btn btn--sm ${following ? 'btn--ghost' : 'btn--light'}" type="button" data-follow="${esc(person.id)}" data-following="${following}">
                ${following ? 'Takiptesin' : 'Takip et'}
              </button>
              ${friendButton(friend, person.id)}
            </div>
          </li>`;
      })
      .join('')}</ul>`;
  };

  const renderFriends = () => {
    const incoming = state.friendships.filter((f) => f.status === 'pending' && f.requested_by !== user.id);
    const outgoing = state.friendships.filter((f) => f.status === 'pending' && f.requested_by === user.id);
    const friends = acceptedFriendIds(state.friendships, user.id);

    const otherName = (id) => state.profiles.get(id)?.name || 'Kullanıcı';
    const otherPerson = (id) => state.profiles.get(id);
    const otherOf = (f) => (f.user_low === user.id ? f.user_high : f.user_low);

    const incomingHtml = incoming.length
      ? incoming
          .map((f) => {
            const id = otherOf(f);
            const person = otherPerson(id);
            return `
              <li class="row">
                ${avatar(otherName(id), person?.color, 'md')}
                <div class="row-main"><strong>${esc(otherName(id))}</strong><span class="muted">Sana istek gönderdi</span></div>
                <div class="request-actions">
                  <button class="btn btn--primary btn--sm" type="button" data-friend="${esc(id)}" data-action="accept">Kabul et</button>
                  <button class="btn btn--ghost btn--sm" type="button" data-friend="${esc(id)}" data-action="decline">Reddet</button>
                </div>
              </li>`;
          })
          .join('')
      : '';

    const outgoingHtml = outgoing
      .map((f) => {
        const id = otherOf(f);
        return `
          <li class="row">
            ${avatar(otherName(id), otherPerson(id)?.color, 'md')}
            <div class="row-main"><strong>${esc(otherName(id))}</strong><span class="muted">İstek gönderildi</span></div>
            <button class="btn btn--ghost btn--sm" type="button" data-friend="${esc(id)}" data-action="cancel">İptal</button>
          </li>`;
      })
      .join('');

    const friendsHtml = friends
      .map((id) => {
        const person = otherPerson(id);
        return `
          <li class="row">
            <a href="/profile.html?id=${encodeURIComponent(id)}">${avatar(otherName(id), person?.color, 'md')}</a>
            <div class="row-main"><a href="/profile.html?id=${encodeURIComponent(id)}"><strong>${esc(otherName(id))}</strong></a><span class="muted">Arkadaş</span></div>
            <button class="btn btn--ghost btn--sm" type="button" data-friend="${esc(id)}" data-action="remove">Kaldır</button>
          </li>`;
      })
      .join('');

    const sections = [
      incomingHtml && `<p class="section-label">Gelen istekler</p><ul class="list">${incomingHtml}</ul>`,
      outgoingHtml && `<p class="section-label">Gönderilen istekler</p><ul class="list">${outgoingHtml}</ul>`,
      `<p class="section-label">Arkadaşların (${friends.length})</p>${
        friends.length ? `<ul class="list">${friendsHtml}</ul>` : '<div class="state">Henüz arkadaşın yok. Kişiler sekmesinden istek gönder.</div>'
      }`,
    ];
    friendsList.innerHTML = sections.filter(Boolean).join('');
  };

  const loadNotifications = async () => {
    try {
      const [notifications, profiles] = await Promise.all([fetchNotifications(user.id), fetchProfiles()]);
      const authors = byId(profiles);
      if (state.tab !== 'notifications') return;
      notificationsList.innerHTML = notifications.length
        ? `<ul class="list">${notifications.map((item) => notificationRow(item, authors)).join('')}</ul>`
        : `<div class="state">Henüz bildirimin yok. Biri seni takip ettiğinde burada göreceksin.</div>`;
      if (notifications.some((item) => !item.read)) {
        await markNotificationsRead(user.id);
        void refreshNotificationBadge(user.id);
      }
    } catch {
      notificationsList.innerHTML = retryState();
    }
  };

  const setTab = (tab) => {
    state.tab = tab;
    page.querySelectorAll('[data-tab]').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.tab === tab));
    });
    page.querySelector('#people-panel').hidden = tab !== 'people';
    page.querySelector('#friends-panel').hidden = tab !== 'friends';
    page.querySelector('#notifications-panel').hidden = tab !== 'notifications';
    if (tab === 'friends') renderFriends();
    if (tab === 'notifications') {
      notificationsList.innerHTML = `<div class="state">Yükleniyor…</div>`;
      void loadNotifications();
    }
  };

  const runFriendAction = async (button, peerId, action) => {
    setBusy(button, true);
    try {
      await friendAction(peerId, action);
      state.friendships = await fetchFriendships();
      renderPeople();
      renderFriends();
    } catch {
      setBusy(button, false);
      toast('İşlem tamamlanamadı. Tekrar dene.', 'error');
    }
  };

  page.querySelector('.tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (button) setTab(button.dataset.tab);
  });

  peopleList.addEventListener('click', async (event) => {
    if (event.target.closest('[data-retry]')) return void loadAll();
    const followButton = event.target.closest('[data-follow]');
    if (followButton) {
      const targetId = followButton.dataset.follow;
      const isFollowing = followButton.dataset.following === 'true';
      setBusy(followButton, true);
      try {
        if (isFollowing) await unfollowUser(user.id, targetId);
        else await followUser(user.id, targetId);
        state.follows = await fetchFollows();
        renderPeople();
      } catch {
        setBusy(followButton, false);
        toast('İşlem tamamlanamadı. Tekrar dene.', 'error');
      }
      return;
    }
    const friendBtn = event.target.closest('[data-friend-action]');
    if (friendBtn) void runFriendAction(friendBtn, friendBtn.dataset.friendAction, friendBtn.dataset.action);
  });

  friendsList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-friend]');
    if (button) void runFriendAction(button, button.dataset.friend, button.dataset.action);
  });

  search.addEventListener('input', renderPeople);
  notificationsList.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry]')) void loadNotifications();
  });

  watch(`community-follows-${user.id}`, 'follows', null, () => void loadAll());
  watch(`community-friendships-${user.id}`, 'friendships', null, () => void loadAll());
  watch(`community-notifications-${user.id}`, 'notifications', `user_id=eq.${user.id}`, () => {
    if (state.tab === 'notifications') void loadNotifications();
  });

  void loadAll();
}

function friendButton(friend, personId) {
  const id = esc(personId);
  if (friend.state === 'friends') {
    return `<button class="btn btn--ghost btn--sm" type="button" data-friend-action="${id}" data-action="remove">Arkadaşsın</button>`;
  }
  if (friend.state === 'sent') {
    return `<button class="btn btn--ghost btn--sm" type="button" data-friend-action="${id}" data-action="cancel">İstek gönderildi</button>`;
  }
  if (friend.state === 'received') {
    return `<button class="btn btn--primary btn--sm" type="button" data-friend-action="${id}" data-action="accept">Kabul et</button>`;
  }
  return `<button class="btn btn--ghost btn--sm" type="button" data-friend-action="${id}" data-action="request">Arkadaş ekle</button>`;
}

function notificationRow(item, authors) {
  const actor = authors.get(item.actor_id);
  const name = actor?.name || 'Biri';
  const message = NOTIFICATION_TEXT[item.type] ?? 'seninle ilgili bir etkinlik yaptı.';
  return `
    <li class="row${item.read ? '' : ' is-unread'}">
      <a href="/profile.html?id=${encodeURIComponent(item.actor_id)}">${avatar(name, actor?.color, 'md')}</a>
      <div class="row-main">
        <span><a href="/profile.html?id=${encodeURIComponent(item.actor_id)}"><strong>${esc(name)}</strong></a> ${message}</span>
        <span class="muted">${formatRelative(item.created_at)}</span>
      </div>
    </li>`;
}

function retryState() {
  return `<div class="state">Liste yüklenemedi. <button class="btn btn--ghost btn--sm" type="button" data-retry>Tekrar dene</button></div>`;
}
