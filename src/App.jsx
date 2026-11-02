import React, { useEffect, useMemo, useState } from 'react';
import ChatThread from '@/ChatThread.jsx';
import { supabase } from '@/js/supabase.js';
import {
  countUnreadNotifications,
  ensureProfile,
  fetchFollows,
  fetchNotifications,
  fetchProfile,
  fetchProfiles,
  markNotificationsRead,
  signIn,
  signInWithGoogle,
  signOut,
  signUp,
  unfollowUser,
  followUser,
  updateProfile,
  watch,
} from '@/js/data.js';
import {
  addGroupMembers,
  createGroup,
  fetchMembers,
  fetchMyConversations,
  fetchPublicGroups,
  leaveGroup,
  openDm,
  removeGroupMember,
  renameGroup,
  setGroupMemberRole,
  setGroupPublic,
} from '@/js/chat.js';
import { acceptedFriendIds, fetchFriendships, friendAction, friendStatus } from '@/js/friends.js';
import {
  addComment,
  createSocialPost,
  deleteSocialPost,
  fetchComments,
  fetchSocialPosts,
  removeMedia,
  searchSocial,
  togglePostLike,
  toggleSavedPost,
  uploadMedia,
} from '@/social-data.js';

const NAV_ITEMS = [
  ['feed', 'Akış', '⌂'],
  ['explore', 'Keşfet', '⌕'],
  ['reels', 'Reels', '▣'],
  ['messages', 'Mesajlar', '✉'],
  ['notifications', 'Bildirimler', '♡'],
  ['community', 'Topluluk', '♧'],
  ['saved', 'Kaydedilenler', '▤'],
  ['profile', 'Profil', '◉'],
];

function routeFromLocation() {
  const url = new URL(window.location.href);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/messages' || path === '/messages.html') return 'messages';
  if (path === '/community' || path === '/community.html') return 'community';
  if (path === '/profile' || path === '/profile.html') return 'profile';
  return url.searchParams.get('page') || 'feed';
}

function Avatar({ profile, size = 'md' }) {
  const name = profile?.name || 'Kullanıcı';
  return (
    <span className={`avatar avatar-${size}`} aria-label={name}>
      {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function AuthView() {
  const [mode, setMode] = useState('login');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.email.value.trim();
    const password = form.password.value;
    const name = form.name?.value.trim();
    if (!email || !password || (mode === 'signup' && !name)) {
      setError('Lütfen tüm alanları doldur.');
      return;
    }
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalı.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'login') await signIn(email, password);
      else {
        const signedIn = await signUp(email, password, name);
        if (!signedIn) {
          setMode('login');
          setNotice('Hesabın oluşturuldu. Şimdi giriş yapabilirsin.');
        }
      }
    } catch (reason) {
      setError(reason?.message || 'İşlem tamamlanamadı. Tekrar dene.');
    } finally {
      setBusy(false);
    }
  };
  const continueWithGoogle = async () => {
    setGoogleBusy(true);
    setError('');
    try { await signInWithGoogle(); }
    catch (reason) { setError(reason?.message || 'Google girişi başlatılamadı. Supabase OAuth ayarlarını kontrol et.'); }
    finally { setGoogleBusy(false); }
  };

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <a className="wordmark" href="/">akım<span>.</span></a>
        <p className="eyebrow">KENDİ AKIŞIN, KENDİ SESİN</p>
        <h1>{mode === 'login' ? 'Yeniden hoş geldin.' : 'Akıma katıl.'}</h1>
        <p className="subtle">{mode === 'login' ? 'İnsanların paylaşımlarını yakala.' : 'Paylaş, keşfet ve bağlantıda kal.'}</p>
        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">Giriş</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')} type="button">Kayıt ol</button>
        </div>
        <button className="button button-outline button-wide" onClick={() => void continueWithGoogle()} disabled={googleBusy} type="button">
          {googleBusy ? 'Google açılıyor…' : 'Google ile devam et'}
        </button>
        <div className="divider"><span>veya e-posta ile</span></div>
        <form className="form-stack" onSubmit={submit}>
          {mode === 'signup' && <input className="input" name="name" autoComplete="nickname" maxLength="24" placeholder="Görünen ad" required />}
          <input className="input" name="email" type="email" autoComplete="email" placeholder="E-posta" required />
          <input className="input" name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength="6" placeholder="Şifre" required />
          {error && <p className="error-text" role="alert">{error}</p>}
          {notice && <p className="success-text" role="status">{notice}</p>}
          <button className="button button-primary button-wide" disabled={busy} type="submit">
            {busy ? 'Bekle…' : mode === 'login' ? 'Giriş yap' : 'Hesap oluştur'}
          </button>
        </form>
        <p className="auth-legal">Devam ederek topluluk kurallarımızı kabul etmiş olursun.</p>
      </section>
    </main>
  );
}

