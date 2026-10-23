# Architecture

Browser → Next.js `/api` proxy → NestJS → Supabase Auth, PostgreSQL and private Storage.

`apps/web`: responsive React interface, local font assets, form state and API requests. Cookies are HttpOnly; tokens are not stored in localStorage. Auth refresh is attempted once after a protected request expires.

`apps/api`: session verification, strict shared validation, origin checks, account-scoped CRUD and private uploads. Its default listener is loopback. Production requests must arrive through the same-origin proxy.

`packages/contracts`: Zod input schemas and shared TypeScript types. Unknown input fields are rejected, including attempts to set an owner ID.

`supabase/migrations`: authoritative SQL schema and ownership policies. Each table and each storage folder is restricted to the authenticated user. The `garments` bucket is private and allows only JPEG, PNG and WebP up to 5 MB. Image responses are authenticated, have `nosniff`, and cannot be cached publicly.

`prisma/schema.prisma`: validated database model, available for future server-side workflows that need Prisma. The user-facing API intentionally uses the user's Supabase token to preserve RLS. No elevated service key is used.

`LocalStore`: development/test adapter with serialized atomic writes and persistent signing secret. Local passwords use scrypt with random salts. Production configuration rejects this adapter.

## Data

Profile: auth user ID, display name, preferred fit.

Garment: generated UUID, owner auth user ID, validated garment details, optional measurement map in cm, private image path, timestamps. Measurements describe the saved garment, not a person's body. Category, comfort, stretch, silhouette and perfect-fit flag are explicit inputs.

## Measurement comparisons

`ComparisonService` validates the new product, checks reference ownership and matching category, requires confirmation of a shared measurement method, and computes one-decimal signed differences for dimensions available on both pieces. Tops use chest, waist and length; trousers and jeans use waist, hip and length; dresses and Other use all four dimensions. At least one shared dimension is required. Unavailable values remain null. No overall fit score or confidence estimate is generated.

Each comparison keeps the reference snapshot, product input, measurement method, versioned result, timestamps and feedback. Snapshots survive wardrobe edits/deletion. LocalStore adds an empty comparisons collection when reading a pre-existing local database. Cloud comparisons are protected by ownership RLS and an owner/timestamp index. The browser does not supply the result or owner ID.

## Alternatives and shortlists

Alternative sets reuse the private `comparisons` collection/table. Each record has optional `set` metadata (generated set ID, search name, option position, common dimensions) and a `shortlisted` boolean. Existing records without this metadata remain ordinary single-product checks. No additional schema migration is required for these JSON fields.

`POST /api/comparisons/sets` validates two to five alternatives, reference ownership, matching categories and a shared measurement basis before writing anything. Local writes are serialized and atomic; the cloud adapter inserts the full array with one request. Each option retains its reference snapshot and feedback.

`rankAlternatives` compares only dimensions present in every product and the reference. It orders by the sum of absolute differences rounded to tenths, computes the displayed average over the same basis, and gives identical ranks to tied totals. Ordering is unchanged by shortlist filtering. It does not estimate fit confidence or factor fabric into a numerical prediction.

Shortlist and feedback updates modify their own fields while preserving set metadata. Cloud writes use the previous timestamp as a concurrency condition and return a conflict when another write wins. Local updates operate on the latest serialized record. The interface ignores older mutation responses. Tests cover both adapters' relevant behavior; actual cloud email signup remains a separate deployment check.

## Next milestone

Define and validate the fit model and confidence rules before returning a score. Then add automatic retailer/product entry and validate similarity suggestions with real fit feedback. Billing, third-party retailer scraping and recommendation models are outside the current milestone.
