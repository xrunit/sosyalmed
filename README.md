# Vercell

Gerçek zamanlı sosyal sohbet: Google veya e-posta/şifre ile giriş ve kayıt, paylaşım akışı, takip ve karşılıklı takipte DM, özel odalar, oda yöneticileri ve sahiplik devri, mesaj yanıtları/tepkileri/okundu bilgisi, fotoğraf, GIF, sesli mesaj ve profil düzenleme.
Derleme adımı yok: statik HTML/CSS/JavaScript + Supabase (giriş, veritabanı, dosya depolama, canlı bağlantı).

## Arayüz dosyaları

- `index.html`: Ana sayfa, mesajlar ve profil görünümlerinin HTML yapısı.
- `css/styles.css`: Masaüstü ve mobil tasarım; mevcut açık/koyu arka plan renkleri korunur.
- `js/app.js`: Sayfa geçişleri, paylaşım akışı, takip/DM, sohbet, oda yönetimi, profil ve Supabase bağlantısı.
- `config.js`: Tarayıcıda kullanılabilen Supabase URL ve publishable/anon anahtarı.

Ana sayfa, mesajlar, arkadaşlar/bildirimler ve profil tek statik sayfada ayrı görünümler olarak çalışır; gezinme masaüstü ve mobilde kullanılabilir. Paylaşımlar, takipler, bildirimler, odalar ve mesajlar aynı Supabase `docs` tablosunda farklı koleksiyonlarda saklanır. Yeni bir veritabanı tablosu veya derleme adımı gerekmez.

## Kurulum (yaklaşık 10 dk)

1. **supabase.com** → yeni proje oluştur.
2. **SQL Editor** → `supabase.sql` içeriğini yapıştır, çalıştır. Uygulama güncellendiyse oda üyelikleri ve erişim kurallarını da güncellemek için dosyanın güncel içeriğini yeniden çalıştır.
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
- Yalnızca kendi mesajını silebilirsin. Oda sahibi ayrılmadan önce oda sahipliğini devretmelidir; erişim kuralları veritabanında (RLS) uygulanır.
- Yazıyor göstergesi Supabase Realtime Broadcast ile çalışır, kayıt tutulmaz.
- Özel mesajlaşma yalnızca iki kişinin de birbirini takip ettiği durumda açılır. Yeni oluşturulan odalar özeldir; Genel odası herkese açıktır.
- Kullanıcı oturumu Supabase Auth'ın tarayıcı depolamasında kalıcı tutulur; bu nedenle oturum süresi dolmadıkça her ziyarette yeniden giriş gerekmez.
- Fotoğraflar `media` kovasında herkese açık bağlantıyla durur; özel içerik için kovayı private yapıp imzalı URL kullan.