function Sidebar({ page, profile, unread }) {
  return (
    <aside className="sidebar">
      <a className="wordmark" href="/">akım<span>.</span></a>
      <form className="nav-search" action="/" method="get" role="search">
        <input type="hidden" name="page" value="explore" />
        <input className="input" type="search" name="q" placeholder="Kişi veya gönderi ara…" aria-label="Kişi veya gönderi ara" />
      </form>
      <nav className="nav-list" aria-label="Ana menü">
        {NAV_ITEMS.map(([key, label, glyph]) => {
          const href = key === 'profile' ? '/profile.html' : key === 'community' ? '/community.html' : key === 'messages' ? '/messages.html' : `/?page=${key}`;
          return (
            <a className={`nav-link${page === key ? ' is-active' : ''}`} href={href} key={key}>
              <span className="nav-glyph" aria-hidden="true">{glyph}</span>
              <span>{label}</span>
              {key === 'notifications' && unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
            </a>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <a className="profile-link" href="/profile.html"><Avatar profile={profile} size="sm" /><span>{profile.name}</span></a>
        <button className="nav-link signout" type="button" onClick={() => void signOut()}>↪ <span>Çıkış yap</span></button>
      </div>
    </aside>
  );
}

function TopBar({ profile, unread }) {
  return (
    <header className="mobile-header">
      <a className="wordmark" href="/">akım<span>.</span></a>
      <div className="mobile-actions">
        <a className="icon-link" href="/?page=notifications" aria-label={`Bildirimler${unread ? `, ${unread} okunmamış` : ''}`}>♡{unread > 0 && <i />}</a>
        <a href="/profile.html" aria-label="Profil"><Avatar profile={profile} size="sm" /></a>
      </div>
    </header>
  );
}

function Shell({ page, profile, unread, children }) {
  return (
    <div className="app-shell">
      <TopBar profile={profile} unread={unread} />
      <Sidebar page={page} profile={profile} unread={unread} />
      <main className={`page-content page-${page}`}>{children}</main>
      <nav className="mobile-nav" aria-label="Mobil menü">
        {NAV_ITEMS.filter(([key]) => ['feed', 'explore', 'reels', 'messages', 'community', 'profile'].includes(key)).map(([key, , glyph]) => {
          const href = key === 'profile' ? '/profile.html' : key === 'messages' ? '/messages.html' : key === 'community' ? '/community.html' : `/?page=${key}`;
          return <a className={page === key ? 'is-active' : ''} href={href} key={key} aria-label={key}><span>{glyph}</span></a>;
        })}
      </nav>
    </div>
  );
}

function SectionTitle({ kicker, title, action }) {
  return <div className="section-title"><div>{kicker && <p className="eyebrow">{kicker}</p>}<h1>{title}</h1></div>{action}</div>;
}

function PostCard({ post, user, onRefresh }) {
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [saved, setSaved] = useState(post.saved_by_me);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const doLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((count) => count + (next ? 1 : -1));
    try {
      await togglePostLike(post.id, user.id, liked);
    } catch (reason) {
      setLiked(liked);
      setLikeCount((count) => count + (liked ? 1 : -1));
      setError(reason?.message || 'Beğeni kaydedilemedi.');
    }
  };

  const openComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next && !commentsLoaded) {
      try {
        setComments(await fetchComments(post.id));
        setCommentsLoaded(true);
      } catch (reason) {
        setError(reason?.message || 'Yorumlar yüklenemedi.');
      }
    }
  };

  const submitComment = async (event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.comment;
    const body = input.value.trim();
    if (!body) return;
    try {
      await addComment(post.id, user.id, body);
      input.value = '';
      setComments(await fetchComments(post.id));
      setCommentsLoaded(true);
    } catch (reason) {
      setError(reason?.message || 'Yorum gönderilemedi.');
    }
  };

  const toggleSave = async () => {
    const next = !saved;
    setSaved(next);
    try {
      await toggleSavedPost(post.id, user.id, saved);
      onRefresh?.();
    } catch (reason) {
      setSaved(saved);
      setError(reason?.message || 'Gönderi kaydedilemedi.');
    }
  };

  const removePost = async () => {
    if (!window.confirm('Bu gönderi silinsin mi?')) return;
    try {
      const cleanupError = await deleteSocialPost(post);
      if (cleanupError) window.alert(`Gönderi silindi, ancak medya dosyası temizlenemedi: ${cleanupError}`);
      onRefresh?.();
    } catch (reason) {
      setError(reason?.message || 'Gönderi silinemedi.');
    }
  };
  const copyPostLink = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/?page=${post.post_type === 'reel' ? 'reels' : 'feed'}#post-${post.id}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (reason) {
      setError(reason?.message || 'Gönderi bağlantısı kopyalanamadı.');
    }
  };

  const profileHref = `/profile.html?id=${encodeURIComponent(post.user_id)}`;
  return (
    <article className="post-card" id={`post-${post.id}`}>
      <header className="post-header">
        <a className="author-link" href={profileHref}><Avatar profile={post.author} size="sm" /><span><strong>{post.author?.name || 'Kullanıcı'}</strong><small>{new Date(post.created_at).toLocaleString('tr-TR')}</small></span></a>
        <div className="post-header-actions">
          {post.post_type === 'reel' && <span className="pill">REEL</span>}
          {post.user_id === user.id && <button className="icon-button" onClick={() => void removePost()} aria-label="Gönderiyi sil" type="button">•••</button>}
        </div>
      </header>
      {post.media_url && (post.media_type === 'video'
        ? <video className={`post-media${post.post_type === 'reel' ? ' post-media-reel' : ''}`} src={post.media_url} controls playsInline preload="metadata" />
        : <img className="post-media" src={post.media_url} alt={post.body || 'Paylaşılan görsel'} loading="lazy" />)}
      <div className="post-actions">
        <div>
          <button className={`icon-button action-heart${liked ? ' is-liked' : ''}`} onClick={() => void doLike()} type="button" aria-label={liked ? 'Beğeniyi kaldır' : 'Beğen'}>{liked ? '♥' : '♡'}</button>
          <button className="icon-button" onClick={() => void openComments()} type="button" aria-label="Yorumlar">◯</button>
          <button className="icon-button" onClick={() => void copyPostLink()} type="button" aria-label="Gönderi bağlantısını kopyala" title={copied ? 'Bağlantı kopyalandı' : 'Bağlantıyı kopyala'}>{copied ? '✓' : '↗'}</button>
        </div>
        <button className={`icon-button${saved ? ' is-saved' : ''}`} onClick={() => void toggleSave()} type="button" aria-label={saved ? 'Kaydedileni kaldır' : 'Kaydet'}>{saved ? '▣' : '▢'}</button>
      </div>
      <div className="post-copy">
        <strong>{likeCount.toLocaleString('tr-TR')} beğeni</strong>
        {post.body && <p><a href={profileHref}><strong>{post.author?.name || 'Kullanıcı'}</strong></a> {post.body}</p>}
        <button className="text-button" onClick={() => void openComments()} type="button">Yorumları {showComments ? 'gizle' : 'gör'}</button>
      </div>
      {showComments && <section className="comment-list">
        {comments.map((comment) => <p key={comment.id}><a href={`/profile.html?id=${comment.user_id}`}><strong>{comment.author?.name || 'Kullanıcı'}</strong></a> {comment.body}</p>)}
        <form className="comment-form" onSubmit={submitComment}><input className="input" name="comment" maxLength="1000" placeholder="Yorum ekle…" /><button className="text-button" type="submit">Paylaş</button></form>
      </section>}
      {error && <p className="error-text post-error" role="alert">{error}</p>}
    </article>
  );
}

