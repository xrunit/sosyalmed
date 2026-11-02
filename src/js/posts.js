import { deletePost } from '@/js/data.js';
import { avatar, confirmDialog, esc, formatRelative, formatTime, icon, toast } from '@/js/ui.js';

export function postListHtml(posts, authorsById, currentUserId) {
  return posts
    .map((post) => {
      const author = authorsById.get(post.user_id);
      const name = author?.name || 'Kullanıcı';
      const profileHref = `/profile.html?id=${encodeURIComponent(post.user_id)}`;
      const deleteButton =
        post.user_id === currentUserId
          ? `<button class="icon-btn post-delete" type="button" data-delete-post="${esc(post.id)}" aria-label="Gönderiyi sil" title="Gönderiyi sil">${icon('trash', 16)}</button>`
          : '';
      return `
        <article class="post">
          <a href="${profileHref}" aria-label="${esc(name)} profilini aç">${avatar(name, author?.color, 'md')}</a>
          <div class="post-body">
            <div class="post-meta">
              <a class="post-author" href="${profileHref}"><strong>${esc(name)}</strong></a>
              <time datetime="${esc(post.created_at)}" title="${esc(formatTime(post.created_at))}">· ${formatRelative(post.created_at)}</time>
              ${deleteButton}
            </div>
            <p class="post-text">${esc(post.body)}</p>
          </div>
        </article>`;
    })
    .join('');
}

export function bindPostDeletes(container, onDeleted) {
  container.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-post]');
    if (!button) return;
    const confirmed = await confirmDialog({
      title: 'Gönderi silinsin mi?',
      message: 'Bu gönderi kalıcı olarak silinecek.',
      confirmLabel: 'Sil',
    });
    if (!confirmed) return;
    try {
      await deletePost(button.dataset.deletePost);
      toast('Gönderi silindi.');
      onDeleted();
    } catch {
      toast('Gönderi silinemedi. Tekrar dene.', 'error');
    }
  });
}
