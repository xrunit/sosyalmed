import { bootPage } from '@/js/shell.js';
import {
  addGroupMembers,
  createGroup,
  fetchMembers,
  fetchMyConversations,
  fetchPublicGroups,
  leaveGroup,
  removeGroupMember,
  renameGroup,
  setGroupMemberRole,
  setGroupPublic,
  openDm,
} from '@/js/chat.js';
import { mountThread } from '@/js/chat-thread.js';
import { fetchFollows, fetchProfiles, watch } from '@/js/data.js';
import { acceptedFriendIds, fetchFriendships } from '@/js/friends.js';
import { avatar, byId, esc, icon, openModal, setBusy, toast, confirmDialog } from '@/js/ui.js';

bootPage('messages', renderMessages);

function renderMessages({ user }) {
  const page = document.getElementById('page');
  page.classList.add('main--chat');
  page.innerHTML = `
    <div class="chat-layout" id="chat-layout">
      <section class="convo-pane">
        <header class="page-header">
          <h1>Mesajlar</h1>
          <button class="icon-btn" type="button" data-action="new-dm" aria-label="Yeni mesaj" title="Yeni mesaj">${icon('plus', 20)}</button>
        </header>
        <div class="convo-list" id="convo-list"></div>
      </section>
      <section class="chat-pane" id="chat-pane">
        <div class="chat-empty state">Bir sohbet seç ya da yeni bir mesaj başlat.</div>
      </section>
    </div>`;

  const layout = page.querySelector('#chat-layout');
  const convoList = page.querySelector('#convo-list');
  let chatPane = page.querySelector('#chat-pane');
  const state = { items: [], profiles: new Map(), activeId: null, unmountThread: null };

  const findItem = (id) => state.items.find((item) => item.conversation.id === id);

  const renderList = () => {
    const groups = state.items.filter((item) => item.conversation.kind === 'group');
    const dms = state.items.filter((item) => item.conversation.kind === 'dm');
    convoList.innerHTML = `
      <p class="section-label">Gruplar</p>
      ${groups
        .map(
          (item) => `
            <button class="convo-row${item.conversation.id === state.activeId ? ' is-active' : ''}" type="button" data-open="${esc(item.conversation.id)}">
              <span class="room-mark">${icon('hash', 18)}</span>
              <span class="convo-text"><strong>${esc(item.conversation.name || 'Grup')}</strong><span class="muted">${item.isMember ? (item.conversation.is_public ? 'Herkese açık grup' : 'Özel grup') : 'Katılmak için aç'}</span></span>
            </button>`,
        )
        .join('')}
      <button class="btn btn--ghost btn--sm btn--block" type="button" data-action="new-group">${icon('plus', 16)}Yeni grup</button>
      <p class="section-label">Özel mesajlar</p>
      ${
        dms.length
          ? dms
              .map(
                (item) => `
                  <button class="convo-row${item.conversation.id === state.activeId ? ' is-active' : ''}" type="button" data-open="${esc(item.conversation.id)}">
                    ${avatar(item.title, item.color, 'md')}
                    <span class="convo-text"><strong>${esc(item.title)}</strong><span class="muted">Özel mesaj</span></span>
                  </button>`,
              )
              .join('')
          : '<p class="hint">Karşılıklı takip ettiğin biriyle özel mesaj başlatabilirsin.</p>'
      }`;
  };

  const loadSidebar = async () => {
    try {
      const [mine, publicGroups, profiles] = await Promise.all([
        fetchMyConversations(user.id),
        fetchPublicGroups(),
        fetchProfiles(),
      ]);
      state.profiles = byId(profiles);

      const groupMemberships = new Map(
        mine
          .filter(({ conversation }) => conversation?.kind === 'group')
          .map(({ conversation, role }) => [conversation.id, { conversation, role }]),
      );
      const groups = new Map(publicGroups.map((conversation) => [conversation.id, conversation]));
      for (const { conversation } of groupMemberships.values()) groups.set(conversation.id, conversation);

      const dmRows = mine.filter(({ conversation }) => conversation?.kind === 'dm');
      const memberRows = await fetchMembers(dmRows.map(({ conversation }) => conversation.id));
      const nextItems = [...groups.values()].map((conversation) => ({
        conversation,
        isMember: groupMemberships.has(conversation.id),
        role: groupMemberships.get(conversation.id)?.role ?? null,
        title: conversation.name || 'Grup',
      }));

      for (const { conversation } of dmRows) {
        const peerId = memberRows.find(
          (member) => member.conversation_id === conversation.id && member.user_id !== user.id,
        )?.user_id;
        if (!peerId) continue;
        const peer = state.profiles.get(peerId);
        nextItems.push({
          conversation,
          isMember: true,
          role: 'member',
          peerId,
          title: peer?.name || 'Kullanıcı',
          color: peer?.color,
        });
      }

      state.items = nextItems.sort(
        (a, b) => new Date(b.conversation.created_at).getTime() - new Date(a.conversation.created_at).getTime(),
      );
      renderList();
    } catch {
      convoList.innerHTML = `<div class="state">Sohbetler yüklenemedi. <button class="btn btn--ghost btn--sm" type="button" data-action="retry">Tekrar dene</button></div>`;
    }
  };

  const closeThread = () => {
    state.unmountThread?.();
    state.unmountThread = null;
    state.activeId = null;
    const replacement = chatPane.cloneNode(false);
    chatPane.replaceWith(replacement);
    chatPane = replacement;
    chatPane.innerHTML = '<div class="chat-empty state">Bir sohbet seç ya da yeni bir mesaj başlat.</div>';
    layout.classList.remove('is-chat-open');
    window.history.replaceState(null, '', window.location.pathname);
    renderList();
  };

  const openConversation = (id) => {
    const item = findItem(id);
    if (!item) return;
    state.unmountThread?.();
    state.activeId = id;
    const replacement = chatPane.cloneNode(false);
    chatPane.replaceWith(replacement);
    chatPane = replacement;
    layout.classList.add('is-chat-open');
    window.history.replaceState(null, '', `${window.location.pathname}?c=${encodeURIComponent(id)}`);
    renderList();
    state.unmountThread = mountThread(chatPane, {
      user,
      item,
      profiles: state.profiles,
      onBack: closeThread,
      onInfo: () => void openGroupInfo(item),
      onChanged: async () => {
        await loadSidebar();
        if (findItem(id)) openConversation(id);
        else closeThread();
      },
    });
  };

  const openNewGroup = () => {
    const { root, close } = openModal(
      'Yeni grup',
      `<form class="stack" data-form>
        <div class="field-group">
          <label class="field-label" for="group-name">Grup adı</label>
          <input class="field" id="group-name" name="name" maxlength="30" required placeholder="Örn. Arkadaşlar" />
        </div>
        <p class="form-error" data-error role="alert" hidden></p>
        <div class="modal-footer">
          <button class="btn btn--ghost" type="button" data-close>Vazgeç</button>
          <button class="btn btn--primary" type="submit">Oluştur</button>
        </div>
      </form>`,
    );
    root.querySelector('#group-name').focus();
    root.querySelector('[data-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = root.querySelector('button[type="submit"]');
      const name = root.querySelector('[name="name"]').value.trim();
      if (!name) return;
      setBusy(button, true);
      try {
        const id = await createGroup(name, []);
        close();
        await loadSidebar();
        openConversation(id);
      } catch {
        const error = root.querySelector('[data-error]');
        error.textContent = 'Grup oluşturulamadı. Tekrar dene.';
        error.hidden = false;
        setBusy(button, false);
      }
    });
  };

  const openNewDm = async () => {
    try {
      const [follows, profiles] = await Promise.all([fetchFollows(), fetchProfiles()]);
      state.profiles = byId(profiles);
      const mutuals = mutualPeople(follows, user.id, state.profiles);
      const body = mutuals.length
        ? `<p class="muted">Karşılıklı takip ettiğin kişiler:</p>
           <div class="stack">${mutuals
             .map(
               (person) => `
                 <button class="convo-row" type="button" data-peer="${esc(person.id)}">
                   ${avatar(person.name, person.color, 'md')}
                   <span class="convo-text"><strong>${esc(person.name)}</strong></span>
                 </button>`,
             )
             .join('')}</div>`
        : '<p class="muted">Özel mesaj başlatmak için birbirinizi takip etmelisiniz.</p>';
      const { root, close } = openModal('Yeni mesaj', body);
      root.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-peer]');
        if (!button) return;
        setBusy(button, true);
        try {
          const id = await openDm(button.dataset.peer);
          close();
          await loadSidebar();
          openConversation(id);
        } catch {
          setBusy(button, false);
          toast('Mesaj başlatılamadı. Tekrar dene.', 'error');
        }
      });
    } catch {
      toast('Kişiler yüklenemedi. Tekrar dene.', 'error');
    }
  };

  const refreshGroup = async (item) => {
    await loadSidebar();
    if (findItem(item.conversation.id)) openConversation(item.conversation.id);
    else closeThread();
  };

  const openGroupInfo = async (item) => {
    if (item.conversation.kind !== 'group') return;
    try {
      const members = await fetchMembers([item.conversation.id]);
      const myRole = members.find((member) => member.user_id === user.id)?.role;
      const canManage = myRole === 'owner' || myRole === 'admin';
      const isOwner = myRole === 'owner';
      const ownerName = state.profiles.get(item.conversation.owner_id)?.name || 'Bilinmiyor';
      const memberHtml = members
        .map((member) => {
          const profile = state.profiles.get(member.user_id);
          const memberName = profile?.name || 'Kullanıcı';
          const roleLabel = { owner: 'Sahip', admin: 'Yönetici', member: 'Üye' }[member.role] || 'Üye';
          const actions =
            member.user_id !== user.id && canManage
              ? `<span class="request-actions">
                  ${isOwner ? `<button class="btn btn--ghost btn--sm" type="button" data-group-action="role" data-peer="${esc(member.user_id)}" data-role="${esc(member.role)}">${member.role === 'admin' ? 'Üyeliğe al' : 'Yönetici yap'}</button>` : ''}
                  <button class="btn btn--ghost btn--sm" type="button" data-group-action="remove" data-peer="${esc(member.user_id)}">Çıkar</button>
                </span>`
              : '';
          return `<li class="row">${avatar(memberName, profile?.color, 'sm')}<div class="row-main"><strong>${esc(memberName)}</strong><span class="muted">${roleLabel}</span></div>${actions}</li>`;
        })
        .join('');
      const controls = item.isMember
        ? `<div class="stack">
            ${canManage ? '<button class="btn btn--ghost btn--block" type="button" data-group-action="rename">Grup adını değiştir</button><button class="btn btn--ghost btn--block" type="button" data-group-action="add">Arkadaş ekle</button>' : ''}
            ${isOwner ? `<button class="btn btn--ghost btn--block" type="button" data-group-action="visibility">${item.conversation.is_public ? 'Grubu gizli yap' : 'Grubu herkese açık yap'}</button>` : ''}
            <button class="btn btn--ghost btn--block" type="button" data-group-action="leave">Gruptan ayrıl</button>
          </div>`
        : '<p class="muted">Bu gruba katılmak için sohbeti açıp katıl düğmesine bas.</p>';
      const { root, close } = openModal(
        'Grup bilgisi',
        `<p class="muted">${item.conversation.is_public ? 'Herkese açık grup' : 'Özel grup'} · Sahip: ${esc(ownerName)}</p>
         <p class="section-label">Üyeler (${members.length})</p>
         <ul class="list">${memberHtml || '<li class="muted">Üye bulunamadı.</li>'}</ul>
         ${controls}`,
      );
      root.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-group-action]');
        if (!button) return;
        const action = button.dataset.groupAction;
        if (action === 'rename') {
          close();
          return openRenameGroup(item);
        }
        if (action === 'add') {
          close();
          return void openAddMembers(item, members);
        }
        setBusy(button, true);
        try {
          if (action === 'leave') {
            const confirmed = await confirmDialog({
              title: 'Gruptan ayrıl?',
              message: 'Gruptan ayrıldığında mesaj gönderemezsin. Herkese bir ayrılma bildirimi gösterilir.',
              confirmLabel: 'Ayrıl',
            });
            if (!confirmed) return setBusy(button, false);
            await leaveGroup(item.conversation.id);
            close();
            toast('Gruptan ayrıldın.');
            await refreshGroup(item);
          } else if (action === 'visibility') {
            await setGroupPublic(item.conversation.id, !item.conversation.is_public);
            close();
            await refreshGroup(item);
          } else if (action === 'role') {
            const nextRole = button.dataset.role === 'admin' ? 'member' : 'admin';
            await setGroupMemberRole(item.conversation.id, button.dataset.peer, nextRole);
            close();
            await refreshGroup(item);
          } else if (action === 'remove') {
            await removeGroupMember(item.conversation.id, button.dataset.peer);
            close();
            await refreshGroup(item);
          }
        } catch {
          setBusy(button, false);
          toast('Grup işlemi tamamlanamadı.', 'error');
        }
      });
    } catch {
      toast('Grup bilgileri yüklenemedi.', 'error');
    }
  };

  const openRenameGroup = (item) => {
    const { root, close } = openModal(
      'Grup adını değiştir',
      `<form class="stack" data-form>
        <label class="field-label" for="rename-group">Yeni ad</label>
        <input class="field" id="rename-group" name="name" maxlength="30" required value="${esc(item.conversation.name)}" />
        <p class="form-error" data-error role="alert" hidden></p>
        <div class="modal-footer"><button class="btn btn--primary" type="submit">Kaydet</button></div>
      </form>`,
    );
    root.querySelector('[name="name"]').focus();
    root.querySelector('[data-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = root.querySelector('button[type="submit"]');
      setBusy(button, true);
      try {
        await renameGroup(item.conversation.id, root.querySelector('[name="name"]').value.trim());
        close();
        await refreshGroup(item);
      } catch {
        const error = root.querySelector('[data-error]');
        error.textContent = 'Grup adı değiştirilemedi.';
        error.hidden = false;
        setBusy(button, false);
      }
    });
  };

  const openAddMembers = async (item, currentMembers) => {
    try {
      const [friendships, profiles] = await Promise.all([fetchFriendships(), fetchProfiles()]);
      state.profiles = byId(profiles);
      const existing = new Set(currentMembers.map((member) => member.user_id));
      const candidates = acceptedFriendIds(friendships, user.id)
        .filter((id) => !existing.has(id))
        .map((id) => state.profiles.get(id))
        .filter(Boolean);
      const { root, close } = openModal(
        'Arkadaş ekle',
        `<form class="stack" data-form>
          ${
            candidates.length
              ? candidates
                  .map(
                    (profile) => `
                      <label class="row">
                        <input type="checkbox" name="members" value="${esc(profile.id)}" />
                        ${avatar(profile.name, profile.color, 'sm')}
                        <strong>${esc(profile.name)}</strong>
                      </label>`,
                  )
                  .join('')
              : '<p class="muted">Eklenebilecek arkadaşın yok.</p>'
          }
          <p class="form-error" data-error role="alert" hidden></p>
          <div class="modal-footer"><button class="btn btn--primary" type="submit" ${candidates.length ? '' : 'disabled'}>Ekle</button></div>
        </form>`,
      );
      root.querySelector('[data-form]').addEventListener('submit', async (event) => {
        event.preventDefault();
        const ids = [...root.querySelectorAll('input[name="members"]:checked')].map((input) => input.value);
        if (!ids.length) return;
        const button = root.querySelector('button[type="submit"]');
        setBusy(button, true);
        try {
          await addGroupMembers(item.conversation.id, ids);
          close();
          await refreshGroup(item);
        } catch {
          const error = root.querySelector('[data-error]');
          error.textContent = 'Arkadaşlar eklenemedi.';
          error.hidden = false;
          setBusy(button, false);
        }
      });
    } catch {
      toast('Arkadaş listesi yüklenemedi.', 'error');
    }
  };

  convoList.addEventListener('click', (event) => {
    const open = event.target.closest('[data-open]');
    if (open) return openConversation(open.dataset.open);
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'new-group') return openNewGroup();
    if (action === 'new-dm') return void openNewDm();
    if (action === 'retry') void loadSidebar();
  });

  page.querySelector('.convo-pane .page-header').addEventListener('click', (event) => {
    if (event.target.closest('[data-action="new-dm"]')) void openNewDm();
  });

  watch(`messages-conversations-${user.id}`, 'conversations', null, () => void loadSidebar());
  watch(`messages-members-${user.id}`, 'conversation_members', `user_id=eq.${user.id}`, () => void loadSidebar());

  void (async () => {
    await loadSidebar();
    const requested = new URLSearchParams(window.location.search).get('c');
    if (requested) openConversation(requested);
  })();
}

function mutualPeople(follows, userId, profiles) {
  const following = new Set(follows.filter((follow) => follow.follower_id === userId).map((follow) => follow.following_id));
  const followers = new Set(follows.filter((follow) => follow.following_id === userId).map((follow) => follow.follower_id));
  return [...following]
    .filter((id) => followers.has(id) && profiles.has(id))
    .map((id) => profiles.get(id))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}