function PostList({ posts, user, onRefresh, emptyText = 'Henüz paylaşım yok.' }) {
  if (!posts.length) return <div className="empty-panel">{emptyText}</div>;
  return <div className="post-list">{posts.map((post) => <PostCard key={post.id} post={post} user={user} onRefresh={onRefresh} />)}</div>;
}

function FeedPage({ user, profile, page }) {
  const [posts, setPosts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [postType, setPostType] = useState(page === 'reels' ? 'reel' : 'post');
  const [reload, setReload] = useState(0);
  const load = async () => {
    setError('');
    try {
      setPosts(await fetchSocialPosts({ postType: page === 'reels' ? 'reel' : undefined, viewerId: user.id }));
    } catch (reason) {
      setError(reason?.message || 'Akış yüklenemedi. Supabase migration ayarlarını kontrol et.');
    }
  };
  useEffect(() => { void load(); }, [page, user.id, reload]);
  useEffect(() => watch(`react-feed-${user.id}`, 'posts', null, () => setReload((n) => n + 1)), [user.id]);

  const publish = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = form.elements.body.value.trim();
    if (!body && !mediaFile) return;
    if (postType === 'reel' && (!mediaFile || !mediaFile.type.startsWith('video/'))) {
      setError('Reels için bir video dosyası seçmelisin.');
      return;
    }
    setBusy(true);
    setError('');
    let uploaded;
    try {
      if (mediaFile) uploaded = await uploadMedia(mediaFile, user.id);
      await createSocialPost(user.id, body, uploaded, postType);
      form.reset();
      setMediaFile(null);
      setPostType('post');
      setReload((n) => n + 1);
    } catch (reason) {
      let message = reason?.message || 'Gönderi oluşturulamadı.';
      if (uploaded) {
        try { await removeMedia(uploaded.path); }
        catch (cleanupError) { message += ` Medya temizlenemedi: ${cleanupError?.message || 'bilinmeyen hata'}`; }
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="feed-grid">
      <section className="feed-main">
        <SectionTitle kicker={page === 'reels' ? 'KISA VİDEOLAR' : 'SENİN ÇEVREN'} title={page === 'reels' ? 'Reels' : 'Akış'} action={<a className="button button-outline" href="/?page=explore">Keşfet ↗</a>} />
        {page !== 'reels' && <form className="composer-card" onSubmit={publish}>
          <div className="composer-top"><Avatar profile={profile} /><textarea name="body" maxLength="2000" rows="2" placeholder="Aklından ne geçiyor?" /></div>
          {mediaFile && <p className="file-selected">{mediaFile.name} <button type="button" className="text-button" onClick={() => setMediaFile(null)}>Kaldır</button></p>}
          <div className="composer-bottom">
            <label className="upload-label">＋ Medya ekle<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={(event) => setMediaFile(event.target.files?.[0] || null)} /></label>
            <select className="select" value={postType} onChange={(event) => setPostType(event.target.value)} aria-label="Gönderi türü"><option value="post">Gönderi</option><option value="reel">Reels</option></select>
            <button className="button button-primary" disabled={busy} type="submit">{busy ? 'Yükleniyor…' : 'Paylaş'}</button>
          </div>
          <p className="subtle tiny">Görsel ve video dosyaları en fazla 30 MB olabilir.</p>
        </form>}
        {error && <p className="error-banner" role="alert">{error}</p>}
        <PostList posts={posts} user={user} onRefresh={() => setReload((n) => n + 1)} emptyText={page === 'reels' ? 'Henüz Reels paylaşılmamış.' : 'Akışta henüz gönderi yok. İlk paylaşımı sen yap.'} />
      </section>
      <aside className="feed-aside">
        <div className="suggest-card">
          <a className="author-link" href="/profile.html"><Avatar profile={profile} /><span><strong>{profile.name}</strong><small>Senin profilin</small></span></a>
          <p>Paylaşımlarını ve topluluğunu tek bir akışta keşfet.</p>
          <a className="text-link" href="/community.html">Topluluğu keşfet →</a>
        </div>
        <div className="aside-note"><span className="eyebrow">AKIM / 2026</span><p>Fikirlerini paylaş. İnsanlarla bağlantıda kal.</p></div>
      </aside>
    </div>
  );
}

function ExplorePage({ user }) {
  const [query, setQuery] = useState(new URLSearchParams(location.search).get('q') || '');
  const [results, setResults] = useState({ profiles: [], posts: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!query.trim()) { setResults({ profiles: [], posts: [] }); return; }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try { setResults(await searchSocial(query)); setError(''); }
      catch (reason) { setError(reason?.message || 'Arama tamamlanamadı.'); }
      finally { setLoading(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  return (
    <section className="content-column">
      <SectionTitle kicker="YENİ ŞEYLER BUL" title="Keşfet" />
      <input className="input search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Kişi veya gönderi ara…" autoFocus />
      {error && <p className="error-banner">{error}</p>}
      {loading && <p className="subtle">Aranıyor…</p>}
      {results.profiles.length > 0 && <section className="explore-section"><h2>Kişiler</h2><div className="people-grid">{results.profiles.map((person) => <a className="person-card" key={person.id} href={`/profile.html?id=${person.id}`}><Avatar profile={person} /><strong>{person.name}</strong><small>{person.bio || 'Akım üyesi'}</small></a>)}</div></section>}
      {results.posts.length > 0 && <section className="explore-section"><h2>Gönderiler</h2><PostList posts={results.posts.map((post) => ({ ...post, like_count: 0, liked_by_me: false, saved_by_me: false }))} user={user} emptyText="" /></section>}
      {!!query.trim() && !loading && !results.profiles.length && !results.posts.length && !error && <div className="empty-panel">Sonuç bulunamadı.</div>}
      {!query.trim() && <div className="empty-panel">Aramak için bir isim veya kelime yaz.</div>}
    </section>
  );
}

function SavedPage({ user }) {
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    fetchSocialPosts({ savedBy: user.id, viewerId: user.id }).then(setPosts).catch((reason) => setError(reason?.message || 'Kaydedilenler yüklenemedi.'));
  }, [user.id, reload]);
  return <section className="content-column"><SectionTitle kicker="SANA ÖZEL" title="Kaydedilenler" />{error && <p className="error-banner">{error}</p>}<PostList posts={posts} user={user} onRefresh={() => setReload((n) => n + 1)} emptyText="Henüz kaydedilmiş gönderin yok." /></section>;
}

function NotificationsPage({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([fetchNotifications(user.id), fetchProfiles()]).then(async ([rows, people]) => {
      if (!active) return;
      setNotifications(rows);
      setProfiles(people);
      await markNotificationsRead(user.id);
    }).catch((reason) => setError(reason?.message || 'Bildirimler yüklenemedi.'));
    return () => { active = false; };
  }, [user.id]);
  const people = useMemo(() => new Map(profiles.map((person) => [person.id, person])), [profiles]);
  return (
    <section className="content-column">
      <SectionTitle kicker="AKIMDA NELER OLUYOR" title="Bildirimler" />
      {error && <p className="error-banner">{error}</p>}
      <div className="notice-list">{notifications.map((item) => {
        const actor = people.get(item.actor_id);
        const text = {
          follow: 'seni takip etmeye başladı',
          friend_request: 'sana arkadaşlık isteği gönderdi',
          friend_accept: 'arkadaşlık isteğini kabul etti',
          group_add: 'seni bir gruba ekledi',
          like: 'gönderini beğendi',
          comment: 'gönderine yorum yaptı',
        }[item.type] || 'seninle etkileşime geçti';
        return <a className={`notice-row${item.read ? '' : ' is-new'}`} href={`/profile.html?id=${item.actor_id}`} key={item.id}><Avatar profile={actor} size="sm" /><span><strong>{actor?.name || 'Bir kullanıcı'}</strong> {text}<small>{new Date(item.created_at).toLocaleString('tr-TR')}</small></span><i className={`notice-dot${item.read ? ' is-read' : ''}`} /></a>;
      })}</div>
      {!notifications.length && !error && <div className="empty-panel">Şimdilik yeni bir bildirimin yok.</div>}
    </section>
  );
}

function CommunityPage({ user }) {
  const [profiles, setProfiles] = useState([]);
  const [follows, setFollows] = useState([]);
  const [friendships, setFriendships] = useState([]);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    Promise.all([fetchProfiles(), fetchFollows(), fetchFriendships()]).then(([people, edges, friends]) => {
      setProfiles(people.filter((person) => person.id !== user.id));
      setFollows(edges);
      setFriendships(friends);
    }).catch((reason) => setError(reason?.message || 'Topluluk yüklenemedi.'));
  }, [user.id, reload]);
  const act = async (profile, type) => {
    try {
      if (type === 'follow') {
        const exists = follows.some((edge) => edge.follower_id === user.id && edge.following_id === profile.id);
        if (exists) await unfollowUser(user.id, profile.id); else await followUser(user.id, profile.id);
      } else {
        const state = friendStatus(friendships, user.id, profile.id).state;
        const next = { none: 'request', sent: 'cancel', received: 'accept', friends: 'remove' }[state];
        await friendAction(profile.id, next);
      }
      setReload((n) => n + 1);
    } catch (reason) { setError(reason?.message || 'İşlem tamamlanamadı.'); }
  };
  const requests = friendships.filter((row) => row.status === 'pending' && row.requested_by !== user.id);
  return (
    <section className="content-column">
      <SectionTitle kicker="BAĞLANTILARINI BÜYÜT" title="Topluluk" />
      {error && <p className="error-banner">{error}</p>}
      {requests.length > 0 && <div className="request-panel"><h2>Arkadaşlık istekleri <span className="pill">{requests.length}</span></h2>{requests.map((row) => {
        const otherId = row.user_low === user.id ? row.user_high : row.user_low;
        const person = profiles.find((item) => item.id === otherId);
        return <div className="person-row" key={otherId}><a className="author-link" href={`/profile.html?id=${otherId}`}><Avatar profile={person} size="sm" /><strong>{person?.name || 'Kullanıcı'}</strong></a><button className="button button-primary button-small" onClick={() => person && void act(person, 'friend')}>Kabul et</button></div>;
      })}</div>}
      <div className="people-grid">{profiles.map((person) => {
        const following = follows.some((edge) => edge.follower_id === user.id && edge.following_id === person.id);
        const friend = friendStatus(friendships, user.id, person.id);
        const friendLabel = { none: 'Arkadaş ekle', sent: 'İstek gönderildi', received: 'Kabul et', friends: 'Arkadaşsınız' }[friend.state];
        return <article className="person-card" key={person.id}><a href={`/profile.html?id=${person.id}`}><Avatar profile={person} /><strong>{person.name}</strong><small>{person.bio || 'Akım üyesi'}</small></a><div className="person-actions"><button className={`button button-small ${following ? 'button-outline' : 'button-primary'}`} onClick={() => void act(person, 'follow')}>{following ? 'Takiptesin' : 'Takip et'}</button><button className="button button-outline button-small" onClick={() => void act(person, 'friend')}>{friendLabel}</button></div></article>;
      })}</div>
      {!profiles.length && !error && <div className="empty-panel">Henüz başka üye yok.</div>}
    </section>
  );
}

