import { signIn, signInWithGoogle, signUp } from '@/js/data.js';
import { logoMark, setBusy } from '@/js/ui.js';

const MIN_PASSWORD = 6;

function describeError(error) {
  const message = (error?.message ?? '').toLowerCase();
  if (message.includes('invalid login credentials')) return 'E-posta veya şifre hatalı.';
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.';
  }
  if (message.includes('rate limit') || message.includes('too many')) return 'Çok fazla deneme yaptın. Biraz bekleyip tekrar dene.';
  if (message.includes('password')) return `Şifre en az ${MIN_PASSWORD} karakter olmalı.`;
  if (message.includes('provider is not enabled')) return 'Google girişi Supabase Authentication ayarlarından etkinleştirilmeli.';
  if (message.includes('failed to fetch') || message.includes('network') || error instanceof TypeError) {
    return 'Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.';
  }
  return 'Bir sorun oluştu. Lütfen tekrar dene.';
}

export function showAuth(onSignedIn) {
  const root = document.getElementById('auth-root');
  document.getElementById('app').hidden = true;
  root.innerHTML = `
    <section class="auth">
      <div class="auth-card">
        <a class="brand" href="/">${logoMark()}<span>Akım</span></a>
        <h1 class="auth-title" id="auth-title">Tekrar hoş geldin</h1>
        <p class="auth-sub" id="auth-sub">Hesabına giriş yap ve akışını takip etmeye devam et.</p>
        <div class="segmented" role="tablist" aria-label="Giriş ya da kayıt">
          <button type="button" role="tab" data-mode="login" class="is-active" aria-selected="true">Giriş yap</button>
          <button type="button" role="tab" data-mode="signup" aria-selected="false">Kayıt ol</button>
        </div>
        <button class="btn btn--ghost btn--block" type="button" id="google-signin">Google ile devam et</button>
        <div class="auth-divider"><span>veya e-posta ile</span></div>
        <form id="auth-form" class="stack" novalidate>
          <div class="field-group" id="name-field" hidden>
            <label class="field-label" for="auth-name">Ad</label>
            <input class="field" id="auth-name" name="name" type="text" maxlength="24" autocomplete="nickname" placeholder="Görünecek adın" />
          </div>
          <div class="field-group">
            <label class="field-label" for="auth-email">E-posta</label>
            <input class="field" id="auth-email" name="email" type="email" autocomplete="email" required placeholder="ornek@mail.com" />
          </div>
          <div class="field-group">
            <label class="field-label" for="auth-password">Şifre</label>
            <input class="field" id="auth-password" name="password" type="password" autocomplete="current-password" required minlength="${MIN_PASSWORD}" placeholder="En az ${MIN_PASSWORD} karakter" />
          </div>
          <p class="form-error" id="auth-error" role="alert" hidden></p>
          <p class="form-notice" id="auth-notice" role="status" hidden></p>
          <button class="btn btn--primary btn--block" type="submit" id="auth-submit">Giriş yap</button>
        </form>
      </div>
    </section>`;

  const form = root.querySelector('#auth-form');
  const submit = root.querySelector('#auth-submit');
  const googleButton = root.querySelector('#google-signin');
  const errorEl = root.querySelector('#auth-error');
  const noticeEl = root.querySelector('#auth-notice');
  const nameField = root.querySelector('#name-field');
  let mode = 'login';

  const showMessage = (el, text) => {
    el.textContent = text;
    el.hidden = !text;
  };

  googleButton.addEventListener('click', async () => {
    showMessage(errorEl, '');
    setBusy(googleButton, true);
    try {
      await signInWithGoogle();
    } catch (error) {
      showMessage(errorEl, describeError(error));
      setBusy(googleButton, false);
    }
  });

  const setMode = (next) => {
    mode = next;
    const isSignup = mode === 'signup';
    root.querySelectorAll('[data-mode]').forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    nameField.hidden = !isSignup;
    root.querySelector('#auth-password').autocomplete = isSignup ? 'new-password' : 'current-password';
    root.querySelector('#auth-title').textContent = isSignup ? 'Akıma katıl' : 'Tekrar hoş geldin';
    root.querySelector('#auth-sub').textContent = isSignup
      ? 'Birkaç saniyede hesabını oluştur ve topluluğa katıl.'
      : 'Hesabına giriş yap ve akışını takip etmeye devam et.';
    submit.textContent = isSignup ? 'Hesap oluştur' : 'Giriş yap';
    showMessage(errorEl, '');
    showMessage(noticeEl, '');
  };

  root.querySelectorAll('[data-mode]').forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(errorEl, '');
    showMessage(noticeEl, '');

    const email = form.email.value.trim();
    const password = form.password.value;
    const name = form.name.value.trim();

    if (!email || !password) {
      showMessage(errorEl, 'E-posta ve şifre alanlarını doldur.');
      return;
    }
    if (mode === 'signup' && !name) {
      showMessage(errorEl, 'Görünecek adını yaz.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      showMessage(errorEl, `Şifre en az ${MIN_PASSWORD} karakter olmalı.`);
      return;
    }

    setBusy(submit, true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
        onSignedIn();
        return;
      }
      const hasSession = await signUp(email, password, name);
      if (hasSession) {
        onSignedIn();
        return;
      }
      setMode('login');
      form.email.value = email;
      showMessage(noticeEl, 'Hesabın hazır. Şimdi giriş yapabilirsin.');
    } catch (error) {
      showMessage(errorEl, describeError(error));
    } finally {
      setBusy(submit, false);
    }
  });
}
