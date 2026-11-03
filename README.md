# Sorbit

## About the project

Sorbit is a feature-rich social app with feed, profile, explore, reels, stories, and direct messages. It focuses on a polished, responsive interface with dark mode and smooth interactions built from portals, poppers, hover cards, and modals.

The interface closely follows the original design, is fully responsive, and ships with light and dark themes. Components live in small, focused folders, each owning its own markup and styles, and interactivity is pushed to the leaves of a mostly Server Component tree.

Authentication is handled by Supabase, supporting Google OAuth and email sign-up.

Data is stored in Supabase (Postgres, Storage, and Realtime) and videos are processed and streamed through Mux.

## Implemented Features

### Interface & Design

- Built with StyleX for type-safe, atomic, zero-runtime styling
- Light and dark modes with persisted theme state
- Fully responsive layout with a collapsible main sidebar
- Custom skeletons and gradient loading placeholders
- Modular component structure, each component in its own folder with co-located styles
- React Icons throughout, no inline SVG
- Built on React Compiler for automatic memoization

### Authentication

- Google OAuth sign-in
- Email sign-up and password login
- Session handling via Supabase SSR
- Account editing and account deletion

### Home / Feed

- Post feed with infinite scrolling, sorted by date
- Smart layout adaptation based on media and caption length
- Stories tray at the top of the feed
- Suggestions and contextual sidebars

### Explore

- Discovery grid of posts surfaced from across the app
- Adaptive tile layout for mixed media

### Reels

- Vertical video player powered by Mux
- Volume control and smooth playback
- Infinite scroll through reels

### Stories

- Create stories with image upload
- Full-screen story viewer with view tracking
- Blur placeholders for media
- Automatic expiry (stories disappear after their lifetime)

### Profile

- Rich profile header with avatar and stats
- Posts grid with per-post view modal
- Follower and following lists
- Smart follow / unfollow / requested buttons
- Profile editing with avatar updates
- Profile hover cards for quick previews

### Posts & Media

- Rich post creation flow with:
  - Client-side image crop and filters (canvas / WebGL) baked before upload
  - Multiple image support with a media carousel
  - Video uploads transcoded and streamed via Mux
  - Location tagging
  - Collaborators and positional image tags
  - Per-post controls (hide likes, turn off comments)
- Full post view modal with carousel navigation
- Complete post management: create, edit, delete

### Social Interactions

- Comments with likes, replies, and deletion
- Likes on posts and comments
- Follow system with follow requests for private accounts
- Follower / following list modals
- Notifications with a dedicated portal and read tracking

### Direct Messages

- One-to-one and group conversations
- Message requests with accept, delete, and block-and-delete
- Primary and general (request) folders
- Image and sticker messages
- Mute, mark read / unread, leave, and rename groups
- Realtime updates powered by Supabase Realtime

### Performance & Security

- Server Components by default with interactivity at the leaves
- TanStack Query for client data fetching and caching
- Infinite scrolling with intersection observers
- Hardened security headers (frame options, content type, COOP/COEP)
- Vercel Speed Insights integration

## Getting Started

### Prerequisites

- **Bun** — package manager and script runner. Install from https://bun.sh/ and make sure it is on your `PATH`.
- **Supabase project** — provides Postgres, Auth, Storage, and Realtime. Create one at https://supabase.com/.
- **Mux account** — required for video uploads and reels playback. Sign up at https://www.mux.com/.
- **Google Cloud project** — needed for Google OAuth. Create OAuth credentials and note the client ID and secret.

### Quick Start for Local Development

1. Clone the repo and install dependencies:

   ```bash
   git clone https://github.com/zivavu/Clonagram.git sorbit
   cd sorbit
   bun install
   ```