function ProfilePage({ user }) {
  const targetId = new URLSearchParams(location.search).get('id') || user.id;
  const isOwn = targetId === user.id;
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [follows, setFollows] = useState([]);
  const [friendships, setFriendships] = useState([]);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    Promise.all([fetchProfile(targetId), fetchSocialPosts({ userId: targetId, viewerId: user.id }), fetchFollows(), fetchFriendships()])
      .then(([person, entries, edges, friends]) => { setProfile(person); setPosts(entries); setFollows(edges); setFriendships(friends); })
      .catch((reason) => setError(reason?.message || 'Profil yüklenemedi.'));
  }, [targetId, user.id, reload]);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [saving, setSaving] = useState(false);
  if (error) return <section className="content-column"><p className="error-banner">{error}</p></section>;
  if (!profile) return <div className="empty-panel">Profil yükleniyor…</div>;
  const followerCount = follows.filter((edge) => edge.following_id === targetId).length;
  const followingCount = follows.filter((edge) => edge.follower_id === targetId).length;
  const following = follows.some((edge) => edge.follower_id === user.id && edge.following_id === targetId);
  const friend = friendStatus(friendships, user.id, targetId);
  const startEdit = () => { setEditName(profile.name); setEditBio(profile.bio || ''); setAvatarFile(null); };
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    let uploadedAvatar;
    try {
      let avatarUrl = profile.avatar_url;
      uploadedAvatar = avatarFile ? await uploadMedia(avatarFile, user.id) : null;
      if (uploadedAvatar) avatarUrl = uploadedAvatar.url;
      await updateProfile(user.id, { name: editName.trim(), bio: editBio.trim(), color: profile.color, avatar_url: avatarUrl });
      setReload((n) => n + 1);
      document.getElementById('profile-edit')?.close();
    } catch (reason) {
      let message = reason?.message || 'Profil kaydedilemedi.';
      if (uploadedAvatar) {
        try { await removeMedia(uploadedAvatar.path); }
        catch (cleanupError) { message += ` Fotoğraf temizlenemedi: ${cleanupError?.message || 'bilinmeyen hata'}`; }
      }
      setError(message);
    }
    finally { setSaving(false); }
  };
  const changeFollow = async () => {
    try {
      if (following) await unfollowUser(user.id, targetId); else await followUser(user.id, targetId);
      setReload((n) => n + 1);
    } catch (reason) { setError(reason?.message || 'Takip işlemi başarısız oldu.'); }
  };
  const changeFriend = async () => {
    const action = { none: 'request', sent: 'cancel', received: 'accept', friends: 'remove' }[friend.state];
    try { await friendAction(targetId, action); setReload((n) => n + 1); }
    catch (reason) { setError(reason?.message || 'Arkadaşlık işlemi başarısız oldu.'); }
  };
  return (
    <section className="profile-page content-column">
      <div className="profile-summary">
        <Avatar profile={profile} size="xl" />
        <div className="profile-details">
          <div className="profile-title"><h1>{profile.name}</h1>{isOwn
            ? <><button className="button button-outline button-small" onClick={() => { startEdit(); document.getElementById('profile-edit')?.showModal(); }}>Profili düzenle</button><a className="button button-outline button-small" href="/?page=saved">Kaydedilenler</a></>
            : <><button className={`button button-small ${following ? 'button-outline' : 'button-primary'}`} onClick={() => void changeFollow()}>{following ? 'Takiptesin' : 'Takip et'}</button><button className="button button-outline button-small" onClick={() => void changeFriend()}>{({ none: 'Arkadaş ekle', sent: 'İstek gönderildi', received: 'Kabul et', friends: 'Arkadaşsınız' })[friend.state]}</button></>}
          </div>
          <div className="profile-stats"><span><strong>{posts.length}</strong> gönderi</span><span><strong>{followerCount}</strong> takipçi</span><span><strong>{followingCount}</strong> takip</span></div>
          <p className="profile-bio">{profile.bio || 'Henüz biyografi eklenmemiş.'}</p>
          <p className="subtle">@{profile.name.toLowerCase().replace(/\s+/g, '')}</p>
        </div>
      </div>
      <div className="profile-posts-head"><span>GÖNDERİLER</span></div>
      <div className="profile-grid">{posts.map((post) => <a href={`/?page=${post.post_type === 'reel' ? 'reels' : 'feed'}#${post.id}`} key={post.id}>{post.media_url ? post.media_type === 'video' ? <video src={post.media_url} muted /> : <img src={post.media_url} alt={post.body || 'Gönderi'} /> : <div className="text-post-tile">{post.body}</div>}</a>)}</div>
      {!posts.length && <div className="empty-panel">Henüz gönderi paylaşılmamış.</div>}
      {isOwn && <dialog className="edit-dialog" id="profile-edit"><form onSubmit={save}><h2>Profili düzenle</h2><label>Görünen ad<input className="input" value={editName} maxLength="24" onChange={(event) => setEditName(event.target.value)} required /></label><label>Biyografi<textarea className="input" rows="4" maxLength="160" value={editBio} onChange={(event) => setEditBio(event.target.value)} /></label><label>Profil fotoğrafı<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setAvatarFile(event.target.files?.[0] || null)} /></label><div className="dialog-actions"><button className="button button-outline" type="button" onClick={() => document.getElementById('profile-edit')?.close()}>İptal</button><button className="button button-primary" disabled={saving} type="submit">{saving ? 'Kaydediliyor…' : 'Kaydet'}</button></div></form></dialog>}
    </section>
  );
}

