# Multi-brand product discovery

FYTTS has a server-side SerpApi Google Shopping adapter and a search/import panel in **Find a similar fit → Step 2**. The local connection was activated and a live H&M search returned 12 listings on 2026-10-23. Other deployments need their own private key; coverage for the other brands has not been verified individually. No demo listings are returned by the website when the key is missing. Tests use an isolated provider fixture.

Search brands: H&M, Zara, Mango, Westside, Zudio, Yousta, Being Human, Levi’s and Pantaloons. These are search filters, not direct brand partnerships. Google Shopping coverage varies; a brand can return no listings or related products from other brands. Results include the named seller and original product/result link. Users must check brand and garment category before import. Some links open a Google Shopping product page rather than the merchant directly.

## Activate privately

1. Create an account at https://serpapi.com/users/sign_up and check the plan's allowance and billing settings. FYTTS does not create accounts or purchase credits.
2. Copy the private API key from https://serpapi.com/dashboard.
3. Open this project's ignored `.env` and fill the existing blank `SERPAPI_API_KEY=` line. Do not put the key in chat, source control, browser code, or a `NEXT_PUBLIC_` variable.
4. Restart FYTTS, sign in, choose a measured wardrobe reference, and open **Find a similar fit → Add alternatives**.
5. Select a brand, enter a product description, and search. Check a listing, select the alternative it should replace, and confirm its brand and category.
6. Verify size, fabric, stretch and measurements from the retailer before comparing. Replacing an alternative clears its previous measurements. The saved comparison includes a listing snapshot (source URL, seller, price label and retrieval time).

No Supabase change or database migration is needed; comparison JSON already supports snapshots. A missing key leaves manual entry and a clearly labelled external Google Shopping link available.

## Data limits

- Prices are displayed exactly as reported, with their original currency label; FYTTS does not invent currency, discounts, or conversions. The search market is India (`gl=in`, `hl=en`).
- Prices are search-index observations, not guaranteed real-time retailer quotes. The retrieval time is shown, and results cache for five minutes. Saved prices remain historical snapshots.
- A listing or delivery estimate does not prove stock or availability in a particular size. Availability stays **Check with seller** unless the source explicitly reports **Out of stock**.
- This adapter does not fetch structured size charts, size-level inventory, fabric, stretch, or numeric garment measurements. Source links let users consult the merchant. Those fields remain manual; no body-to-garment conversion or estimated fit score is generated.
- Coverage and images depend on the provider; no results, provider errors, missing images, quota errors, and invalid credentials have distinct handling. The app sends search terms, brand and category only; no wardrobe, measurements, cookies or account identities go to the provider. Product images may load directly from approved CDNs when results are displayed.

## API and operational limits

Authenticated `GET /api/catalogue/status` reports configuration presence and supported brands, never the key. Authenticated `GET /api/catalogue/search?brand=...&category=...&q=...` strictly validates the query before any provider request. UI searches run on submit, not each keystroke. Each account gets 12 attempts per minute. A shared per-process cap allows 30 provider requests per hour; identical in-flight searches coalesce. Limits and caches reset on API restart and are not billing guarantees across replicas; use provider-side quotas/billing controls in production.

The only network destination is `https://serpapi.com/search.json`; client/provider URLs are never fetched by the API. Requests have a 20-second timeout, two-megabyte response bound, no redirects, no automatic upstream retry, and a provider-429 cooldown. Only sanitized display fields leave the API. Raw provider payloads, errors, API URLs, and credentials are not returned or logged. HTTPS listing links are sanitized; product thumbnails are optional and restricted to known CDNs. The API does not proxy or download images.

References: https://serpapi.com/google-shopping-api and https://serpapi.com/shopping-results (checked 2026-10-23).
