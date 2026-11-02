# Vercell

Vercell; akış, profiller, arkadaşlıklar ve gerçek zamanlı grup/özel mesajlaşma içeren çok sayfalı bir web uygulamasıdır. Arayüz Vite ile derlenir; kimlik doğrulama ve veriler Supabase'te tutulur.

## Sayfalar ve kaynaklar

- `index.html`: Ana akış.
- `community.html`: Topluluk ve arkadaşlıklar.
- `messages.html`: Odalar ve özel mesajlar.
- `profile.html`: Profil görünümü ve düzenleme.
- `src/js/`: Sayfa, arayüz, veri erişimi, sohbet ve Supabase modülleri.
- `src/css/styles.css`: Masaüstü ve mobil arayüz.
- `supabase/migrations/`: Uygulamanın ilişkisel tablolarını, RLS kurallarını ve RPC fonksiyonlarını kuran sıralı veritabanı migration'ları.

## Yerel çalıştırma

1. Node.js kurulu olmalıdır.
2. Bağımlılıkları yükleyin: `npm install`
3. `.env.example` dosyasını `.env.local` olarak kopyalayıp değerleri doldurun:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
   ```

   Yerel GIF arama API'sini de çalıştırmak için `.env.local` içine `GIPHY_API_KEY=YOUR_GIPHY_API_KEY` ekleyin ve Vite yerine `npx vercel dev` komutuyla çalıştırın. Giphy anahtarı `VITE_` öneki almamalı; istemci paketine eklenmemelidir.

4. Geliştirme sunucusu: `npm run dev`
5. Üretim derlemesi: `npm run build` (çıktı `dist/` klasörüne yazılır).

Supabase anahtarında yalnızca tarayıcı kullanımı için tasarlanmış `anon` veya `publishable` anahtar kullanılmalıdır. `service_role`, `sb_secret_` veya başka bir ayrıcalıklı anahtarı hiçbir frontend dosyasına ya da `VITE_` değişkenine koymayın. `.env*` dosyaları Git tarafından yok sayılır.

## Supabase kurulumu

Bu sürüm doğrudan `profiles`, `posts`, `follows`, `notifications`, `conversations`, `conversation_members`, `messages`, `friendships` ve `message_reactions` tablolarını kullanır. `supabase/migrations/` dosyalarını zaman damgası sırasıyla Supabase SQL Editor'da birer birer çalıştırın. Mevcut veritabanında başlangıç migration'ını tekrar çalıştırmayın; her dosyanın başarıyla tamamlandığını kontrol edin. Son migration, sosyal tablolardaki anonim rol yetkilerini kapatır. Realtime migration'ı akış, mesajlar ve bildirimler için gereken tabloları yayına ekler.

E-posta/şifre kaydının e-posta doğrulaması beklemeden oturum açması için Supabase **Authentication → Providers → Email** bölümünde e-posta onayını devre dışı bırakın. Google girişi için Supabase Authentication'ta Google provider'ı etkinleştirip Google Cloud OAuth Client ID/Secret değerlerini oraya ekleyin. Google Cloud OAuth istemcisindeki Authorized redirect URI, Supabase Google provider sayfasında verilen `https://<project-ref>.supabase.co/auth/v1/callback` adresi olmalıdır. Supabase **Authentication → URL Configuration** alanında Vercel alan adını Site URL ve Redirect URL olarak tanımlayın. Uygulama OAuth dönüşünü sitenin kök adresine yapar.

## Vercel dağıtımı

Vercel projesinde aşağıdaki environment variable'ları ekleyin ve her ikisini de `Production`, `Preview` ve gerekiyorsa `Development` ortamları için tanımlayın:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `GIPHY_API_KEY` (Giphy Developer Dashboard'dan oluşturulur; **VITE_ öneki kullanmayın**)

Build command `npm run build`, output directory `dist` olmalıdır. Değişkenleri ekledikten sonra yeniden dağıtım yapın.
