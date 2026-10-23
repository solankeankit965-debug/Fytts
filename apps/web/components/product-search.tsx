"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Search, LoaderCircle, Check } from "lucide-react";
import {
  catalogueBrands,
  type CatalogueStatus,
  type CatalogueProduct,
  type CatalogueResults,
  type ComparisonInput,
  type Garment,
} from "@fytts/contracts";
import { api } from "../lib/api";
type Product = ComparisonInput["product"];
export default function ProductSearch({
  category,
  options,
  disabled,
  onUse,
}: {
  category: Garment["category"];
  options: { key: string; product: Product }[];
  disabled: boolean;
  onUse: (key: string, product: Product) => void;
}) {
  const [brand, setBrand] = useState<(typeof catalogueBrands)[number]>("H&M");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CatalogueStatus | null>(null);
  const [results, setResults] = useState<CatalogueResults | null>(null);
  const [selected, setSelected] = useState<CatalogueProduct | null>(null);
  const [target, setTarget] = useState(options[0]?.key || "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef(0);
  useEffect(() => {
    let active = true;
    api<CatalogueStatus>("/catalogue/status")
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch(() => {
        if (active)
          setError(
            "Product search connection could not be checked. Try reopening this step.",
          );
      });
    return () => {
      active = false;
      request.current++;
    };
  }, []);
  function change() {
    request.current++;
    setBusy(false);
    setResults(null);
    setSelected(null);
    setConfirmed(false);
    setError("");
    setNotice("");
  }
  async function search(e: FormEvent) {
    e.preventDefault();
    const id = ++request.current;
    setBusy(true);
    setResults(null);
    setSelected(null);
    setConfirmed(false);
    setError("");
    setNotice("");
    try {
      const params = new URLSearchParams({ brand, category, q: query.trim() });
      const data = await api<CatalogueResults>("/catalogue/search?" + params);
      if (id === request.current) setResults(data);
    } catch (e) {
      if (id === request.current) setError((e as Error).message);
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  const targetIndex = options.findIndex((o) => o.key === target);
  const google =
    "https://www.google.com/search?" +
    new URLSearchParams({
      udm: "28",
      gl: "in",
      hl: "en",
      q: `${brand} ${category === "Other" ? "clothing" : category} ${query.trim()}`,
    });
  return (
    <section
      className="product-discovery"
      aria-labelledby="product-discovery-title"
    >
      <div className="discovery-heading">
        <div>
          <p className="eyebrow">FROM THE WEB / INDIA</p>
          <h3 id="product-discovery-title">FIND YOUR NEXT OPTION.</h3>
        </div>
        <Search size={25} />
      </div>
      <p className="helper">
        Search your chosen brand, check the seller, then bring a product into
        your comparison. Listings can include third-party sellers and related
        products.
      </p>
      <form onSubmit={search} className="catalogue-search-form">
        <label>
          Brand
          <select
            value={brand}
            onChange={(e) => {
              change();
              setBrand(e.target.value as typeof brand);
            }}
            disabled={disabled}
          >
            {catalogueBrands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          What are you looking for?
          <input
            value={query}
            onChange={(e) => {
              change();
              setQuery(e.target.value);
            }}
            minLength={2}
            maxLength={80}
            required
            placeholder="e.g. relaxed cotton, black denim"
            disabled={disabled}
          />
        </label>
        <button
          type="submit"
          className="primary"
          disabled={disabled || busy || !status?.configured}
        >
          {busy ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Search size={17} />
          )}
          {busy ? "Searching…" : "Find products"}
        </button>
      </form>
      {status && !status.configured && (
        <p className="catalogue-connection" role="status">
          Product search is awaiting connection. You can browse Google Shopping
          and enter the product details below in the meantime.
        </p>
      )}
      <a
        className="catalogue-external"
        href={google}
        target="_blank"
        rel="noopener noreferrer"
      >
        Search {brand} on Google Shopping <ArrowUpRight size={15} />
      </a>
      <p className="catalogue-fineprint">
        Search terms and your chosen brand are sent to the product-data service
        when you search. Your wardrobe, account details, and measurements stay
        in FYTTS.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          <Check size={15} />
          {notice}
        </p>
      )}
      {results && (
        <>
          <p className="catalogue-meta" role="status">
            {results.products.length} listings ·{" "}
            {results.cached ? "Recent results" : "Retrieved"}{" "}
            {new Date(results.checkedAt).toLocaleString()} · Prices and stock
            can change. Confirm with the seller.
          </p>
          {!results.products.length && (
            <p className="catalogue-connection">
              No listings returned for this search. Try a different product
              description, browse Google Shopping, or add an option manually.
            </p>
          )}
          <div className="catalogue-results">
            {results.products.map((p) => (
              <article
                key={p.id}
                className={
                  "catalogue-card " + (selected?.id === p.id ? "chosen" : "")
                }
              >
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="catalogue-no-image">
                    <Search size={26} />
                    <span>No product image</span>
                  </div>
                )}
                <div className="catalogue-card-body">
                  <small>SELLER / {p.source.seller}</small>
                  <h4>{p.title}</h4>
                  <strong>{p.source.priceLabel || "Price not provided"}</strong>
                  <p>{p.availability}</p>
                  <a
                    href={p.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View listing & size-guide information{" "}
                    <ArrowUpRight size={14} />
                  </a>
                  <button
                    type="button"
                    className="secondary"
                    disabled={disabled || p.availability === "Out of stock"}
                    onClick={() => {
                      setSelected(p);
                      setConfirmed(false);
                      setNotice("");
                      if (!options.some((o) => o.key === target))
                        setTarget(options[0]?.key || "");
                    }}
                  >
                    {selected?.id === p.id ? "Selected" : "Choose this listing"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {selected && (
        <section
          className="catalogue-import"
          aria-label="Confirm product import"
        >
          <h4>BRING IT INTO YOUR COMPARISON.</h4>
          <p>
            {selected.title} · {selected.source.seller}
          </p>
          <label>
            Which alternative should this replace?
            <select
              value={targetIndex < 0 ? "" : target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={disabled}
            >
              <option value="" disabled>
                Choose an alternative
              </option>
              {options.map((o, i) => (
                <option value={o.key} key={o.key}>
                  Option {i + 1}
                  {o.product.name ? " — " + o.product.name : " — empty"}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={disabled}
            />
            <span>
              I checked the listing: this is a {brand} {category.toLowerCase()}.
            </span>
          </label>
          <p className="helper">
            This replaces the selected option’s details and measurements. Size,
            fabric, stretch and garment measurements need to be checked against
            the retailer’s guide. A listing alone does not confirm stock in your
            size.
          </p>
          <button
            className="primary"
            type="button"
            disabled={disabled || !confirmed || targetIndex < 0}
            onClick={() => {
              onUse(target, {
                name: selected.title,
                brand,
                category,
                labelSize: "",
                fabric: "",
                stretch: "None",
                measurements: {},
                source: selected.source,
              });
              setNotice(
                `Added to Option ${targetIndex + 1}. Check size, fabric, stretch, and measurements below before comparing.`,
              );
              setSelected(null);
              setConfirmed(false);
            }}
          >
            Replace Option {targetIndex < 0 ? "—" : targetIndex + 1}
            <ArrowUpRight size={16} />
          </button>
        </section>
      )}
    </section>
  );
}
