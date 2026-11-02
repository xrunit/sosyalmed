import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/js/supabase.js';
import {
  deleteMessage,
  fetchMembers,
  fetchMessages,
  fetchReactions,
  joinPublicGroup,
  markRead,
  sendMessage,
  toggleReaction,
  REACTIONS,
} from '@/js/chat.js';
import { watch } from '@/js/data.js';
import { formatTime } from '@/js/ui.js';

function safeGiphyUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      /^media\d*\.giphy\.com$/i.test(url.hostname) &&
      /^\/media\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(gif|webp)$/i.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function ThreadAvatar({ profile }) {
  const name = profile?.name || 'Kullanıcı';
  return <span className="avatar avatar--sm">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : name.slice(0, 1).toUpperCase()}</span>;
}

function makeReactionMap(rows, userId) {
  const result = {};
  for (const row of rows) {
    result[row.message_id] ??= {};
    const current = result[row.message_id][row.emoji] ?? { count: 0, mine: false };
    current.count += 1;
    current.mine ||= row.user_id === userId;
    result[row.message_id][row.emoji] = current;
  }
  return result;
}

export default function ChatThread({ user, item, profiles, onInfo, onBack, onChanged }) {
  const { conversation } = item;
  const isGroup = conversation.kind === 'group';
  const people = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [reactions, setReactions] = useState({});
  const [isMember, setIsMember] = useState(item.isMember);
  const [replyTo, setReplyTo] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [gifBusy, setGifBusy] = useState(false);
  const [gifError, setGifError] = useState('');
  const listRef = useRef(null);
  const nameOf = (id) => people.get(id)?.name || 'Kullanıcı';

  const load = useCallback(async () => {
    try {
      const [nextMessages, nextMembers] = await Promise.all([
        fetchMessages(conversation.id),
        fetchMembers([conversation.id]),
      ]);
      const reactionRows = await fetchReactions(nextMessages.map((message) => message.id));
      setMessages(nextMessages);
      setMembers(nextMembers);
      setReactions(makeReactionMap(reactionRows, user.id));
      const joined = nextMembers.some((member) => member.user_id === user.id);
      setIsMember(joined);
      setError('');
      const readAt = nextMembers.find((member) => member.user_id === user.id)?.last_read_at;
      const latestAt = nextMessages.at(-1)?.created_at;
      if (joined && (!readAt || (latestAt && new Date(readAt) < new Date(latestAt)))) {
        await markRead(conversation.id, user.id);
      }
    } catch (reason) {
      setError(reason?.message || 'Mesajlar yüklenemedi. Tekrar deneyebilirsin.');
    } finally {
      setLoading(false);
    }
  }, [conversation.id, user.id]);

  useEffect(() => {
    void load();
    const stops = [
      watch(`react-thread-messages-${conversation.id}`, 'messages', `conversation_id=eq.${conversation.id}`, () => void load()),
      watch(`react-thread-reactions-${conversation.id}`, 'message_reactions', null, () => void load()),
      watch(`react-thread-members-${conversation.id}`, 'conversation_members', `conversation_id=eq.${conversation.id}`, () => void load()),
    ];
    return () => stops.forEach((stop) => stop());
  }, [conversation.id, load]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const lastMine = [...messages].reverse().find((message) => message.user_id === user.id && message.kind === 'user');
  const peer = members.find((member) => member.user_id !== user.id);
  const sendText = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.body;
    const body = input.value.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      await sendMessage(user.id, conversation.id, body, replyTo?.id ?? null);
      form.reset();
      setReplyTo(null);
      await load();
    } catch (reason) {
      setError(reason?.message || 'Mesaj gönderilemedi.');
    } finally {
      setSending(false);
    }
  };

  const react = async (messageId, emoji) => {
    try {
      await toggleReaction(messageId, user.id, emoji);
      setSelectedMessage(null);
      await load();
    } catch (reason) {
      setError(reason?.message || 'Tepki eklenemedi.');
    }
  };

  const remove = async (message) => {
    if (message.user_id !== user.id || !window.confirm('Bu mesaj herkes için silinsin mi?')) return;
    try {
      await deleteMessage(message.id);
      setSelectedMessage(null);
      await load();
    } catch (reason) {
      setError(reason?.message || 'Mesaj silinemedi.');
    }
  };

  const loadGifs = async (query = '') => {
    setGifBusy(true);
    setGifError('');
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) throw new Error('GIF aramak için giriş yapmalısın.');
      const params = new URLSearchParams({ limit: '18', type: query ? 'search' : 'trending' });
      if (query) params.set('q', query);
      const response = await fetch(`/api/giphy?${params}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'GIF araması başarısız oldu.');
      setGifs(payload.gifs || []);
    } catch (reason) {
      setGifError(reason?.message || 'GIF servisine bağlanılamadı.');
    } finally {
      setGifBusy(false);
    }
  };

  const sendGif = async (gif) => {
    setSending(true);
    try {
      await sendMessage(user.id, conversation.id, gif.url, replyTo?.id ?? null);
      setReplyTo(null);
      setGifOpen(false);
      await load();
    } catch (reason) {
      setGifError(reason?.message || 'GIF gönderilemedi.');
    } finally {
      setSending(false);
    }
  };

  const join = async () => {
    try {
      await joinPublicGroup(conversation.id);
      await load();
      onChanged();
    } catch (reason) {
      setError(reason?.message || 'Gruba katılınamadı.');
    }
  };

  return (
    <>
      <header className="chat-header">
        <button className="icon-btn chat-back" type="button" onClick={onBack} aria-label="Sohbet listesine dön">←</button>
        <button className="thread-title-btn" type="button" onClick={onInfo}>
          <span className="group-avatar">{isGroup ? '#' : <ThreadAvatar profile={people.get(item.peerId)} />}</span>
          <span className="thread-name">{item.title}</span>
          {isGroup && <small className="subtle">{isMember ? 'Grup sohbeti' : 'Herkese açık grup'}</small>}
        </button>
      </header>
      <div className="message-list" ref={listRef}>
        {loading && <div className="state">Mesajlar yükleniyor…</div>}
        {!loading && messages.length === 0 && <div className="state">Henüz mesaj yok. İlk mesajı sen yaz.</div>}
        {messages.map((message) => {
          if (message.kind === 'system') return <div className="msg-system" key={message.id}>{message.body}</div>;
          const mine = message.user_id === user.id;
          const author = people.get(message.user_id);
          const parent = message.reply_to ? messages.find((candidate) => candidate.id === message.reply_to) : null;
          const gifUrl = safeGiphyUrl(message.body);
          const ownReactions = Object.entries(reactions[message.id] || {});
          const seen = mine && lastMine?.id === message.id && peer?.last_read_at && new Date(peer.last_read_at) >= new Date(message.created_at);
          return (
            <div className={`msg${mine ? ' msg--mine' : ''}`} key={message.id}>
              {!mine && <div className="msg-avatar"><ThreadAvatar profile={author} /></div>}
              <div className="msg-main">
                {!mine && isGroup && <span className="msg-name">{nameOf(message.user_id)}</span>}
                <div className="bubble-wrap">
                  <button className="bubble-button" type="button" onClick={() => setSelectedMessage(message)} aria-label="Mesaj seçenekleri">
                    <span className={`bubble${mine ? ' bubble--mine' : ''}${gifUrl ? ' bubble--gif' : ''}`}>
                      {message.reply_to && <span className="msg-quote"><strong>{parent ? nameOf(parent.user_id) : ''}</strong><span>{parent?.body || 'Silinmiş mesaj'}</span></span>}
                      {gifUrl ? <img className="message-gif" src={gifUrl} alt="GIF" loading="lazy" referrerPolicy="no-referrer" /> : message.body}
                    </span>
                  </button>
                  {ownReactions.length > 0 && <div className="msg-reactions">{ownReactions.map(([emoji, value]) => <button className={`reaction-chip${value.mine ? ' is-mine' : ''}`} type="button" key={emoji} onClick={() => void react(message.id, emoji)}>{emoji} {value.count}</button>)}</div>}
                </div>
                {seen && <span className="seen-label">Görüldü</span>}
                <span className="msg-meta">{formatTime(message.created_at)}</span>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="error-banner chat-error" role="alert">{error}</p>}
      <footer className="thread-footer">
        {!isMember ? (
          <div className="composer-notice"><span>Bu gruba katılarak mesaj gönderebilirsin.</span><button className="btn btn--primary btn--sm" type="button" onClick={() => void join()}>Gruba katıl</button></div>
        ) : <>
          {replyTo && <div className="reply-bar"><span>{nameOf(replyTo.user_id)} kişisine yanıt veriyorsun</span><button className="icon-btn" type="button" onClick={() => setReplyTo(null)} aria-label="Yanıtı iptal et">×</button></div>}
          <form className="composer-bar" onSubmit={sendText}>
            <button className="gif-button" type="button" onClick={() => { setGifOpen(true); void loadGifs(); }}>GIF</button>
            <input className="field" name="body" maxLength="1000" placeholder="Bir mesaj yaz…" aria-label="Mesaj" />
            <button className="send-btn" type="submit" disabled={sending} aria-label="Gönder">➤</button>
          </form>
        </>}
      </footer>
      {selectedMessage && <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedMessage(null)}><section className="sheet" role="dialog" aria-modal="true" aria-label="Mesaj seçenekleri"><div className="sheet-reactions">{REACTIONS.map((emoji) => <button className="reaction-chip" type="button" key={emoji} onClick={() => void react(selectedMessage.id, emoji)}>{emoji}</button>)}</div><button type="button" onClick={() => { setReplyTo(selectedMessage); setSelectedMessage(null); }}>Yanıtla</button>{selectedMessage.user_id === user.id && <button className="danger" type="button" onClick={() => void remove(selectedMessage)}>Herkes için sil</button>}<button type="button" onClick={() => setSelectedMessage(null)}>Vazgeç</button></section></div>}
      {gifOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setGifOpen(false)}><section className="modal" role="dialog" aria-modal="true" aria-label="GIF ara"><header className="modal-header"><h2>GIF ara</h2><button className="icon-btn" type="button" onClick={() => setGifOpen(false)} aria-label="Kapat">×</button></header><div className="modal-body"><form className="gif-search" onSubmit={(event) => { event.preventDefault(); const query = gifQuery.trim(); if (query.length < 2) { setGifError('Arama için en az 2 karakter yaz.'); return; } void loadGifs(query); }}><input className="field" value={gifQuery} onChange={(event) => setGifQuery(event.target.value)} maxLength="80" placeholder="GIF ara" aria-label="GIF ara" /><button className="btn btn--primary" type="submit" disabled={gifBusy}>Ara</button></form>{gifBusy && <p className="gif-status muted">GIF'ler yükleniyor…</p>}{gifError && <p className="error-text">{gifError}</p>}<div className="gif-grid">{gifs.map((gif) => <button className="gif-result" type="button" key={gif.id} onClick={() => void sendGif(gif)} disabled={sending}><img src={gif.preview} alt={gif.title} loading="lazy" referrerPolicy="no-referrer" /></button>)}</div><p className="gif-attribution muted">Powered by <a href="https://giphy.com" target="_blank" rel="noreferrer">GIPHY</a></p></div></section></div>}
    </>
  );
}
