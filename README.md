# Vercell

Gerçek zamanlı mesajlaşma: Google veya e-posta/şifre ile giriş ve kayıt, odalar, fotoğraf (galeri/kamera), GIF yapma, sesli mesaj, mesaj silme, yazıyor göstergesi, profil fotoğrafı.
Derleme adımı yok: statik site + Supabase (giriş, veritabanı, dosya depolama, canlı bağlantı).

## Kurulum (yaklaşık 10 dk)

1. **supabase.com** → yeni proje oluştur.
2. **SQL Editor** → `supabase.sql` içeriğini yapıştır, çalıştır.
3. E-posta/şifre ile kayıt ve giriş varsayılan olarak kullanılabilir. Kayıttan sonra e-posta doğrulaması istemiyor ve kullanıcının hemen giriş yapmasını istiyorsan **Authentication → Providers → Email** bölümündeki **Confirm email** seçeneğini kapat. Bu ayar kapalıyken başarılı kayıt doğrudan oturum açar. Açık kalırsa Supabase e-posta doğrulaması ister ve doğrudan oturum oluşturmaz.
   Google girişi de kullanmak istiyorsan **Authentication → Providers → Google**'ı aç.
   - Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web) oluştur.
   - "Authorized redirect URI": Supabase'in Google sayfasında yazan `https://<proje>.supabase.co/auth/v1/callback`.
   - Client ID ve Secret'ı Supabase'e yapıştır.
4. **Project Settings → API**: Project URL ve yalnızca frontend için olan `anon` veya `publishable` anahtarı [config.js](./config.js) içine yaz. Bu dosya tarayıcıya gönderilir; `service_role` veya `sb_secret_` anahtarlarını buraya, HTML'e ya da başka bir istemci dosyasına kesinlikle koyma. Uygulama yalnızca `sb_publishable_` anahtarlarını ve eski biçimdeki `anon` JWT anahtarlarını kabul eder; `service_role` anahtarlarını reddeder.
5. **Vercel'e yükle**: klasörü GitHub'a at, vercel.com → Add New → Project → repoyu seç → Deploy (Framework: Other, build komutu boş).
   Veya terminalde: `npx vercel --prod`
6. **Authentication → URL Configuration**: Site URL = Vercel adresin (`https://xxx.vercel.app`), Redirect URLs'e aynısını ekle.

## Notlar
- `.env`, `.env.local` ve olası gizli anahtar dosyaları `.gitignore` ile Git dışında tutulur. Bu statik projede `.env` dosyası tarayıcı yapılandırmasını sağlamaz; frontend ayarları `config.js` dosyasından okunur.
- `anon`/`publishable` anahtarları istemci uygulamalarında kullanılmak üzere tasarlanmıştır ve kullanıcılar tarafından görülebilir. Veri erişimini Supabase RLS politikalarıyla koru; gizli anahtarları yalnızca güvenilir sunucu tarafında sakla. Bir `service_role` veya `secret` anahtarı daha önce GitHub'a ya da tarayıcıya gönderildiyse Supabase'den yenile.
- Kamera ve mikrofon yalnızca HTTPS'te çalışır (Vercel'de zaten öyle).
- Sadece kendi mesajını/odanı silebilirsin; kural veritabanı tarafında (RLS) zorunlu.
- Yazıyor göstergesi Supabase Realtime Broadcast ile çalışır, kayıt tutulmaz.
- Fotoğraflar `media` kovasında herkese açık bağlantıyla durur; özel içerik için kovayı private yapıp imzalı URL kullan.