2. Copy the environment variable template and fill in your values (see [Environment Variables](#environment-variables) below):

   ```bash
   cp .env.example .env.local
   ```

3. Log in to the Supabase CLI and link your project:

   ```bash
   bunx supabase login
   bunx supabase link --project-ref <your-project-ref>
   ```

4. For a new, empty Supabase project, apply the checked-in database migrations:

   ```bash
   bunx supabase db push
   ```

   For an existing project, back it up and review `bunx supabase db push --dry-run` before
   applying anything. Do not manually rerun old SQL Editor snippets.

5. Configure Supabase Auth:
   - In the Supabase dashboard go to **Authentication → Providers** and enable **Google**. Paste in your Google OAuth client ID and secret.
   - Under **Authentication → URL Configuration**, set the **Site URL** to `http://localhost:3000` for local development (and your production URL when deploying).

6. Create the required Storage buckets in the Supabase dashboard (**Storage → New bucket**):
   - `avatars` — public
   - `posts` — public
   - `stories` — public

7. Generate TypeScript types from your schema (re-run whenever the schema changes):

   ```bash
   bun run db:types
   ```

8. Start the development server:

   ```bash
   bun run dev
   ```

9. Open http://localhost:3000 in your browser.

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=            # Project URL from Supabase dashboard → Settings → API
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=# Anon/public key from the same page
# Vercel VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are also supported.

# App
NEXT_PUBLIC_APP_URL=                 # Optional canonical URL, e.g. https://sorbit.vercel.app
NEXT_PUBLIC_HOSTNAME=                 # App origin used for Mux video upload CORS

# Mux (video processing & playback)
MUX_TOKEN_ID=                        # Required for video uploads
MUX_TOKEN_SECRET=                    # Required for video uploads
MUX_WEBHOOK_SECRET=                  # Required only when enabling the Mux webhook

# Optional features
OPEN_ROUTER_API_KEY=                 # AI-generated image alt text
NEXT_PUBLIC_TURN_URLS=               # Comma-separated TURN server URLs for calls
NEXT_PUBLIC_TURN_USERNAME=
NEXT_PUBLIC_TURN_CREDENTIAL=
```

The following variables are only needed for database administration or seed scripts. Do not expose
the service-role key or Supabase access token to the browser or add them to Vercel unless you have a
specific server-side task that requires them:

```bash
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ACCESS_TOKEN=
UNSPLASH_ACCESS_KEY=                # Seed scripts
PEXELS_API_KEY=                     # Seed scripts
```

Google OAuth credentials are configured in the Supabase dashboard under **Authentication →
Providers**, not as a Vercel environment variable.

### Deploy to Vercel

1. Import the repository into Vercel and keep the detected **Next.js** framework and Bun package
   manager settings. The existing `vercel.json` selects the `dub1` function region.
2. The app accepts either `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, or your existing Vercel variables
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The `VITE_` pair is mapped to the Next.js
   public variables at build time. Keep the Supabase URL and anon/publishable key set for every
   Vercel environment you deploy. These are public client values; never use the service-role key
   here. Add the Mux credentials to enable video uploads; set `NEXT_PUBLIC_HOSTNAME` to the app's
   public origin (for example, `https://sorbit.vercel.app`) so Mux accepts browser uploads from that
   domain.
3. In Supabase **Authentication → URL Configuration**, set the production Site URL and add your
   production and preview deployment callback URLs ending in `/auth/callback` to the allowed
   redirect URLs. Configure the Google OAuth provider there if Google sign-in is enabled.
4. If using Mux webhooks, configure its webhook URL as `https://<your-domain>/mux-webhook` and add
   the signing secret as `MUX_WEBHOOK_SECRET` in Vercel.
5. Deploy. Vercel uses the existing `build` script (`bun run build`). Redeploy after changing
   environment variables, and set the Vercel project name to `sorbit` if desired.

### Supabase setup and old SQL Editor queries

- Create or select the Supabase project that contains the app's database. For an empty project,
  link the repository and run `bunx supabase db push` to apply the checked-in migrations in
  `supabase/migrations`. For an existing database, back it up and review
  `bunx supabase db push --dry-run` before applying pending migrations. Do not delete migration
  files or manually rerun old SQL snippets to reset the database.
- Create the `avatars`, `posts`, and `stories` Storage buckets from **Storage → Buckets** and make
  them public if the app should serve uploaded media without signed URLs.
- In **Authentication → URL Configuration**, set the Site URL to the production domain and add
  `https://<your-domain>/auth/callback` to the allowed redirect URLs. Add local and preview
  deployment callback URLs there when you use them. Configure Google under **Authentication →
  Sign In / Providers** if Google login is needed.
- Saved snippets in **SQL Editor** are separate from the database. Delete only the saved query from
  the SQL Editor's saved-query list/menu; that does not undo SQL already run or delete tables and
  data. To remove database objects or data, first identify the exact objects and take a backup.
  Never run broad `DROP` or `DELETE` statements just to clear saved SQL history.

## Available Scripts

```bash
bun run dev        # Start the development server
bun run build      # Production build
bun run start      # Start the production server
bun run check      # Format and lint with Biome
bun run lint       # Lint with Biome
bun run format     # Format with Biome
bun run typecheck  # Type-check with the TypeScript compiler
bun run db:types   # Regenerate database TypeScript types from Supabase
```

## Tests

Playwright E2E tests run against a dedicated Supabase test project. Playwright starts the dev server automatically, so no manual setup is needed before running them.

```bash
bun run test:e2e
```

See `.env.test.example` for the required environment variables and `.github/workflows/e2e.yml` for the CI configuration.

## Seed Scripts

The seed pipeline populates the database with realistic AI-generated profiles, posts, stories, and reels so you can develop against a fully populated app without manual data entry.

It runs in three phases:

| Phase | Script | What it does |
|-------|--------|--------------|
| 1 — Generate | `seed:generate` | Calls OpenRouter to generate profile data (bios, captions, comment pools, reel captions) for each archetype |
| 2 — Process | `seed:process` | Downloads images from Unsplash, runs a vision model to write image-aware captions and alt text, and fetches reel video URLs from Pexels |
| 3 — Seed | `seed:seed` | Uploads everything to Supabase Storage, inserts all database rows, uploads reels to Mux, and wires up the social graph (follows, likes, comments) |

Run all three in sequence:

```bash
bun run seed:all
```

Or run phases individually (output of each phase is saved to `scripts/seed/output/` as JSON):

```bash
bun run seed:generate   # Phase 1: generate profile JSON
bun run seed:process    # Phase 2: download images and fetch videos
bun run seed:seed       # Phase 3: seed the database
```

To remove all AI-generated content (profiles, posts, stories, storage files, and Mux assets):

```bash
bun run seed:cleanup
```

> **Note:** `seed:all` requires `UNSPLASH_ACCESS_KEY`, `OPEN_ROUTER_API_KEY`, and `PEXELS_API_KEY` in addition to the standard Supabase and Mux variables. The vision model used is `qwen/qwen3.6-flash` via OpenRouter.

## Technologies used

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![StyleX](https://img.shields.io/badge/StyleX-5C2D91?style=for-the-badge&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-443E38?style=for-the-badge&logoColor=white)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-FF4154?style=for-the-badge&logo=reactquery&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Mux](https://img.shields.io/badge/Mux-FA50B5?style=for-the-badge&logoColor=white)
![Biome](https://img.shields.io/badge/Biome-60A5FA?style=for-the-badge&logo=biome&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?style=for-the-badge&logo=bun&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

## Contact

Tomasz Kierzenkowski - zivavu@gmail.com

Project Link: https://github.com/zivavu/Clonagram
