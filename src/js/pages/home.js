import { bootPage } from '@/js/shell.js';
import { createPost, fetchPosts, fetchProfiles, watch } from '@/js/data.js';
import { bindPostDeletes, postListHtml } from '@/js/posts.js';
import { avatar, byId, esc, setBusy, toast } from '@/js/ui.js';

const MAX_POST = 280;

bootPage('home', renderHome);

function renderHome({ user, profile }) {
  const page = document.getElementById('page');
  page.innerHTML = `
    <header class="page-header"><h1>Akış</h1></header>
    <form class="composer" id="composer">
      ${avatar(profile.name, profile.color)}
      <div class="composer-main">
        <label class="sr-only" for="post-body">Gönderi metni</label>
        <textarea id="post-body" maxlength="${MAX_POST}" rows="2" placeholder="Neler oluyor?"></textarea>
        <div class="composer-actions">
          <span class="counter" id="post-counter" aria-live="polite"></span>
          <button class="btn btn--primary btn--sm" type="submit" id="post-submit">Paylaş</button>
        </div>
      </div>
    </form>
    <div id="feed"></div>`;

  const composer = page.querySelector('#composer');
  const textarea = page.querySelector('#post-body');
  const counter = page.querySelector('#post-counter');
  const submit = page.querySelector('#post-submit');
  const feed = page.querySelector('#feed');
  const aside = document.getElementById('aside');

  const updateCounter = () => {
    const length = textarea.value.length;
    counter.textContent = `${length} / ${MAX_POST}`;
    counter.classList.toggle('is-low', length >= MAX_POST - 20);
    submit.disabled = !textarea.value.trim();
  };

  const loadAll = async () => {
    try {
      const [posts, profiles] = await Promise.all([fetchPosts(), fetchProfiles()]);
      const authors = byId(profiles);
      feed.innerHTML = posts.length
        ? postListHtml(posts, authors, user.id)
        : `<div class="state">Henüz gönderi yok. İlk paylaşımı sen yap.</div>`;
      renderMembers(aside, profiles, user.id);
    } catch {
      feed.innerHTML = `<div class="state">Akış yüklenemedi. <button class="btn btn--ghost btn--sm" type="button" data-retry>Tekrar dene</button></div>`;
    }
  };

  textarea.addEventListener('input', updateCounter);

  composer.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = textarea.value.trim();
    if (!body) return;
    setBusy(submit, true);
    try {
      await createPost(user.id, body);
      textarea.value = '';
      toast('Gönderin paylaşıldı.');
      await loadAll();
    } catch {
      toast('Gönderi paylaşılamadı. Tekrar dene.', 'error');
    } finally {
      setBusy(submit, false);
      updateCounter();
    }
  });

  feed.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry]')) void loadAll();
  });
  bindPostDeletes(feed, loadAll);

  watch(`feed-posts-${user.id}`, 'posts', null, loadAll);
  updateCounter();
  void loadAll();
}

function renderMembers(container, profiles, currentUserId) {
  const newest = profiles
    .filter((member) => member.id !== currentUserId)
    .slice(-5)
    .reverse();
  container.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Yeni üyeler</h2>
      ${
        newest.length
          ? `<ul class="list">${newest
              .map(
                (member) => `
                <li class="row">
                  <a href="/profile.html?id=${encodeURIComponent(member.id)}">${avatar(member.name, member.color, 'sm')}</a>
                  <div class="row-main">
                    <a href="/profile.html?id=${encodeURIComponent(member.id)}"><strong>${esc(member.name)}</strong></a>
                    <span class="muted clamp">${esc(member.bio || 'Henüz biyografi yok')}</span>
                  </div>
                </li>`,
              )
              .join('')}</ul>
             <a class="panel-link" href="/community.html">Topluluğun tamamını gör</a>`
          : `<p class="muted">Henüz başka üye yok.</p>`
      }
    </section>`;
}