function GroupInfo({ item, profiles, user, onClose, onChanged }) {
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const profileMap = useMemo(() => new Map(profiles.map((person) => [person.id, person])), [profiles]);
  const reload = async () => {
    try { setMembers(await fetchMembers([item.conversation.id])); }
    catch (reason) { setError(reason?.message || 'Grup üyeleri yüklenemedi.'); }
  };
  useEffect(() => { void reload(); }, [item.conversation.id]);
  const run = async (action, peerId) => {
    try {
      if (action === 'leave') {
        if (!window.confirm('Gruptan ayrılmak istiyor musun?')) return;
        await leaveGroup(item.conversation.id);
        onClose();
        await onChanged();
      } else if (action === 'visibility') await setGroupPublic(item.conversation.id, !item.conversation.is_public);
      else if (action === 'role') {
        const member = members.find((entry) => entry.user_id === peerId);
        await setGroupMemberRole(item.conversation.id, peerId, member?.role === 'admin' ? 'member' : 'admin');
      } else if (action === 'remove') await removeGroupMember(item.conversation.id, peerId);
      else if (action === 'rename') {
        const name = window.prompt('Yeni grup adı', item.conversation.name);
        if (name?.trim()) await renameGroup(item.conversation.id, name.trim());
      } else if (action === 'add') {
        const name = window.prompt('Karşılıklı takip ettiğin kişinin adını yaz.');
        const target = profiles.find((person) => person.name.toLowerCase() === name?.trim().toLowerCase());
        if (!target) throw new Error('Bu isimde bir üye bulunamadı.');
        await addGroupMembers(item.conversation.id, [target.id]);
      }
      await reload();
      await onChanged();
    } catch (reason) { setError(reason?.message || 'Grup işlemi tamamlanamadı.'); }
  };
  const myRole = members.find((member) => member.user_id === user.id)?.role;
  const canManage = myRole === 'owner' || myRole === 'admin';
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card"><button className="icon-button modal-close" type="button" onClick={onClose}>×</button><p className="eyebrow">SOHBET BİLGİSİ</p><h2>{item.conversation.name || item.title}</h2><p className="subtle">{item.conversation.is_public ? 'Herkese açık grup' : 'Özel grup'} · {members.length} üye</p>{error && <p className="error-text">{error}</p>}<div className="member-list">{members.map((member) => { const person = profileMap.get(member.user_id); return <div className="person-row" key={member.user_id}><a className="author-link" href={`/profile.html?id=${member.user_id}`}><Avatar profile={person} size="sm" /><span><strong>{person?.name || 'Kullanıcı'}</strong><small>{member.role === 'owner' ? 'Sahip' : member.role === 'admin' ? 'Yönetici' : 'Üye'}</small></span></a>{canManage && member.user_id !== user.id && <div className="inline-actions">{myRole === 'owner' && <button className="text-button" type="button" onClick={() => void run('role', member.user_id)}>{member.role === 'admin' ? 'Üye yap' : 'Yönetici yap'}</button>}<button className="text-button danger" type="button" onClick={() => void run('remove', member.user_id)}>Çıkar</button></div>}</div>; })}</div>{item.isMember && <div className="modal-actions">{canManage && <><button className="button button-outline" type="button" onClick={() => void run('rename')}>Adı değiştir</button><button className="button button-outline" type="button" onClick={() => void run('add')}>Üye ekle</button></>}{myRole === 'owner' && <button className="button button-outline" type="button" onClick={() => void run('visibility')}>{item.conversation.is_public ? 'Gizliye al' : 'Herkese aç'}</button>}<button className="button button-outline danger" type="button" onClick={() => void run('leave')}>Gruptan ayrıl</button></div>}</section></div>;
}

