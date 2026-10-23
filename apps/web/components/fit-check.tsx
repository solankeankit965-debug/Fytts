"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock3,
  Heart,
  LoaderCircle,
  Plus,
  Ruler,
  Shirt,
} from "lucide-react";
import {
  categories,
  stretches,
  categoryMeasurements,
  measurementKeys,
  feedbackOptions,
  type Garment,
  type ComparisonInput,
  type FitComparison,
  type MeasurementKey,
  type ComparisonFeedback,
} from "@fytts/contracts";
import { api } from "../lib/api";
import BrandInput from "./brand-input";
const blank: ComparisonInput["product"] = {
  name: "",
  brand: "",
  category: "Shirt",
  labelSize: "",
  fabric: "",
  stretch: "None",
  measurements: {},
};
const labels: Record<MeasurementKey, string> = {
  chest: "Chest",
  waist: "Waist",
  hip: "Hip",
  length: "Length",
};
function difference(delta: number | null, key: MeasurementKey) {
  if (delta === null) return "Not compared";
  if (delta === 0) return "Same measurement";
  return `${Math.abs(delta).toFixed(1)} cm ${key === "length" ? (delta > 0 ? "longer" : "shorter") : delta > 0 ? "more" : "less"}`;
}
export default function FitCheck({
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
  const [view, setView] = useState<"new" | "history">("new"),
    [step, setStep] = useState(1),
    [product, setProduct] = useState<ComparisonInput["product"]>({
      ...blank,
      measurements: {},
    }),
    [method, setMethod] =
      useState<ComparisonInput["measurementMethod"]>("Circumference"),
    [referenceId, setReferenceId] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [active, setActive] = useState<FitComparison | null>(null),
    [history, setHistory] = useState<FitComparison[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null),
    firstRender = useRef(true);
  async function loadHistory() {
    setLoading(true);
    try {
      setHistory(
        (await api<FitComparison[]>("/comparisons")).filter((c) => !c.set),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadHistory();
  }, []);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step, view]);
  const eligible = garments.filter((g) => g.category === product.category);
  const reference = eligible.find((g) => g.id === referenceId);
  const shared = (g: Garment) =>
    categoryMeasurements(product.category).filter(
      (k) =>
        g.measurements[k] !== undefined &&
        product.measurements[k] !== undefined,
    );
  function reset() {
    setActive(null);
    setStep(1);
    setProduct({ ...blank, measurements: {} });
    setReferenceId("");
    setConfirmed(false);
    setError("");
    setMessage("");
    setView("new");
  }
  async function compare() {
    if (!reference || !shared(reference).length || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      const c = await api<FitComparison>("/comparisons", {
        method: "POST",
        body: JSON.stringify({
          referenceId,
          product,
          measurementMethod: method,
          sameMethodConfirmed: true,
        }),
      });
      setActive(c);
      setHistory((h) => [c, ...h]);
      setStep(3);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function next(e: FormEvent) {
    e.preventDefault();
    if (
      !categoryMeasurements(product.category).some(
        (k) => product.measurements[k] !== undefined,
      )
    ) {
      setError("Add at least one garment measurement to continue.");
      return;
    }
    setError("");
    setStep(2);
  }
  function open(c: FitComparison) {
    setActive(c);
    setView("new");
    setStep(3);
    setError("");
    setMessage("");
  }
  return (
    <div className="fit-check">
      <div className="intro">
        <div>
          <p className="eyebrow">A FAMILIAR FIT. A NEW POSSIBILITY.</p>
          <h1>
            THE NEXT
            <br />
            <span>GOOD FIT.</span>
          </h1>
          <p className="subtitle">
            Compare a new piece with one you already know. Go beyond the size
            tag.
          </p>
        </div>
        <div className="comparison-mark">
          <Ruler size={32} />
          <span>
            MEASURE.
            <br />
            COMPARE.
            <br />
            DECIDE.
          </span>
        </div>
      </div>
      {mode === "local" && (
        <p className="dev-note">
          Local testing · comparisons and feedback stay on this computer.
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
          <Ruler size={16} /> New fit check
        </button>
        <button
          className={view === "history" ? "selected" : ""}
          onClick={() => {
            setView("history");
            setMessage("");
            loadHistory();
          }}
        >
          <Clock3 size={16} /> Saved checks{" "}
          <span>{history.length.toString().padStart(2, "0")}</span>
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
          {view === "history" && (
            <button className="text-button" onClick={loadHistory}>
              Try again
            </button>
          )}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          <Check size={16} />
          {message}
        </p>
      )}
      {view === "history" ? (
        <section>
          <h2 ref={heading} tabIndex={-1}>
            YOUR FIT NOTES, KEPT.
          </h2>
          <p className="helper">
            Each check keeps a snapshot of your reference, even if you edit it
            later.
          </p>
          {loading ? (
            <p className="check-loading">
              <LoaderCircle className="spin" size={20} />
              Opening saved checks…
            </p>
          ) : history.length ? (
            <div className="history-list">
              {history.map((c) => (
                <button
                  className="history-card"
                  key={c.id}
                  onClick={() => open(c)}
                >
                  <span className="history-icon">
                    <Shirt size={26} />
                  </span>
                  <span>
                    <small>
                      {c.input.product.brand} · SIZE {c.input.product.labelSize}
                    </small>
                    <strong>{c.input.product.name}</strong>
                    <small>
                      Compared with {c.reference.name} ·{" "}
                      {new Date(c.createdAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </small>
                  </span>
                  <span className="history-outcome">{c.feedback.outcome}</span>
                  <ArrowUpRight size={20} />
                </button>
              ))}
            </div>
          ) : (
            !error && (
              <div className="empty">
                <Ruler size={36} />
                <h2>YOUR NEXT FIT STARTS HERE.</h2>
                <p>
                  Save your first measurement comparison. Come back after trying
                  it to record how it feels.
                </p>
                <button className="primary" onClick={reset}>
                  Start a fit check
                  <ArrowRight size={17} />
                </button>
              </div>
            )
          )}
        </section>
      ) : (
        <>
          <div className="check-progress">
            {["New piece", "Your reference", "Side by side"].map((s, i) => (
              <span
                className={
                  step === i + 1 ? "current" : step > i + 1 ? "complete" : ""
                }
                key={s}
              >
                <b>{step > i + 1 ? <Check size={13} /> : i + 1}</b>
                {s}
              </span>
            ))}
          </div>
          {step === 1 && (
            <div className="check-layout">
              <section className="check-panel">
                <p className="eyebrow">01 / THE NEW PIECE</p>
                <h2 ref={heading} tabIndex={-1}>
                  WHAT CAUGHT YOUR EYE?
                </h2>
                <p className="helper">
                  Use the product’s garment measurements or measure the piece
                  yourself. Enter centimetres, not body measurements.
                </p>
                <form onSubmit={next}>
                  <div className="form-grid">
                    <label className="wide">
                      Product name
                      <input
                        required
                        minLength={2}
                        maxLength={100}
                        value={product.name}
                        placeholder="The Oxford you’re eyeing"
                        onChange={(e) =>
                          setProduct({ ...product, name: e.target.value })
                        }
                      />
                    </label>
                    <BrandInput
                      value={product.brand}
                      onChange={(brand) => setProduct({ ...product, brand })}
                    />
                    <label>
                      Category
                      <select
                        value={product.category}
                        onChange={(e) => {
                          setProduct({
                            ...product,
                            category: e.target.value as Garment["category"],
                            measurements: {},
                          });
                          setReferenceId("");
                          setConfirmed(false);
                        }}
                      >
                        {categories.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Size on label
                      <input
                        required
                        maxLength={30}
                        value={product.labelSize}
                        placeholder="e.g. M / 32"
                        onChange={(e) =>
                          setProduct({ ...product, labelSize: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Fabric
                      <input
                        required
                        maxLength={80}
                        value={product.fabric}
                        placeholder="e.g. 100% cotton"
                        onChange={(e) =>
                          setProduct({ ...product, fabric: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Fabric stretch
                      <select
                        value={product.stretch}
                        onChange={(e) =>
                          setProduct({
                            ...product,
                            stretch: e.target.value as Garment["stretch"],
                          })
                        }
                      >
                        {stretches.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
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
                  <div className="measurement-heading">
                    <h3>THE NUMBERS / CM</h3>
                    <span>At least one required</span>
                  </div>
                  <p className="helper">
                    {method === "Circumference"
                      ? "Chest, waist and hip are measured all the way around the garment."
                      : "Chest, waist and hip are measured straight across the garment laid flat."}{" "}
                    Length runs from top to hem. Use the same landmarks on both
                    pieces.
                  </p>
                  <div className="form-grid">
                    {categoryMeasurements(product.category).map((k) => (
                      <label key={k}>
                        {labels[k]} (cm)
                        <input
                          type="number"
                          min="0.1"
                          max="400"
                          step="0.1"
                          value={product.measurements[k] ?? ""}
                          placeholder="—"
                          onChange={(e) => {
                            setProduct({
                              ...product,
                              measurements: {
                                ...product.measurements,
                                [k]: e.target.value
                                  ? Number(e.target.value)
                                  : undefined,
                              },
                            });
                            setConfirmed(false);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="actions">
                    <span className="tiny muted">01 OF 03</span>
                    <button className="primary">
                      Choose a reference
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </form>
              </section>
              <aside className="check-aside">
                <span className="star">✳</span>
                <h3>
                  SIZE IS A LABEL.
                  <br />
                  FIT IS PERSONAL.
                </h3>
                <p>
                  The same size can measure differently across brands. Start
                  with the numbers that matter to you.
                </p>
                <div className="check-aside-note">
                  <span className="tiny">ONE METHOD, BOTH PIECES</span>
                  <p>
                    Don’t compare a flat chest width with a chest circumference.
                    If the retailer’s method is unclear, check its size guide
                    first.
                  </p>
                </div>
              </aside>
            </div>
          )}
          {step === 2 && (
            <section className="check-panel reference-panel">
              <p className="eyebrow">02 / YOUR BENCHMARK</p>
              <h2 ref={heading} tabIndex={-1}>
                START WITH WHAT WORKS.
              </h2>
              <p className="helper">
                Choose a saved {product.category.toLowerCase()} with
                measurements you trust. Perfect-fit pieces are marked, but you
                can use any reference in this category.
              </p>
              <div className="new-piece-strip">
                <span className="tiny">NEW PIECE</span>
                <strong>{product.name}</strong>
                <span>
                  {product.brand} · {product.labelSize} · {method}
                </span>
              </div>
              {eligible.length ? (
                <div className="reference-list">
                  {eligible.map((g) => {
                    const count = shared(g).length;
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
                            name="reference"
                            disabled={!count}
                            checked={referenceId === g.id}
                            onChange={() => {
                              setReferenceId(g.id);
                              setConfirmed(false);
                            }}
                          />
                          <span>
                            <strong>
                              {g.name}
                              {g.perfectFit && <Heart size={14} />}
                            </strong>
                            <small>
                              {g.brand} · SIZE {g.labelSize} · {g.comfort}
                            </small>
                            <small>
                              {count
                                ? `${count} shared measurement${count === 1 ? "" : "s"}`
                                : "No matching measurements yet"}
                            </small>
                          </span>
                        </label>
                        <button
                          className="text-button"
                          onClick={() => onEditReference(g)}
                        >
                          {count ? "Edit details" : "Add measurements"}
                          <ArrowUpRight size={14} />
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty">
                  <Shirt size={36} />
                  <h2>ADD YOUR BENCHMARK.</h2>
                  <p>
                    You don’t have a saved {product.category.toLowerCase()} yet.
                    Add one with measurements, then return here.
                  </p>
                  <button className="primary" onClick={onAddReference}>
                    <Plus size={17} />
                    Add a wardrobe piece
                  </button>
                </div>
              )}
              {reference && (
                <>
                  <div className="reference-measurements">
                    {categoryMeasurements(reference.category)
                      .filter((k) => reference.measurements[k] !== undefined)
                      .map((k) => (
                        <span key={k}>
                          {labels[k]}{" "}
                          <strong>{reference.measurements[k]} cm</strong>
                        </span>
                      ))}
                  </div>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <span>
                      <strong>
                        Both pieces use the same measurement method.
                      </strong>
                      <small>
                        I checked that {method.toLowerCase()} measurements and
                        length landmarks match.
                      </small>
                    </span>
                  </label>
                </>
              )}
              <div className="actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setStep(1);
                    setError("");
                  }}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !reference ||
                    !confirmed ||
                    !shared(reference).length
                  }
                  onClick={compare}
                >
                  {busy ? "Saving check…" : "Compare & save"}
                  {busy ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                </button>
              </div>
            </section>
          )}
          {step === 3 && active && (
            <Results
              key={active.id}
              comparison={active}
              headingRef={heading}
              onNew={reset}
              onSaved={(c) => {
                setActive(c);
                setHistory((h) => h.map((x) => (x.id === c.id ? c : x)));
                setMessage("Your fit feedback is saved.");
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
function Results({
  comparison,
  headingRef,
  onNew,
  onSaved,
}: {
  comparison: FitComparison;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onNew: () => void;
  onSaved: (c: FitComparison) => void;
}) {
  const [feedback, setFeedback] = useState<ComparisonFeedback>(
      comparison.feedback,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { result, input, reference } = comparison;
  return (
    <div className="comparison-results">
      <section className="result-heading">
        <p className="eyebrow">
          <CheckCircle2 size={14} /> CHECK SAVED /{" "}
          {new Date(comparison.createdAt).toLocaleDateString()}
        </p>
        <h2 ref={headingRef} tabIndex={-1}>
          THE DIFFERENCE
          <br />
          IS IN THE DETAILS.
        </h2>
        <p>
          {result.comparedCount} shared measurement
          {result.comparedCount === 1 ? "" : "s"} compared ·{" "}
          {input.measurementMethod.toLowerCase()} · all values in cm
        </p>
      </section>
      <div className="comparison-pieces">
        <div>
          <span className="tiny">YOUR REFERENCE</span>
          <h3>{reference.name}</h3>
          <p>
            {reference.brand} · SIZE {reference.labelSize}
          </p>
        </div>
        <span className="versus">VS</span>
        <div>
          <span className="tiny">THE NEW PIECE</span>
          <h3>{input.product.name}</h3>
          <p>
            {input.product.brand} · SIZE {input.product.labelSize}
          </p>
        </div>
      </div>
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <caption className="sr-only">
            Garment measurement differences in centimetres
          </caption>
          <thead>
            <tr>
              <th scope="col">Measurement</th>
              <th scope="col">Reference</th>
              <th scope="col">New piece</th>
              <th scope="col">Difference</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{labels[r.key]}</th>
                <td>
                  {r.reference === null
                    ? "Not entered"
                    : r.reference.toFixed(1) + " cm"}
                </td>
                <td>
                  {r.product === null
                    ? "Not entered"
                    : r.product.toFixed(1) + " cm"}
                </td>
                <td>
                  <span
                    className={
                      r.delta === null
                        ? "delta missing"
                        : r.delta === 0
                          ? "delta equal"
                          : r.delta > 0
                            ? "delta more"
                            : "delta less"
                    }
                  >
                    {difference(r.delta, r.key)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="result-notes">
        <div>
          <span className="tiny">FABRIC & STRETCH</span>
          <p>
            <strong>Reference:</strong> {reference.fabric} · {reference.stretch}{" "}
            stretch
          </p>
          <p>
            <strong>New piece:</strong> {input.product.fabric} ·{" "}
            {input.product.stretch} stretch
          </p>
          {(result.fabricChanged || result.stretchChanged) && (
            <p>
              Fabric or stretch differs. Equal measurements may still feel
              different when worn.
            </p>
          )}
        </div>
        <div>
          <span className="tiny">WHAT THIS TELLS YOU</span>
          <p>
            “More” and “less” describe the new garment’s measurements relative
            to your reference. They don’t guarantee comfort or fit.
          </p>
          <p>
            Missing measurements aren’t estimated. Construction, cut and
            personal preference also matter.
          </p>
        </div>
      </div>
      <section className="feedback-panel">
        <div>
          <p className="eyebrow">TRIED IT ON?</p>
          <h3>
            LET REAL LIFE
            <br />
            HAVE THE LAST WORD.
          </h3>
          <p>Keep your actual experience beside this check.</p>
        </div>
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
            How did the new piece fit?
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
            What did you notice? (optional)
            <textarea
              rows={3}
              maxLength={1000}
              placeholder="e.g. Good through the chest, sleeves a little long."
              value={feedback.notes}
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
      </section>
      <div className="actions">
        <span className="tiny muted">SAVED TO YOUR CHECKS</span>
        <button className="primary" onClick={onNew}>
          Check another piece
          <ArrowUpRight size={17} />
        </button>
      </div>
    </div>
  );
}
