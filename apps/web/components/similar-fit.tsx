"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Heart,
  Plus,
  RefreshCw,
  Search,
  Shirt,
  Trash2,
  LoaderCircle,
} from "lucide-react";
import {
  categoryMeasurements,
  commonAlternativeMeasurements,
  rankAlternatives,
  feedbackOptions,
  stretches,
  type AlternativeSetInput,
  type ComparisonInput,
  type FitComparison,
  type Garment,
  type MeasurementKey,
  type ComparisonFeedback,
} from "@fytts/contracts";
import { api } from "../lib/api";
import BrandInput from "./brand-input";
import ProductSearch from "./product-search";
type Product = ComparisonInput["product"];
type Draft = { key: string; product: Product };
const labels: Record<MeasurementKey, string> = {
  chest: "Chest",
  waist: "Waist",
  hip: "Hip",
  length: "Length",
};
function empty(category: Garment["category"]): Product {
  return {
    name: "",
    brand: "",
    category,
    labelSize: "",
    fabric: "",
    stretch: "None",
    measurements: {},
  };
}
function fresh(category: Garment["category"]): Draft[] {
  return [
    { key: "option-1", product: empty(category) },
    { key: "option-2", product: empty(category) },
  ];
}
function difference(delta: number | null, key: MeasurementKey) {
  return delta === null
    ? "Not compared"
    : delta === 0
      ? "Same measurement"
      : `${Math.abs(delta).toFixed(1)} cm ${key === "length" ? (delta > 0 ? "longer" : "shorter") : delta > 0 ? "more" : "less"}`;
}
export default function SimilarFit({
  garments,
  mode,
  onAddReference,
  onEditReference,
}: {
  garments: Garment[];
  mode: "local" | "supabase";
  onAddReference: () => void;
  onEditReference: (g: Garment) => void;
}) {
  const [view, setView] = useState<"new" | "saved">("new"),
    [step, setStep] = useState(1),
    [referenceId, setReferenceId] = useState(""),
    [name, setName] = useState(""),
    [products, setProducts] = useState<Draft[]>(fresh("Shirt")),
    [method, setMethod] =
      useState<AlternativeSetInput["measurementMethod"]>("Circumference"),
    [confirmed, setConfirmed] = useState(false),
    [all, setAll] = useState<FitComparison[]>([]),
    [activeId, setActiveId] = useState(""),
    [onlySaved, setOnlySaved] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [busyId, setBusyId] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const heading = useRef<HTMLHeadingElement>(null),
    counter = useRef(3);
  const reference = garments.find((g) => g.id === referenceId),
    checks = all.filter((c) => c.set?.id === activeId),
    ranked = rankAlternatives(checks),
    visible = onlySaved
      ? ranked.filter((c) => c.comparison.shortlisted)
      : ranked;
  const groups = Array.from(
    all
      .reduce((map, c) => {
        if (c.set) {
          const list = map.get(c.set.id) || [];
          list.push(c);
          map.set(c.set.id, list);
        }
        return map;
      }, new Map<string, FitComparison[]>())
      .values(),
  );
  async function load() {
    setLoading(true);
    setError("");
    try {
      setAll((await api<FitComparison[]>("/comparisons")).filter((c) => c.set));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [step, view]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  function choose(g: Garment) {
    setReferenceId(g.id);
    setProducts(fresh(g.category));
    counter.current = 3;
    setName(("Alternatives for " + g.name).slice(0, 100));
    setConfirmed(false);
  }
  function reset() {
    setView("new");
    setStep(1);
    setReferenceId("");
    setProducts(fresh("Shirt"));
    counter.current = 3;
    setName("");
    setConfirmed(false);
    setActiveId("");
    setOnlySaved(false);
    setError("");
    setNotice("");
  }
  function open(group: FitComparison[]) {
    setActiveId(group[0].set!.id);
    setView("new");
    setStep(3);
    setOnlySaved(false);
    setError("");
    setNotice("");
  }
  function replace(c: FitComparison) {
    setAll((xs) =>
      xs.map((x) =>
        x.id === c.id && Date.parse(c.updatedAt) >= Date.parse(x.updatedAt)
          ? c
          : x,
      ),
    );
  }
  async function compare(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!reference) {
      setError("Choose a reference garment first.");
      setStep(1);
      return;
    }
    const common = commonAlternativeMeasurements(
      reference,
      products.map((p) => p.product),
    );
    if (!common.length) {
      setError(
        "Enter at least one of the same measurements for every alternative and your reference.",
      );
      return;
    }
    if (!confirmed) {
      setError("Confirm all pieces use the same measurement method.");
      return;
    }
    setBusy(true);
    try {
      const saved = await api<FitComparison[]>("/comparisons/sets", {
        method: "POST",
        body: JSON.stringify({
          name,
          referenceId,
          products: products.map((p) => p.product),
          measurementMethod: method,
          sameMethodConfirmed: true,
        }),
      });
      setAll((xs) => [...saved, ...xs]);
      open(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(c: FitComparison) {
    setBusyId(c.id);
    setError("");
    try {
      const saved = await api<FitComparison>(
        "/comparisons/" + c.id + "/shortlist",
        {
          method: "PATCH",
          body: JSON.stringify({ shortlisted: !c.shortlisted }),
        },
      );
      replace(saved);
      setNotice(
        saved.shortlisted
          ? "Added to your shortlist."
          : "Removed from your shortlist.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId("");
    }
  }
  return (
    <div className="similar-fit">
      <div className="intro">
        <div>
          <p className="eyebrow">
            KEEP THE FEELING. EXPLORE THE POSSIBILITIES.
          </p>
          <h1>
            MORE LIKE
            <br />
            <span>YOUR FAVOURITE.</span>
          </h1>
          <p className="subtitle">
            Bring the alternatives you’re eyeing. Find the closest measurements
            to a piece you love.
          </p>
        </div>
        <div className="similar-stamp">
          <Search size={29} />
          <span>
            YOUR FIT.
            <br />
            MORE OPTIONS.
          </span>
        </div>
      </div>
      {mode === "local" && (
        <p className="dev-note">
          Local testing · saved comparisons, shortlists and feedback stay on
          this computer. Product searches use an external service when
          connected.
        </p>
      )}
      <div className="check-tabs">
        <button
          className={view === "new" ? "selected" : ""}
          onClick={() => {
            setView("new");
            setError("");
          }}
        >
          <Search size={16} />
          New search
        </button>
        <button
          className={view === "saved" ? "selected" : ""}
          onClick={() => {
            setView("saved");
            setNotice("");
            load();
          }}
        >
          <Heart size={16} />
          Saved searches<span>{groups.length.toString().padStart(2, "0")}</span>
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert" ref={errorRef} tabIndex={-1}>
          {error}
          <button className="text-button" onClick={load}>
            Reload saved searches
            <RefreshCw size={13} />
          </button>
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      {view === "saved" ? (
        <section>
          <h2 ref={heading} tabIndex={-1}>
            GOOD OPTIONS, KEPT.
          </h2>
          <p className="helper">
            Reopen a search to change your shortlist or record how each piece
            actually fit.
          </p>
          {loading ? (
            <p className="check-loading">
              <LoaderCircle size={19} className="spin" />
              Opening saved searches…
            </p>
          ) : groups.length ? (
            <div className="history-list">
              {groups.map((group) => (
                <button
                  key={group[0].set!.id}
                  className="history-card"
                  onClick={() => open(group)}
                >
                  <span className="history-icon">
                    <Heart size={23} />
                  </span>
                  <span>
                    <small>
                      {group[0].reference.category.toUpperCase()} ·{" "}
                      {new Date(group[0].createdAt).toLocaleDateString()}
                    </small>
                    <strong>{group[0].set!.name}</strong>
                    <small>
                      Reference: {group[0].reference.name} · {group.length}{" "}
                      alternatives
                    </small>
                  </span>
                  <span className="history-outcome">
                    {group.filter((c) => c.shortlisted).length} shortlisted
                  </span>
                  <ArrowUpRight size={19} />
                </button>
              ))}
            </div>
          ) : (
            !error && (
              <div className="empty">
                <Search size={35} />
                <h2>MAKE YOUR NEXT SHORTLIST.</h2>
                <p>
                  Start with a favourite garment, then add two to five
                  alternatives you’re considering.
                </p>
                <button className="primary" onClick={reset}>
                  Find a similar fit
                  <ArrowRight size={17} />
                </button>
              </div>
            )
          )}
        </section>
      ) : (
        <>
          <div className="check-progress">
            {["Your favourite", "Alternatives", "Compare & shortlist"].map(
              (s, i) => (
                <span
                  key={s}
                  className={
                    step === i + 1 ? "current" : step > i + 1 ? "complete" : ""
                  }
                >
                  <b>{step > i + 1 ? <Check size={13} /> : i + 1}</b>
                  {s}
                </span>
              ),
            )}
          </div>
          {step === 1 && (
            <section className="check-panel">
              <p className="eyebrow">01 / THE FIT YOU KNOW</p>
              <h2 ref={heading} tabIndex={-1}>
                WHICH PIECE SETS THE STANDARD?
              </h2>
              <p className="helper">
                Choose a saved garment with at least one measurement. Pieces
                marked as perfect fits appear first.
              </p>
              {garments.length ? (
                <div className="reference-list">
                  {[...garments]
                    .sort(
                      (a, b) =>
                        Number(b.perfectFit) - Number(a.perfectFit) ||
                        a.name.localeCompare(b.name),
                    )
                    .map((g) => {
                      const measured = categoryMeasurements(g.category).filter(
                        (k) => g.measurements[k] !== undefined,
                      );
                      return (
                        <article
                          key={g.id}
                          className={
                            "reference-option " +
                            (referenceId === g.id ? "chosen" : "")
                          }
                        >
                          <label className="reference-radio">
                            <input
                              type="radio"
                              name="similar-reference"
                              disabled={!measured.length}
                              checked={referenceId === g.id}
                              onChange={() => choose(g)}
                            />
                            <span>
                              <strong>
                                {g.name}
                                {g.perfectFit && <Heart size={14} />}
                              </strong>
                              <small>
                                {g.brand} · {g.category} · SIZE {g.labelSize}
                              </small>
                              <small>
                                {measured.length
                                  ? measured
                                      .map(
                                        (k) =>
                                          labels[k] +
                                          ": " +
                                          g.measurements[k] +
                                          " cm",
                                      )
                                      .join(" · ")
                                  : "Add measurements to use this reference."}
                              </small>
                            </span>
                          </label>
                          <button
                            className="text-button"
                            onClick={() => onEditReference(g)}
                          >
                            {measured.length
                              ? "Edit reference"
                              : "Add measurements"}
                            <ArrowUpRight size={13} />
                          </button>
                        </article>
                      );
                    })}
                </div>
              ) : (
                <div className="empty">
                  <Shirt size={36} />
                  <h2>START WITH A FAVOURITE.</h2>
                  <p>
                    Add a garment you love wearing and measure it. That becomes
                    your reference for the alternatives.
                  </p>
                  <button className="primary" onClick={onAddReference}>
                    <Plus size={17} />
                    Add a wardrobe piece
                  </button>
                </div>
              )}
              <div className="actions">
                <span className="tiny muted">01 OF 03</span>
                <button
                  className="primary"
                  disabled={
                    !reference ||
                    !categoryMeasurements(reference.category).some(
                      (k) => reference.measurements[k] !== undefined,
                    )
                  }
                  onClick={() => {
                    setStep(2);
                    setError("");
                  }}
                >
                  Add alternatives
                  <ArrowRight size={17} />
                </button>
              </div>
            </section>
          )}
          {step === 2 && reference && (
            <section>
              <div className="similar-section-heading">
                <div>
                  <p className="eyebrow">02 / BUILD THE OPTIONS</p>
                  <h2 ref={heading} tabIndex={-1}>
                    WHAT ELSE IS ON YOUR RADAR?
                  </h2>
                  <p className="helper">
                    Search for products or enter two to five alternatives
                    yourself. Check each product’s size, fabric and garment
                    measurements against the retailer’s guide before comparing.
                  </p>
                </div>
              </div>
              <div className="reference-summary">
                <span className="tiny">YOUR REFERENCE</span>
                <strong>{reference.name}</strong>
                <span>
                  {reference.brand} · {reference.category} · SIZE{" "}
                  {reference.labelSize}
                </span>
                <p>
                  {categoryMeasurements(reference.category)
                    .filter((k) => reference.measurements[k] !== undefined)
                    .map(
                      (k) =>
                        labels[k] + ": " + reference.measurements[k] + " cm",
                    )
                    .join(" / ")}
                </p>
              </div>
              <ProductSearch
                category={reference.category}
                options={products}
                disabled={busy}
                onUse={(key, product) => {
                  setProducts((xs) =>
                    xs.map((x) => (x.key === key ? { ...x, product } : x)),
                  );
                  setConfirmed(false);
                }}
              />
              <form onSubmit={compare}>
                <div className="check-panel search-details">
                  <div className="form-grid">
                    <label>
                      Name this search
                      <input
                        required
                        minLength={2}
                        maxLength={100}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <label>
                      Measurement method
                      <select
                        value={method}
                        onChange={(e) => {
                          setMethod(e.target.value as typeof method);
                          setConfirmed(false);
                        }}
                      >
                        <option>Circumference</option>
                        <option>Flat width</option>
                      </select>
                    </label>
                  </div>
                  <p className="helper">
                    Use centimetres and garment measurements.{" "}
                    {method === "Circumference"
                      ? "Chest, waist and hip go all the way around the garment."
                      : "Chest, waist and hip go straight across the garment laid flat."}{" "}
                    Length runs from top to hem. Match the method and landmarks
                    on every piece.
                  </p>
                </div>
                <div className="alternative-inputs">
                  {products.map((draft, i) => (
                    <AlternativeEditor
                      key={draft.key}
                      index={i}
                      product={draft.product}
                      reference={reference}
                      removable={products.length > 2}
                      disabled={busy}
                      onChange={(product) => {
                        setProducts((xs) =>
                          xs.map((x) =>
                            x.key === draft.key ? { ...x, product } : x,
                          ),
                        );
                        setConfirmed(false);
                      }}
                      onRemove={() => {
                        setProducts((xs) =>
                          xs.filter((x) => x.key !== draft.key),
                        );
                        setConfirmed(false);
                      }}
                    />
                  ))}
                </div>
                <button
                  className="add-alternative"
                  type="button"
                  disabled={products.length >= 5 || busy}
                  onClick={() => {
                    const key = "option-" + counter.current++;
                    setProducts((xs) => [
                      ...xs,
                      { key, product: empty(reference.category) },
                    ]);
                    setConfirmed(false);
                  }}
                >
                  <Plus size={20} />
                  {products.length >= 5
                    ? "Five alternatives added"
                    : "Add another alternative"}
                  <span>{products.length} / 5</span>
                </button>
                <label className="checkbox method-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    <strong>
                      All alternatives and my reference use the same measurement
                      method.
                    </strong>
                    <small>
                      I checked the size guides and measured using the same
                      landmarks.
                    </small>
                  </span>
                </label>
                <div className="actions">
                  <button
                    className="secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setStep(1);
                      setError("");
                    }}
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>
                  <button className="primary" disabled={!confirmed || busy}>
                    {busy ? "Saving search…" : "Compare alternatives"}
                    {busy ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <ArrowRight size={17} />
                    )}
                  </button>
                </div>
              </form>
            </section>
          )}
          {step === 3 && checks.length > 0 && (
            <section className="alternative-results">
              <div className="result-heading">
                <p className="eyebrow">03 / YOUR OPTIONS, SIDE BY SIDE</p>
                <h2 ref={heading} tabIndex={-1}>
                  {checks[0].set!.name}
                </h2>
                <p>
                  Reference: {checks[0].reference.name} ·{" "}
                  {checks[0].input.measurementMethod.toLowerCase()} ·
                  measurements in cm
                </p>
              </div>
              <div className="ranking-explainer">
                <strong>
                  Ordered by smallest average measurement difference.
                </strong>
                <p>
                  Every option uses the same basis:{" "}
                  {ranked[0]?.common
                    .map((k) => labels[k].toLowerCase())
                    .join(", ")}
                  . We average the absolute differences from your reference.
                  Fabric and stretch aren’t included in the order; these numbers
                  don’t predict comfort.
                </p>
              </div>
              <div className="shortlist-toolbar">
                <span>
                  {checks.filter((c) => c.shortlisted).length} of{" "}
                  {checks.length} shortlisted
                </span>
                <label>
                  <input
                    type="checkbox"
                    checked={onlySaved}
                    onChange={(e) => setOnlySaved(e.target.checked)}
                  />
                  Show shortlisted only
                </label>
                <button className="text-button" onClick={load}>
                  <RefreshCw size={13} />
                  Refresh
                </button>
              </div>
              {visible.length ? (
                <>
                  <div className="similar-table-wrap">
                    <table
                      className="similar-table"
                      style={{
                        minWidth: Math.max(660, (visible.length + 1) * 185),
                      }}
                    >
                      <caption className="sr-only">
                        Alternatives compared with {checks[0].reference.name}.
                        Average absolute difference uses only measurements
                        shared by every option.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">
                            <span className="tiny">YOUR REFERENCE</span>
                            <strong>{checks[0].reference.name}</strong>
                            <small>
                              {checks[0].reference.brand} · SIZE{" "}
                              {checks[0].reference.labelSize}
                            </small>
                          </th>
                          {visible.map(
                            ({ comparison: c, rank, meanDifference }) => (
                              <th scope="col" key={c.id}>
                                <span className="option-rank">
                                  #{rank} ON ENTERED MEASUREMENTS
                                </span>
                                <strong>{c.input.product.name}</strong>
                                <small>
                                  {c.input.product.brand} · SIZE{" "}
                                  {c.input.product.labelSize}
                                </small>
                                {c.input.product.source && (
                                  <small>
                                    {c.input.product.source.priceLabel ||
                                      "Price not provided"}{" "}
                                    · {c.input.product.source.seller}
                                    <br />
                                    <a
                                      href={c.input.product.source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ textDecoration: "underline" }}
                                    >
                                      View saved listing{" "}
                                      <ArrowUpRight
                                        size={12}
                                        style={{ display: "inline" }}
                                      />
                                    </a>
                                    <br />
                                    Price recorded{" "}
                                    {new Date(
                                      c.input.product.source.checkedAt,
                                    ).toLocaleDateString()}
                                    ; confirm current stock and price with
                                    seller.
                                  </small>
                                )}
                                <span className="average-delta">
                                  {meanDifference.toFixed(2)}{" "}
                                  <small>cm avg. difference</small>
                                </span>
                                <button
                                  type="button"
                                  className={
                                    "shortlist-button " +
                                    (c.shortlisted ? "saved" : "")
                                  }
                                  aria-pressed={!!c.shortlisted}
                                  aria-label={
                                    (c.shortlisted ? "Remove " : "Shortlist ") +
                                    c.input.product.name +
                                    (c.shortlisted ? " from shortlist" : "")
                                  }
                                  disabled={!!busyId}
                                  onClick={() => toggle(c)}
                                >
                                  <Heart
                                    size={15}
                                    fill={
                                      c.shortlisted ? "currentColor" : "none"
                                    }
                                  />
                                  {busyId === c.id
                                    ? "Saving…"
                                    : c.shortlisted
                                      ? "Shortlisted"
                                      : "Shortlist"}
                                </button>
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {categoryMeasurements(checks[0].reference.category).map(
                          (k) => (
                            <tr key={k}>
                              <th scope="row">
                                {labels[k]}
                                <strong>
                                  {checks[0].reference.measurements[k] ===
                                  undefined
                                    ? "Not entered"
                                    : checks[0].reference.measurements[
                                        k
                                      ]!.toFixed(1) + " cm"}
                                </strong>
                                {!ranked[0]?.common.includes(k) && (
                                  <small>Not used in order</small>
                                )}
                              </th>
                              {visible.map(({ comparison: c }) => {
                                const row = c.result.rows.find(
                                  (r) => r.key === k,
                                );
                                return (
                                  <td key={c.id}>
                                    <strong>
                                      {row?.product === null ||
                                      row?.product === undefined
                                        ? "Not entered"
                                        : row.product.toFixed(1) + " cm"}
                                    </strong>
                                    <span
                                      className={
                                        row?.delta === 0
                                          ? "delta equal"
                                          : row?.delta == null
                                            ? "delta missing"
                                            : row.delta > 0
                                              ? "delta more"
                                              : "delta less"
                                      }
                                    >
                                      {difference(row?.delta ?? null, k)}
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          ),
                        )}
                        <tr>
                          <th scope="row">
                            Fabric & stretch
                            <strong>{checks[0].reference.fabric}</strong>
                            <small>{checks[0].reference.stretch} stretch</small>
                          </th>
                          {visible.map(({ comparison: c }) => (
                            <td key={c.id}>
                              <strong>{c.input.product.fabric}</strong>
                              <span>{c.input.product.stretch} stretch</span>
                              {(c.result.fabricChanged ||
                                c.result.stretchChanged) && (
                                <small>Different from reference</small>
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <section className="alternative-feedback">
                    <h3>TRIED ANY OF THEM?</h3>
                    <p className="helper">
                      Save your experience for each alternative. Feedback stays
                      with this search.
                    </p>
                    <div>
                      {visible.map(({ comparison: c }) => (
                        <AlternativeFeedback
                          key={c.id}
                          comparison={c}
                          onSaved={(saved) => {
                            replace(saved);
                            setNotice("Fit feedback saved.");
                          }}
                        />
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                <div className="empty">
                  <Heart size={32} />
                  <h2>YOUR SHORTLIST IS OPEN.</h2>
                  <p>
                    Show all options and tap Shortlist on the pieces you want to
                    keep.
                  </p>
                  <button
                    className="primary"
                    onClick={() => setOnlySaved(false)}
                  >
                    Show all alternatives
                    <ArrowRight size={17} />
                  </button>
                </div>
              )}
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() => {
                    setView("saved");
                    load();
                  }}
                >
                  <ArrowLeft size={16} />
                  Saved searches
                </button>
                <button className="primary" onClick={reset}>
                  Start another search
                  <ArrowUpRight size={17} />
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
function AlternativeEditor({
  index,
  product,
  reference,
  removable,
  disabled,
  onChange,
  onRemove,
}: {
  index: number;
  product: Product;
  reference: Garment;
  removable: boolean;
  disabled: boolean;
  onChange: (p: Product) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset className="alternative-editor" disabled={disabled}>
      <legend>Alternative {String(index + 1).padStart(2, "0")}</legend>
      <div className="alternative-editor-head">
        <h3>OPTION {String(index + 1).padStart(2, "0")}</h3>
        <span>{reference.category}</span>
        <button
          type="button"
          aria-label={"Remove alternative " + (index + 1)}
          disabled={!removable}
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {product.source && (
        <div className="imported-source">
          <strong>Imported listing · {product.source.seller}</strong>
          <span>
            {product.source.priceLabel || "Price not provided"} · retrieved{" "}
            {new Date(product.source.checkedAt).toLocaleDateString()}
          </span>
          <a
            href={product.source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Check listing, stock & size guide <ArrowUpRight size={13} />
          </a>
          <small>
            Size, fabric, stretch and measurements below need your confirmation.
          </small>
        </div>
      )}
      <div className="form-grid">
        <label className="wide">
          Product name
          <input
            required
            minLength={2}
            maxLength={100}
            placeholder="The piece you’re considering"
            value={product.name}
            onChange={(e) =>
              onChange({ ...product, name: e.target.value, source: undefined })
            }
          />
        </label>
        <BrandInput
          value={product.brand}
          onChange={(brand) =>
            onChange({ ...product, brand, source: undefined })
          }
        />
        <label>
          Size on label
          <input
            required
            maxLength={30}
            placeholder="e.g. M / 32"
            value={product.labelSize}
            onChange={(e) =>
              onChange({ ...product, labelSize: e.target.value })
            }
          />
        </label>
        <label>
          Fabric
          <input
            required
            maxLength={80}
            placeholder="e.g. 100% cotton"
            value={product.fabric}
            onChange={(e) => onChange({ ...product, fabric: e.target.value })}
          />
        </label>
        <label>
          Fabric stretch
          <select
            value={product.stretch}
            onChange={(e) =>
              onChange({
                ...product,
                stretch: e.target.value as Product["stretch"],
              })
            }
          >
            {stretches.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="measurement-heading">
        <h3>GARMENT MEASUREMENTS</h3>
        <span>cm</span>
      </div>
      <div className="form-grid">
        {categoryMeasurements(reference.category).map((k) => (
          <label key={k}>
            {labels[k]} (cm)
            <input
              type="number"
              min="0.1"
              max="400"
              step="0.1"
              placeholder="—"
              value={product.measurements[k] ?? ""}
              onChange={(e) =>
                onChange({
                  ...product,
                  measurements: {
                    ...product.measurements,
                    [k]: e.target.value ? Number(e.target.value) : undefined,
                  },
                })
              }
            />
            <small className="muted">
              Reference:{" "}
              {reference.measurements[k] === undefined
                ? "not entered"
                : reference.measurements[k] + " cm"}
            </small>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
function AlternativeFeedback({
  comparison,
  onSaved,
}: {
  comparison: FitComparison;
  onSaved: (c: FitComparison) => void;
}) {
  const [feedback, setFeedback] = useState<ComparisonFeedback>(
      comparison.feedback,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setFeedback(comparison.feedback);
  }, [comparison.feedback.outcome, comparison.feedback.notes]);
  return (
    <details className="alternative-feedback-item">
      <summary>
        <span>
          <strong>{comparison.input.product.name}</strong>
          <small>
            {comparison.input.product.brand} · {comparison.feedback.outcome}
          </small>
        </span>
        <span className="feedback-action">Add / edit feedback</span>
      </summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            onSaved(
              await api<FitComparison>(
                "/comparisons/" + comparison.id + "/feedback",
                { method: "PATCH", body: JSON.stringify(feedback) },
              ),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          How did this alternative fit?
          <select
            value={feedback.outcome}
            onChange={(e) =>
              setFeedback({
                ...feedback,
                outcome: e.target.value as ComparisonFeedback["outcome"],
              })
            }
          >
            {feedbackOptions.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label>
          Fit notes (optional)
          <textarea
            rows={3}
            maxLength={1000}
            value={feedback.notes}
            placeholder="What worked? What would you change?"
            onChange={(e) =>
              setFeedback({ ...feedback, notes: e.target.value })
            }
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save feedback"}
          <Check size={16} />
        </button>
      </form>
    </details>
  );
}
