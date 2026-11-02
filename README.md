# Vercell

Akım; React ve Vite ile oluşturulmuş sosyal web uygulamasıdır. Supabase Auth, Database, Realtime ve Storage kullanır. Arayüz koyu lacivert/siyah temayı beyaz ve `#075FEA` vurgusuyla birleştirir.

## Sayfalar ve kaynaklar

- `index.html`: Ana akış.
- `community.html`: Topluluk ve arkadaşlıklar.
- `messages.html`: Odalar ve özel mesajlar.
- `profile.html`: Profil görünümü ve düzenleme.
- `src/App.jsx`: React sayfaları ve etkileşimleri.
- `src/social-data.js`: Medya yükleme, gönderi etkileşimleri ve arama.
- `src/app.css`: Responsive React arayüzü.
- `src/js/`: Supabase istemcisi, kimlik doğrulama ve sohbet servisleri.
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

## Özellikler

- E-posta/şifre ve Google ile giriş; profil düzenleme, takip ve arkadaşlık istekleri.
- Metin, fotoğraf ve video gönderileri; video gönderileri Reels akışında görünür.
- Gönderi beğenisi, yorum, kaydetme ve bildirimler.
- Kişi/gönderi araması ve topluluk keşfi.
- Gerçek zamanlı grup/özel mesajlar; mevcut yanıt, tepki, görüldü, GIF ve grup yönetimi akışları.
- Masaüstü ve mobil için uyarlanabilir arayüz.

Supabase anahtarında yalnızca tarayıcı kullanımı için tasarlanmış `anon` veya `publishable` anahtar kullanılmalıdır. `service_role`, `sb_secret_` veya başka bir ayrıcalıklı anahtarı hiçbir frontend dosyasına ya da `VITE_` değişkenine koymayın. `.env*` dosyaları Git tarafından yok sayılır.

## Supabase kurulumu

Uygulama `profiles`, `posts`, `follows`, `notifications`, sohbet tabloları, arkadaşlık tabloları ve yeni sosyal etkileşim tablolarını kullanır. İlk kurulumda migration dosyalarını zaman damgası sırasıyla Supabase SQL Editor'da çalıştırın. Mevcut veritabanında başlangıç şema migration'larını tekrar çalıştırmayın. Mevcut projeye yükseltirken zaten uygulanmış migration'ları atlayıp yalnızca henüz uygulanmamış migration'ları, sırasıyla çalıştırın. Yeni `20261104000000_react_social_features.sql` migration'ı profil fotoğrafı alanını, medya gönderilerini, beğeni/yorum/kaydetme tablolarını, bildirim tetikleyicilerini, `post-media` Storage bucket'ını ve Realtime tablolarını ekler; mevcut gönderileri silmez.

Medya yükleme sınırı 30 MB'dır. Bucket herkese açık medya URL'leri kullanır; yükleme/silme yetkileri kullanıcı kimliğiyle başlayan klasör yolu üzerinden RLS ile sınırlandırılır. Gönderi ve video paylaşımından önce yeni migration'ı eski Supabase projesinde çalıştırın.

E-posta/şifre kaydının e-posta doğrulaması beklemeden oturum açması için Supabase **Authentication → Providers → Email** bölümünde e-posta onayını devre dışı bırakın. Google girişi için Supabase Authentication'ta Google provider'ı etkinleştirip Google Cloud OAuth Client ID/Secret değerlerini oraya ekleyin. Google Cloud OAuth istemcisindeki Authorized redirect URI, Supabase Google provider sayfasında verilen `https://<project-ref>.supabase.co/auth/v1/callback` adresi olmalıdır. Supabase **Authentication → URL Configuration** alanında Vercel alan adını Site URL ve Redirect URL olarak tanımlayın. Uygulama OAuth dönüşünü sitenin kök adresine yapar.

## Vercel dağıtımı

1. GitHub deposunu Vercel'e import edin; **Root Directory** proje kökü olarak kalmalı.
2. Framework preset olarak **Vite** (otomatik algılanmazsa) seçin. Build command `npm run build`, output directory `dist` olmalıdır. Install command `npm install` olarak bırakılabilir.
3. Vercel projesinin **Settings → Environment Variables** bölümünde aşağıdaki değişkenleri ekleyin. Supabase değişkenlerini `Production`, `Preview` ve yerel Vercel geliştirmesi kullanacaksanız `Development` ortamları için tanımlayın:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `GIPHY_API_KEY` (GIF özelliği kullanılacaksa; Giphy Developer Dashboard'dan oluşturulur. **VITE_ öneki kullanmayın** ve `Production`/`Preview` ortamlarında tanımlayın.)

4. Vercel'de ilk deploy öncesinde Supabase migration durumunu kontrol edin ve eksik migration'ları zaman damgası sırasıyla Supabase SQL Editor'da çalıştırın. Özellikle `20261104000000_react_social_features.sql`, medya/beğeni/yorum/kaydetme özellikleri için gereklidir; daha önce uygulanmış SQL'leri yeniden çalıştırmayın.
5. Supabase **Authentication → URL Configuration** bölümüne Vercel üretim alan adını Site URL ve Redirect URL olarak ekleyin. Google OAuth etkinse Google Cloud OAuth ayarlarının callback adresi Supabase'in verdiği `/auth/v1/callback` adresi olarak kalmalı.
6. Ortam değişkenlerini ekledikten veya güncelledikten sonra yeni bir deployment başlatın. Deploy sonrası ana sayfayı, `/profile`, `/community`, `/messages` temiz URL'lerini ve GIF özelliğini (anahtar eklendiyse) deneyin.

`.env.local` yerel makinede kalmalıdır; `.gitignore` tarafından yok sayılır ve `dist` içine kopyalanmaz. `VITE_SUPABASE_ANON_KEY` yalnızca Supabase'in frontend için verdiği anon/publishable anahtar olmalıdır. `service_role`, `sb_secret_` veya Giphy API anahtarı frontend değişkeni olarak (`VITE_` önekiyle) hiçbir zaman eklenmemelidir. Migration'lar ve OAuth ayarları Vercel deployment'ından bağımsız olarak Supabase/Google panellerinde tamamlanır.
