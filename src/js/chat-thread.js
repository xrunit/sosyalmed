import {
  REACTIONS,
  deleteMessage,
  fetchMembers,
  fetchMessages,
  fetchReactions,
  joinPublicGroup,
  markRead,
  sendMessage,
  toggleReaction,
} from '@/js/chat.js';
import { watch } from '@/js/data.js';
import { supabase } from '@/js/supabase.js';
import { avatar, confirmDialog, esc, formatTime, icon, toast, setBusy, openModal } from '@/js/ui.js';

function giphyImageUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      /^media\d*\.giphy\.com$/i.test(url.hostname) &&
      /^\/media\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(gif|webp)$/i.test(url.pathname)
    ) {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

function groupReactions(rows) {
  const byMessage = new Map();
  for (const row of rows) {
    if (!byMessage.has(row.message_id)) byMessage.set(row.message_id, new Map());
    const emojis = byMessage.get(row.message_id);
    const entry = emojis.get(row.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    emojis.set(row.emoji, entry);
  }
  return byMessage;
}

function markMine(reactionMap, userId, rows) {
  for (const row of rows) {
    if (row.user_id === userId) reactionMap.get(row.message_id)?.get(row.emoji) && (reactionMap.get(row.message_id).get(row.emoji).mine = true);
  }
}

export function mountThread(container, { user, item, profiles, onInfo, onBack, onChanged }) {
  const { conversation } = item;
  const isGroup = conversation.kind === 'group';
  const state = {
    messages: [],
    members: [],
    reactions: new Map(),
    replyTo: null,
    closed: false,
    isMember: item.isMember,
  };
  const nameOf = (id) => profiles.get(id)?.name ?? 'Kullanıcı';

  container.innerHTML = `
    <header class="chat-header">
      <button class="icon-btn" type="button" data-action="back" aria-label="Sohbet listesine dön">${icon('back', 20)}</button>
      <button class="thread-title-btn" type="button" data-action="info">
        ${isGroup ? `<span class="avatar avatar--sm avatar--group">${icon('hash', 16)}</span>` : avatar(item.title, item.color, 'sm')}
        <span class="thread-name">${esc(item.title)}</span>
      </button>
    </header>
    <div class="message-list" data-list><div class="state">Yükleniyor…</div></div>
    <div class="thread-footer" data-footer></div>`;

  const list = container.querySelector('[data-list]');
  const footer = container.querySelector('[data-footer]');

  function messageHtml(message, lastMineId, seenAt) {
    if (message.kind === 'system') return `<div class="msg-system">${esc(message.body)}</div>`;
    const mine = message.user_id === user.id;
    const author = profiles.get(message.user_id);
    const parent = message.reply_to ? state.messages.find((m) => m.id === message.reply_to) : null;
    const quote = message.reply_to
      ? `<span class="msg-quote"><strong>${esc(parent ? nameOf(parent.user_id) : '')}</strong><span>${esc(parent ? parent.body : 'Silinmiş mesaj')}</span></span>`
      : '';
    const chips = [...(state.reactions.get(message.id)?.entries() ?? [])]
      .map(
        ([emoji, { count, mine: reacted }]) =>
          `<button class="reaction-chip${reacted ? ' is-mine' : ''}" type="button" data-action="react" data-id="${message.id}" data-emoji="${esc(emoji)}">${esc(emoji)} ${count}</button>`,
      )
      .join('');
    const gifUrl = giphyImageUrl(message.body);
    const bubbleBody = gifUrl
      ? `<img class="message-gif" src="${esc(gifUrl)}" alt="GIF" loading="lazy" referrerpolicy="no-referrer" />`
      : esc(message.body);
    const seen =
      mine && message.id === lastMineId && seenAt && new Date(seenAt) >= new Date(message.created_at)
        ? '<span class="seen-label">Görüldü</span>'
        : '';
    return `
      <div class="msg${mine ? ' msg--mine' : ''}">
        ${mine ? '' : `<div class="msg-avatar">${avatar(author?.name, author?.color, 'sm')}</div>`}
        <div class="msg-main">
          ${!mine && isGroup ? `<span class="msg-name">${esc(nameOf(message.user_id))}</span>` : ''}
          <div class="bubble-wrap">
            <button class="bubble-button" type="button" data-action="msg-menu" data-id="${message.id}" aria-label="Mesaj seçenekleri">
              <span class="bubble${mine ? ' bubble--mine' : ''}${gifUrl ? ' bubble--gif' : ''}">${quote}${bubbleBody}</span>
            </button>
            ${chips ? `<div class="msg-reactions">${chips}</div>` : ''}
          </div>
          ${seen}
          <span class="msg-meta">${formatTime(message.created_at)}</span>
        </div>
      </div>`;
  }

  function renderMessages() {
    const peer = state.members.find((m) => m.user_id !== user.id);
    const seenAt = !isGroup ? peer?.last_read_at : null;
    const lastMineId = [...state.messages].reverse().find((m) => m.user_id === user.id && m.kind === 'user')?.id;
    list.innerHTML = state.messages.length
      ? state.messages.map((m) => messageHtml(m, lastMineId, seenAt)).join('')
      : '<div class="state">Henüz mesaj yok. İlk mesajı sen yaz.</div>';
    list.scrollTop = list.scrollHeight;
  }

  function renderFooter() {
    if (!state.isMember) {
      const canJoin = isGroup && conversation.is_public;
      footer.innerHTML = canJoin
        ? `<div class="composer-notice"><span>Bu herkese açık gruba katılarak mesaj gönderebilirsin.</span><button class="btn btn--primary" type="button" data-action="join">Gruba katıl</button></div>`
        : `<div class="composer-notice"><span>Bu gruptan çıktın. Artık mesaj gönderemezsin.</span></div>`;
      return;
    }
    footer.innerHTML = `
      <div class="reply-bar" data-reply hidden>
        <span data-reply-text></span>
        <button class="icon-btn" type="button" data-action="cancel-reply" aria-label="Yanıtı iptal et">${icon('x', 16)}</button>
      </div>
      <form class="composer-bar" data-form autocomplete="off">
        <button class="btn btn--ghost gif-button" type="button" data-action="gif" aria-label="GIF ekle">GIF</button>
        <input class="field" name="body" maxlength="1000" placeholder="Bir mesaj yaz" aria-label="Mesaj" />
        <button class="btn btn--primary send-btn" type="submit" aria-label="Gönder">${icon('send', 18)}</button>
      </form>`;
    renderReplyBar();
  }

  function renderReplyBar() {
    const bar = footer.querySelector('[data-reply]');
    if (!bar) return;
    bar.hidden = !state.replyTo;
    if (state.replyTo) {
      bar.querySelector('[data-reply-text]').textContent = `${nameOf(state.replyTo.user_id)} kişisine yanıt`;
    }
  }

  async function load() {
    try {
      const [messages, members] = await Promise.all([fetchMessages(conversation.id), fetchMembers([conversation.id])]);
      if (state.closed) return;
      const reactionRows = await fetchReactions(messages.map((m) => m.id));
      if (state.closed) return;
      const reactions = groupReactions(reactionRows);
      markMine(reactions, user.id, reactionRows);
      state.messages = messages;
      state.members = members;
      state.reactions = reactions;
      state.isMember = members.some((m) => m.user_id === user.id);
      if (!footer.innerHTML) renderFooter();
      else if (String(state.isMember) !== footer.dataset.member || !footer.querySelector('[data-form]') === state.isMember) renderFooter();
      footer.dataset.member = String(state.isMember);
      renderMessages();
      const readAt = members.find((member) => member.user_id === user.id)?.last_read_at;
      const latestMessageAt = state.messages.at(-1)?.created_at;
      if (state.isMember && (!readAt || (latestMessageAt && new Date(readAt) < new Date(latestMessageAt)))) {
        await markRead(conversation.id, user.id);
      }
    } catch {
      if (!state.closed) list.innerHTML = '<div class="state">Mesajlar yüklenemedi. Tekrar dene.</div>';
    }
  }

  function openSheet(message) {
    const mine = message.user_id === user.id;
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.innerHTML = `
      <div class="sheet" role="dialog" aria-label="Mesaj seçenekleri">
        ${state.isMember ? `<div class="sheet-reactions">${REACTIONS.map((e) => `<button class="sheet-reaction" type="button" data-emoji="${e}" aria-label="${e} tepkisi ver">${e}</button>`).join('')}</div>` : ''}
        ${state.isMember ? `<button class="sheet-action" type="button" data-sheet="reply">${icon('back', 18)}Yanıtla</button>` : ''}
        ${mine ? `<button class="sheet-action is-danger" type="button" data-sheet="delete">${icon('trash', 18)}Mesajı sil</button>` : ''}
      </div>`;
    const close = () => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', async (event) => {
      if (event.target === backdrop) return close();
      const reaction = event.target.closest('[data-emoji]');
      const action = event.target.closest('[data-sheet]')?.dataset.sheet;
      if (reaction) {
        close();
        try {
          await toggleReaction(message.id, user.id, reaction.dataset.emoji);
          await load();
        } catch {
          toast('Tepki eklenemedi.', 'error');
        }
      } else if (action === 'reply') {
        close();
        state.replyTo = message;
        renderReplyBar();
        footer.querySelector('input[name="body"]')?.focus();
      } else if (action === 'delete') {
        close();
        const ok = await confirmDialog({
          title: 'Mesaj silinsin mi?',
          message: 'Bu mesaj herkes için silinecek.',
          confirmLabel: 'Sil',
        });
        if (!ok) return;
        try {
          await deleteMessage(message.id);
          await load();
        } catch {
          toast('Mesaj silinemedi.', 'error');
        }
      }
    });
    document.body.append(backdrop);
  }

  async function openGifPicker() {
    const { root, close } = openModal(
      'GIF ara',
      `<form class="gif-search" data-gif-search>
        <input class="field" type="search" name="query" maxlength="80" placeholder="GIF ara" aria-label="GIF ara" />
        <button class="btn btn--primary" type="submit">Ara</button>
      </form>
      <p class="gif-status muted" data-gif-status>Trend GIF'ler yükleniyor…</p>
      <div class="gif-grid" data-gif-grid></div>
      <p class="gif-attribution muted">Powered by <a href="https://giphy.com" target="_blank" rel="noreferrer">GIPHY</a></p>`,
    );
    const form = root.querySelector('[data-gif-search]');
    const input = form.elements.query;
    const grid = root.querySelector('[data-gif-grid]');
    const status = root.querySelector('[data-gif-status]');
    let gifs = [];
    let requestId = 0;

    const loadGifs = async (query = '') => {
      const request = ++requestId;
      status.textContent = query ? 'GIF aranıyor…' : "Trend GIF'ler yükleniyor…";
      grid.replaceChildren();
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) throw new Error('Sign in to search GIFs.');

        const params = new URLSearchParams({ limit: '18' });
        if (query) {
          params.set('type', 'search');
          params.set('q', query);
        } else {
          params.set('type', 'trending');
        }
        const response = await fetch(`/api/giphy?${params}`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'GIF search failed.');
        if (request !== requestId) return;

        gifs = payload.gifs;
        if (!gifs.length) {
          status.textContent = 'GIF bulunamadı.';
          return;
        }
        status.textContent = '';
        grid.innerHTML = gifs
          .map(
            (gif, index) => `
              <button class="gif-result" type="button" data-gif-index="${index}" aria-label="${esc(gif.title)} GIF gönder">
                <img src="${esc(gif.preview)}" alt="${esc(gif.title)}" loading="lazy" referrerpolicy="no-referrer" />
              </button>`,
          )
          .join('');
      } catch {
        if (request === requestId) status.textContent = 'GIF servisine bağlanılamadı. Ayarları kontrol edip tekrar dene.';
      }
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (query.length < 2) {
        status.textContent = 'Arama için en az 2 karakter yaz.';
        return;
      }
      void loadGifs(query);
    });

    grid.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-gif-index]');
      if (!button) return;
      const gif = gifs[Number(button.dataset.gifIndex)];
      if (!gif) return;
      setBusy(button, true);
      try {
        await sendMessage(user.id, conversation.id, gif.url, state.replyTo?.id ?? null);
        state.replyTo = null;
        close();
        await load();
      } catch {
        setBusy(button, false);
        toast('GIF gönderilemedi. Tekrar dene.', 'error');
      }
    });

    input.focus();
    await loadGifs();
  }

  container.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'back') onBack();
    if (action === 'info') onInfo();
    if (action === 'gif' && state.isMember) void openGifPicker();
    if (action === 'cancel-reply') {
      state.replyTo = null;
      renderReplyBar();
    }
    if (action === 'msg-menu') {
      const message = state.messages.find((m) => m.id === target.dataset.id);
      if (message) openSheet(message);
    }
    if (action === 'react') {
      try {
        await toggleReaction(target.dataset.id, user.id, target.dataset.emoji);
        await load();
      } catch {
        toast('Tepki eklenemedi.', 'error');
      }
    }
    if (action === 'join') {
      setBusy(target, true);
      try {
        await joinPublicGroup(conversation.id);
        onChanged();
      } catch {
        toast('Gruba katılınamadı.', 'error');
        setBusy(target, false);
      }
    }
  });

  container.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-form]');
    if (!form) return;
    event.preventDefault();
    const input = form.elements.body;
    const body = input.value.trim();
    if (!body) return;
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true);
    try {
      await sendMessage(user.id, conversation.id, body, state.replyTo?.id ?? null);
      input.value = '';
      state.replyTo = null;
      renderReplyBar();
      await load();
    } catch {
      toast('Mesaj gönderilemedi.', 'error');
    } finally {
      setBusy(button, false);
    }
  });

  const unsubscribers = [
    watch(`thread-messages-${conversation.id}`, 'messages', `conversation_id=eq.${conversation.id}`, () => load()),
    watch(`thread-reactions-${conversation.id}`, 'message_reactions', null, () => load()),
    watch(`thread-members-${conversation.id}`, 'conversation_members', `conversation_id=eq.${conversation.id}`, () => load()),
  ];

  void load().then(() => renderFooter());

  return () => {
    state.closed = true;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}
