# FYTTS

A working personal wardrobe application built with TypeScript, Next.js, React, NestJS and Supabase PostgreSQL/Auth/Storage. The original Figma embed remains in `index.html`, so the existing GitHub Pages prototype is preserved.

## Working features

- Sign up, confirm email, sign in, refresh a session, and sign out.
- Edit your name and preferred fit.
- Add, view, edit and remove garments; search and filter your collection.
- Save fit notes, optional garment measurements in centimetres, and perfect-fit references.
- Upload a private JPEG, PNG or WebP photo (maximum 5 MB).
- Keep records isolated per account, enforced by the API and PostgreSQL row-level policies.

- Compare a new product with a saved garment in the same category.
- Review signed measurement differences, fabric and stretch details, and missing data.
- Save comparison snapshots and record actual fit feedback.

- Build a similar-fit search with two to five manually entered alternatives.
- Order alternatives using the same shared dimensions and save a private shortlist.

The multi-brand product-search/import integration is implemented, and a live H&M search was verified locally on 2026-10-23. Each deployment needs its own private SerpApi key. No simulated listings or fit scores are shown. See [product-search setup](docs/product-search.md) for supported brands, activation and data limitations.

### Check a new fit

Open **Check a new fit** in the sidebar. Enter product details and at least one garment measurement in centimetres. Choose circumference or flat width, then select a reference in the same category with at least one matching measurement. Confirm that both garments use the same measuring method and landmarks before comparing.

Results describe the new garment relative to the reference. Positive chest/waist/hip differences mean more measurement; positive length differences mean longer. Values are rounded to one decimal place. Missing dimensions are shown explicitly and never estimated. Fabric and stretch differences are reported without an invented comfort score.

Checks save automatically. Open **Saved checks** to revisit one and record feedback after trying the garment. Reference snapshots remain unchanged when the wardrobe piece is edited or deleted. Local mode stores these alongside your wardrobe on this computer; cloud mode uses the private `comparisons` table.

### Find a similar fit

Open **Find a similar fit**, choose a measured wardrobe reference, and enter two to five products from the same category. Brand autocomplete is available in each product form. Confirm that every garment uses the same measurement method and landmarks.

All alternatives must have at least one dimension in common with the reference and each other. Ordering uses the average absolute measurement difference over that shared basis, with differences rounded to tenths of a centimetre. Missing dimensions do not improve an option's position; tied totals keep the same rank. Fabric and stretch are displayed separately and do not affect ordering. This is a measurement comparison, not a predicted fit score.

The search is saved automatically. Mark individual alternatives as shortlisted, filter the table to shortlisted pieces, and add feedback after trying them. Reopen the set under **Saved searches**. Single-product checks continue to live under **Check a new fit**. Step 2 also includes product discovery for nine selected brands. Once a SerpApi key is configured, users can retrieve Shopping listings and import a title, confirmed brand, source link and historical price into an alternative. Garment measurements, size, fabric and stretch remain manual; stock is not assumed. Without a key, manual entry and an external Shopping search are available. See [setup and limitations](docs/product-search.md).

## Run locally

Requires Node 22.12+ (Node 24 recommended).

```sh
npm ci
cp .env.example .env
npm run dev:local
```

Open http://127.0.0.1:3000. Local mode persists accounts, salted password hashes, garment records and private photos in `.data/`. It is for development only; production refuses to start with local authentication or file storage. Create a test account through the app. No credentials are committed.

## Cloud configuration

The FYTTS Supabase project has been created and the SQL migration applied. This checkout's ignored `.env` contains its public API configuration. Other checkouts need:

```dotenv
AUTH_MODE=supabase
DATA_MODE=supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_STORAGE_BUCKET=garments
WEB_ORIGIN=http://127.0.0.1:3000
```

Then run `npm run dev`. Add the exact website origin to Supabase Authentication's allowed redirect URLs. Keep email confirmation enabled; after confirming, return to the website and sign in. Production email delivery should use your configured SMTP provider.

For a fresh project apply the SQL files in `supabase/migrations` in filename order, starting with `001_wardrobe.sql`. Both wardrobe and comparison migrations have already been applied to the FYTTS project; do not reapply them.

Cloud requests use the signed-in user's access token and RLS through the Supabase client. No service-role key is needed. `prisma/schema.prisma` describes the database and is validated during builds; Prisma is not the request-time database adapter in this milestone. The SQL migration owns RLS, storage policies and auth foreign keys, which the Prisma schema does not fully represent. Do not run `prisma db push` against this database.

## Checks

```sh
npm test
npm run typecheck
npm run build
npm run format:check
npm audit
```

The API integration test uses isolated disposable local data and verifies account separation, unauthorized mutations, invalid measurements, rejected image types, authenticated photo access, profile updates, deletion, and restart persistence. It also tests private comparison history, atomic alternative sets, shared-basis ordering and ties, shortlists, feedback, reference snapshots after edit/deletion, backward compatibility with existing local data, invalid categories, missing measurements and rounding. Mocked cloud-client tests verify metadata preservation and optimistic update-conflict handling; they do not exercise a real user's cloud account. It does not send real emails. The cloud migration was separately checked with transactional RLS fixtures, rolled back after testing. Real confirmation emails and a full cloud signup have not been tested with a user's mailbox.

## Deployment

GitHub stores the source. GitHub Pages can serve the original embed, but cannot run the Next.js and NestJS servers.

The included Dockerfile runs both servers in one container. Build it and provide cloud environment variables at runtime:

```sh
docker build -t fytts .
docker run --rm -p 3000:3000 --env-file .env.production fytts
```

Set `NODE_ENV=production`, `AUTH_MODE=supabase`, `DATA_MODE=supabase`, and `WEB_ORIGIN=https://YOUR_DOMAIN`. Serve the container behind HTTPS. The Next server is public on port 3000; the API listens privately on loopback port 4000. `/api` is proxied through Next so HttpOnly cookies remain on the website origin. Secure cookies require HTTPS in production.

For separate frontend/backend hosts, set `API_INTERNAL_URL` to the backend origin **at frontend build time** and keep `WEB_ORIGIN` equal to the public frontend origin. A separately hosted API needs `API_HOST=0.0.0.0` and an HTTPS endpoint; set `API_PORT` to the port expected by that host. There is no public server deployment yet; a Node/container hosting account is required. Docker execution has not been verified on this machine because its daemon is not running.

The authentication limiter is per API process; use a shared limiter before deploying multiple replicas. Local JSON storage is not a production substitute.

See [architecture](docs/architecture.md) for boundaries and the next milestone.
