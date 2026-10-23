import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Get,
  HttpException,
  Inject,
  Injectable,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  catalogueBrands,
  catalogueSearchSchema,
  type CatalogueProduct,
  type CatalogueResults,
} from "@fytts/contracts";
import { AuthGuard, type UserRequest } from "./auth";

// Provider URLs are fixed. Client input never selects a network destination.
const ENDPOINT = "https://serpapi.com/search.json";
const TTL = 5 * 60_000;
export function publicHttps(raw: unknown, image = false): string | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      !host.includes(".") ||
      /[:\[\]]/.test(host) ||
      /^[\d.]+$/.test(host) ||
      /\.(local|localhost|internal|test|invalid)$/.test(host)
    )
      return null;
    // Images are optional: only load known product-image CDNs, never provider API URLs.
    if (
      image &&
      !["gstatic.com", "googleusercontent.com", "cdn.shopify.com"].some(
        (h) => host === h || host.endsWith("." + h),
      )
    )
      return null;
    if (
      host === "serpapi.com" ||
      [...u.searchParams.keys()].some((k) => /api.?key|token|secret/i.test(k))
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
function plain(value: unknown, max: number) {
  return typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, "")
        .replace(/[\u0000-\u001f]/g, " ")
        .trim()
        .slice(0, max)
    : "";
}
export function normalizeShopping(
  payload: any,
  checkedAt: string,
): CatalogueProduct[] {
  if (!Array.isArray(payload?.shopping_results)) return [];
  const seen = new Set<string>();
  return payload.shopping_results
    .slice(0, 40)
    .flatMap((p: any) => {
      if (!p || typeof p !== "object") return [];
      const url = publicHttps(p.product_link) || publicHttps(p.link);
      const title = plain(p.title, 100);
      if (!url || title.length < 2 || seen.has(url)) return [];
      seen.add(url);
      const hints = [
        p.tag,
        p.badge,
        p.snippet,
        ...(Array.isArray(p.extensions) ? p.extensions : []),
      ]
        .filter((v) => typeof v === "string")
        .join(" ");
      return [
        {
          id: createHash("sha256").update(url).digest("hex").slice(0, 24),
          title,
          image: publicHttps(p.thumbnail, true),
          // A shopping result or delivery estimate does not establish size-level stock.
          availability: /out of stock|sold out|unavailable/i.test(hints)
            ? ("Out of stock" as const)
            : ("Check with seller" as const),
          source: {
            provider: "serpapi" as const,
            url,
            seller: plain(p.source, 120) || "Seller not provided",
            priceLabel: plain(p.price, 80) || null,
            checkedAt,
          },
        },
      ];
    })
    .slice(0, 12);
}
@Injectable()
export class CatalogueService {
  private cache = new Map<
    string,
    { expires: number; result: CatalogueResults }
  >();
  private pending = new Map<string, Promise<CatalogueResults>>();
  private users = new Map<string, { until: number; count: number }>();
  private budget = { until: 0, count: 0 };
  private cooldown = 0;
  status() {
    return {
      configured: !!process.env.SERPAPI_API_KEY?.trim(),
      brands: catalogueBrands,
    };
  }
  async search(userId: string, raw: unknown): Promise<CatalogueResults> {
    const parsed = catalogueSearchSchema.safeParse(raw);
    if (!parsed.success)
      throw new BadRequestException(
        "Choose a supported brand and enter 2–80 characters to search.",
      );
    const apiKey = process.env.SERPAPI_API_KEY?.trim();
    if (!apiKey)
      throw new ServiceUnavailableException(
        "Product search is awaiting connection. Add the product-data API key on the server first.",
      );
    const now = Date.now();
    for (const [k, v] of this.users) if (v.until <= now) this.users.delete(k);
    const user = this.users.get(userId) || { until: now + 60_000, count: 0 };
    this.users.set(userId, user);
    if (++user.count > 12)
      throw new HttpException(
        "Please wait a minute before searching again.",
        429,
      );
    const query = parsed.data;
    const key = JSON.stringify([
      query.brand,
      query.category,
      query.q.toLowerCase(),
    ]);
    const cached = this.cache.get(key);
    if (cached && cached.expires > now)
      return { ...cached.result, cached: true };
    if (now < this.cooldown)
      throw new HttpException(
        "Product search is temporarily limited. Please try again later.",
        429,
      );
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.budget.until <= now)
      this.budget = { until: now + 3_600_000, count: 0 };
    // Conservative shared per-process cap to protect the account's search allowance.
    if (++this.budget.count > 30)
      throw new HttpException(
        "The product-search allowance for this hour has been reached. Please try later.",
        429,
      );
    const task = this.fetchResults(query, apiKey).then((result) => {
      for (const [k, v] of this.cache)
        if (v.expires <= Date.now()) this.cache.delete(k);
      if (this.cache.size >= 100)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { expires: Date.now() + TTL, result });
      return result;
    });
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
  private async fetchResults(
    query: { brand: string; category: string; q: string },
    apiKey: string,
  ): Promise<CatalogueResults> {
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({
      engine: "google_shopping",
      api_key: apiKey,
      gl: "in",
      hl: "en",
      q: `${query.brand} ${query.category === "Other" ? "clothing" : query.category} ${query.q}`,
    }).toString();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 20_000);
    try {
      const res = await fetch(url, {
        signal: abort.signal,
        redirect: "error",
        headers: { Accept: "application/json" },
      });
      if (res.status === 429) {
        this.cooldown = Date.now() + 60_000;
        throw new HttpException(
          "The product-data provider has reached its search limit. Please try again later.",
          429,
        );
      }
      if (res.status === 401 || res.status === 403)
        throw new ServiceUnavailableException(
          "The product-data connection needs attention. Check the API key and account allowance.",
        );
      if (!res.ok || !res.headers.get("content-type")?.includes("json"))
        throw new Error("Invalid provider response");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Empty provider response");
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 2_000_000) {
          await reader.cancel();
          throw new Error("Provider response too large");
        }
        chunks.push(value);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (
        payload.error ||
        (payload.search_metadata?.status &&
          payload.search_metadata.status !== "Success")
      )
        throw new Error("Provider search failed");
      if (
        !Array.isArray(payload.shopping_results) &&
        !payload.search_information
      )
        throw new Error("Unrecognized search response");
      const checkedAt = new Date().toISOString();
      return {
        products: normalizeShopping(payload, checkedAt),
        checkedAt,
        cached: false,
      };
    } catch (e) {
      if (e instanceof HttpException) throw e;
      // Never expose the request URL, API key, or raw provider errors.
      throw new BadGatewayException(
        "Product search could not load right now. Please try again later or enter details manually.",
      );
    } finally {
      clearTimeout(timer);
      abort.abort();
    }
  }
}
@Controller("catalogue")
@UseGuards(AuthGuard)
export class CatalogueController {
  constructor(
    @Inject(CatalogueService) private readonly service: CatalogueService,
  ) {}
  @Get("status") status() {
    return this.service.status();
  }
  @Get("search") search(@Req() req: UserRequest, @Query() query: unknown) {
    return this.service.search(req.identity.id, query);
  }
}