function MessagesPage({ user, profile }) {
  const [items, setItems] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [infoItem, setInfoItem] = useState(null);
  const activeId = new URLSearchParams(location.search).get('c');

  const load = async () => {
    try {
      const [mine, publicGroups, people] = await Promise.all([fetchMyConversations(user.id), fetchPublicGroups(), fetchProfiles()]);
      const memberRows = await fetchMembers(mine.filter(({ conversation }) => conversation?.kind === 'dm').map(({ conversation }) => conversation.id));
      const peopleById = new Map(people.map((person) => [person.id, person]));
      const membershipMap = new Map(mine.filter(({ conversation }) => conversation?.kind === 'group').map(({ conversation, role }) => [conversation.id, { conversation, role }]));
      const groups = new Map(publicGroups.map((conversation) => [conversation.id, conversation]));
      for (const { conversation } of membershipMap.values()) groups.set(conversation.id, conversation);
      const next = [...groups.values()].map((conversation) => ({ conversation, isMember: membershipMap.has(conversation.id), role: membershipMap.get(conversation.id)?.role ?? null, title: conversation.name || 'Grup' }));
      for (const { conversation } of mine.filter(({ conversation }) => conversation?.kind === 'dm')) {
        const peerId = memberRows.find((member) => member.conversation_id === conversation.id && member.user_id !== user.id)?.user_id;
        if (!peerId) continue;
        const peer = peopleById.get(peerId);
        next.push({ conversation, isMember: true, role: 'member', peerId, title: peer?.name || 'Kullanıcı', color: peer?.color });
      }
      next.sort((a, b) => new Date(b.conversation.created_at) - new Date(a.conversation.created_at));
      setProfiles(people);
      setItems(next);
      setError('');
    } catch (reason) { setError(reason?.message || 'Sohbetler yüklenemedi.'); }
  };
  useEffect(() => { void load(); }, [user.id, reload]);
  useEffect(() => {
    const cleanups = [
      watch(`react-conversations-${user.id}`, 'conversations', null, () => setReload((n) => n + 1)),
      watch(`react-members-${user.id}`, 'conversation_members', `user_id=eq.${user.id}`, () => setReload((n) => n + 1)),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [user.id]);

  const activeItem = items.find((item) => item.conversation.id === activeId);

  const startGroup = async () => {
    const name = window.prompt('Yeni grubun adı');
    if (!name?.trim()) return;
    try {
      const id = await createGroup(name.trim(), []);
      setReload((n) => n + 1);
      location.href = `/messages.html?c=${encodeURIComponent(id)}`;
    } catch (reason) { setError(reason?.message || 'Grup oluşturulamadı.'); }
  };
  const startDm = async () => {
    try {
      const follows = await fetchFollows();
      const mutualIds = acceptedFriendIds(await fetchFriendships(), user.id);
      const mutuals = profiles.filter((person) => follows.some((edge) => edge.follower_id === user.id && edge.following_id === person.id) && follows.some((edge) => edge.follower_id === person.id && edge.following_id === user.id) && mutualIds.includes(person.id));
      const choice = window.prompt(`Mesaj başlatmak için bir isim yaz:\n${mutuals.map((person) => person.name).join('\n')}`);
      const peer = mutuals.find((person) => person.name.toLowerCase() === choice?.trim().toLowerCase());
      if (!peer) return;
      const id = await openDm(peer.id);
      location.href = `/messages.html?c=${encodeURIComponent(id)}`;
    } catch (reason) { setError(reason?.message || 'Yeni mesaj başlatılamadı.'); }
  };
  return (
    <section className={`messages-layout${activeId ? ' has-active-chat' : ''}`}>
      <aside className="conversation-sidebar">
        <div className="conversation-heading"><div><p className="eyebrow">GELEN KUTUSU</p><h1>Mesajlar</h1></div><button className="button button-primary button-small" type="button" onClick={() => void startDm()}>＋</button></div>
        <button className="button button-outline button-wide" type="button" onClick={() => void startGroup()}>＋ Yeni grup</button>
        {error && <p className="error-text">{error}</p>}
        <p className="eyebrow list-heading">GRUPLAR</p>
        {items.filter((item) => item.conversation.kind === 'group').map((item) => <a className={`conversation-row${activeId === item.conversation.id ? ' is-active' : ''}`} href={`/messages.html?c=${item.conversation.id}`} key={item.conversation.id}><span className="group-avatar">#</span><span><strong>{item.title}</strong><small>{item.isMember ? 'Grup sohbeti' : 'Katılmak için aç'}</small></span></a>)}
        <p className="eyebrow list-heading">ÖZEL MESAJLAR</p>
        {items.filter((item) => item.conversation.kind === 'dm').map((item) => <a className={`conversation-row${activeId === item.conversation.id ? ' is-active' : ''}`} href={`/messages.html?c=${item.conversation.id}`} key={item.conversation.id}><Avatar profile={profiles.find((person) => person.id === item.peerId)} size="sm" /><span><strong>{item.title}</strong><small>Özel sohbet</small></span></a>)}
        {!items.length && !error && <p className="subtle conversation-empty">Henüz sohbetin yok.</p>}
      </aside>
      <section className="chat-pane">{activeItem ? <div className="chat-thread-host"><ChatThread key={activeItem.conversation.id} user={user} item={activeItem} profiles={profiles} onBack={() => { location.href = '/messages.html'; }} onInfo={() => setInfoItem(activeItem)} onChanged={() => setReload((n) => n + 1)} /></div> : <div className="chat-placeholder"><span>✉</span><h2>Sohbetini aç</h2><p>Bir sohbet seç veya yeni bir konuşma başlat.</p><a className="button button-primary" href="/community.html">Kişileri keşfet</a></div>}</section>
      {infoItem && <GroupInfo item={infoItem} profiles={profiles} user={user} onClose={() => setInfoItem(null)} onChanged={() => setReload((n) => n + 1)} />}
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [appError, setAppError] = useState('');
  const page = routeFromLocation();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAppError(error.message);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    let mounted = true;
    const loadProfile = async () => {
      try {
        let current = await fetchProfile(user.id);
        if (!current) {
          await ensureProfile(user.id, user.user_metadata?.name || user.email?.split('@')[0] || 'Kullanıcı');
          current = await fetchProfile(user.id);
        }
        if (mounted) setProfile(current);
      } catch (reason) {
        if (mounted) setAppError(reason?.message || 'Profil yüklenemedi. Migration ayarlarını kontrol et.');
      }
    };
    void loadProfile();
    countUnreadNotifications(user.id).then((count) => mounted && setUnread(count)).catch((reason) => mounted && setAppError(reason?.message || 'Bildirim sayısı alınamadı.'));
    const stop = watch(`react-notifications-${user.id}`, 'notifications', `user_id=eq.${user.id}`, () => {
      countUnreadNotifications(user.id).then((count) => mounted && setUnread(count)).catch((reason) => mounted && setAppError(reason?.message || 'Bildirim sayısı alınamadı.'));
    });
    return () => { mounted = false; stop(); };
  }, [user]);

  if (loading) return <div className="loading-screen">Akım yükleniyor…</div>;
  if (!user) return <AuthView />;
  if (!profile) return <div className="loading-screen">{appError || 'Profil yükleniyor…'}</div>;

  let content;
  if (page === 'profile') content = <ProfilePage user={user} />;
  else if (page === 'community') content = <CommunityPage user={user} />;
  else if (page === 'messages') content = <MessagesPage user={user} profile={profile} />;
  else if (page === 'explore') content = <ExplorePage user={user} />;
  else if (page === 'notifications') content = <NotificationsPage user={user} />;
  else if (page === 'saved') content = <SavedPage user={user} />;
  else content = <FeedPage user={user} profile={profile} page={page === 'reels' ? 'reels' : 'feed'} />;

  return <Shell page={page} profile={profile} unread={unread}>{appError && <p className="global-error">{appError}</p>}{content}</Shell>;
}
