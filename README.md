# Vercell

Gerçek zamanlı mesajlaşma: Google veya e-posta/şifre ile giriş ve kayıt, odalar, fotoğraf (galeri/kamera), GIF yapma, sesli mesaj, mesaj silme, yazıyor göstergesi, profil fotoğrafı.
Derleme adımı yok: statik site + Supabase (giriş, veritabanı, dosya depolama, canlı bağlantı).

## Kurulum (yaklaşık 10 dk)

1. **supabase.com** → yeni proje oluştur.
2. **SQL Editor** → `supabase.sql` içeriğini yapıştır, çalıştır.
3. E-posta/şifre ile kayıt ve giriş varsayılan olarak kullanılabilir. Kayıt sırasında e-posta doğrulaması açıksa kullanıcı, gelen bağlantıyı onayladıktan sonra giriş yapabilir.
   Google girişi de kullanmak istiyorsan **Authentication → Providers → Google**'ı aç.
   - Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web) oluştur.
   - "Authorized redirect URI": Supabase'in Google sayfasında yazan `https://<proje>.supabase.co/auth/v1/callback`.
   - Client ID ve Secret'ı Supabase'e yapıştır.
4. **Project Settings → API**: Project URL ve anon key'i `config.js` içine yaz.
5. **Vercel'e yükle**: klasörü GitHub'a at, vercel.com → Add New → Project → repoyu seç → Deploy (Framework: Other, build komutu boş).
   Veya terminalde: `npx vercel --prod`
6. **Authentication → URL Configuration**: Site URL = Vercel adresin (`https://xxx.vercel.app`), Redirect URLs'e aynısını ekle. E-posta doğrulaması kullanıyorsan bu adresin e-posta yönlendirme URL'lerine izin verildiğinden emin ol.

## Notlar
- Kamera ve mikrofon yalnızca HTTPS'te çalışır (Vercel'de zaten öyle).
- Sadece kendi mesajını/odanı silebilirsin; kural veritabanı tarafında (RLS) zorunlu.
- Yazıyor göstergesi Supabase Realtime Broadcast ile çalışır, kayıt tutulmaz.
- Fotoğraflar `media` kovasında herkese açık bağlantıyla durur; özel içerik için kovayı private yapıp imzalı URL kullan.
