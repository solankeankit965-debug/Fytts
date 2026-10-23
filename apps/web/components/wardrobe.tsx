"use client";
import { api } from "../lib/api";
import FitCheck from "./fit-check";
import SimilarFit from "./similar-fit";
import BrandInput from "./brand-input";
import { useEffect, useState, useRef, type FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  Shirt,
  SlidersHorizontal,
  LogOut,
  X,
  Check,
  ArrowLeft,
  Upload,
  Heart,
  Trash2,
  Pencil,
  LoaderCircle,
  Ruler,
  SearchCheck,
} from "lucide-react";
import {
  categories,
  silhouettes,
  stretches,
  comforts,
  type Garment,
  type GarmentInput,
  type Session,
  type Profile,
} from "@fytts/contracts";
const empty: GarmentInput = {
  name: "",
  brand: "",
  category: "Shirt",
  labelSize: "",
  fabric: "",
  silhouette: "Relaxed",
  stretch: "None",
  comfort: "Just right",
  color: "Blue",
  perfectFit: false,
  notes: "",
  measurements: {},
};
function useDialog(active: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const nodes = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ) || [],
      );
    (
      dialog?.querySelector<HTMLElement>('input:not([type="file"]),select') ||
      nodes()[0]
    )?.focus();
    function key(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab") {
        const all = nodes();
        const first = all[0],
          last = all.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [active]);
}
function GarmentArt({
  color = "Blue",
  category = "Shirt",
}: {
  color?: string;
  category?: string;
}) {
  const colors: Record<string, string> = {
    Blue: "#7596c6",
    Pink: "#e5a7c0",
    Cream: "#ded4bc",
    Black: "#363a3a",
    Green: "#7d9d7e",
    Orange: "#e59c6c",
  };
  const pants = ["Trousers", "Jeans"].includes(category);
  return (
    <svg viewBox="0 0 240 240" aria-label={category} role="img">
      <ellipse cx="120" cy="216" rx="68" ry="9" fill="#171714" opacity=".08" />
      {pants ? (
        <>
          <path
            d="M78 33h85l14 171-43 2-16-105-15 105-43-2Z"
            fill={colors[color]}
            stroke="#171714"
            strokeWidth="2"
          />
          <path
            d="M78 52h86M120 34v54m-39-32 18 20m59-20-19 20"
            fill="none"
            stroke="#171714"
            opacity=".5"
          />
        </>
      ) : (
        <>
          <path
            d="m82 39-42 21-23 52 37 18 18-30-4 108h105l-4-108 18 30 37-18-24-52-42-21-18 13h-40Z"
            fill={colors[color]}
            stroke="#171714"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="m82 39 20 36 18-23 18 23 20-36M120 75v133m-39-96h26v27H81"
            fill="none"
            stroke="#171714"
            opacity=".45"
          />
          <circle cx="128" cy="99" r="1.5" />
          <circle cx="128" cy="125" r="1.5" />
          <circle cx="128" cy="151" r="1.5" />
        </>
      )}
    </svg>
  );
}
export default function Wardrobe() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [garments, setGarments] = useState<Garment[]>([]),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("All pieces"),
    [query, setQuery] = useState(""),
    [editor, setEditor] = useState<Garment | null | undefined>(undefined),
    [profile, setProfile] = useState(false),
    [notice, setNotice] = useState(""),
    [deleteId, setDeleteId] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState<"wardrobe" | "check" | "similar">("wardrobe");
  useDialog(!!deleteId, () => {
    if (!busy) setDeleteId(null);
  });
  async function load() {
    const s = await api<Session>("/session");
    const g = await api<Garment[]>("/garments");
    setSession(s);
    setGarments(g);
  }
  useEffect(() => {
    load()
      .catch((e) => {
        if (!/sign in/i.test(e.message)) setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setSession(null);
      setGarments([]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove() {
    if (!deleteId) return;
    setBusy(true);
    try {
      await api("/garments/" + deleteId, { method: "DELETE" });
      setGarments((g) => g.filter((x) => x.id !== deleteId));
      setDeleteId(null);
      setNotice("Piece removed from your wardrobe.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = garments.filter(
    (g) =>
      (filter !== "Perfect fits" || g.perfectFit) &&
      (filter !== "Tops" ||
        !["Trousers", "Jeans", "Dress"].includes(g.category)) &&
      (filter !== "Bottoms" || ["Trousers", "Jeans"].includes(g.category)) &&
      `${g.name} ${g.brand} ${g.fabric}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  if (loading)
    return (
      <div className="loading">
        <span className="logo">
          FYTTS<span>®</span>
        </span>
        <LoaderCircle className="spin" />
        <p>Opening your wardrobe…</p>
      </div>
    );
  if (!session) return <Auth onDone={load} initialError={error} />;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="logo" href="/">
          FYTTS<span>®</span>
        </a>
        <span className="tiny tagline">YOUR FIT. YOUR RULES.</span>
        <nav>
          <button
            className={"nav-item " + (page === "wardrobe" ? "active" : "")}
            onClick={() => {
              setPage("wardrobe");
              setFilter("All pieces");
              setQuery("");
            }}
          >
            <Shirt size={19} /> My wardrobe{" "}
            <span>{garments.length.toString().padStart(2, "0")}</span>
          </button>
          <button
            className={"nav-item " + (page === "check" ? "active" : "")}
            onClick={() => setPage("check")}
          >
            <Ruler size={19} />
            Check a new fit
            <ArrowUpRight size={17} />
          </button>
          <button
            className={"nav-item " + (page === "similar" ? "active" : "")}
            onClick={() => setPage("similar")}
          >
            <SearchCheck size={19} />
            Find a similar fit
            <ArrowUpRight size={17} />
          </button>
          <button className="nav-item" onClick={() => setProfile(true)}>
            <SlidersHorizontal size={18} /> My fit profile{" "}
            <ArrowUpRight size={17} />
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="star">✳</span>
          <h3>
            LESS GUESSWORK.
            <br />
            MORE GOOD FITS.
          </h3>
          <p>Your favourite pieces are the best place to start.</p>
        </div>
        <button className="account" onClick={logout}>
          <span className="avatar">
            {(session.profile.displayName ||
              session.user.email)[0]?.toUpperCase()}
          </span>
          <span>
            <strong>{session.profile.displayName || "Your account"}</strong>
            <small>Sign out</small>
          </span>
          <LogOut size={17} />
        </button>
      </aside>
      <main>
        <header className="topbar">
          <span className="tiny">THE PERSONAL WARDROBE / VOL. 01</span>
          <span className="tiny desktop-only">
            BUILT AROUND YOU <span className="green-dot" />
          </span>
        </header>
        <section className="page-content">
          {page === "similar" ? (
            <SimilarFit
              garments={garments}
              mode={session.mode}
              onAddReference={() => setEditor(null)}
              onEditReference={(g) => setEditor(g)}
            />
          ) : page === "check" ? (
            <FitCheck
              garments={garments}
              mode={session.mode}
              onAddReference={() => setEditor(null)}
              onEditReference={(g) => setEditor(g)}
            />
          ) : (
            <>
              <div className="intro">
                <div>
                  <p className="eyebrow">
                    GOOD TO SEE YOU
                    {session.profile.displayName
                      ? ", " + session.profile.displayName.toUpperCase()
                      : ""}
                    .
                  </p>
                  <h1>
                    YOUR WARDROBE.
                    <br />
                    <span>YOUR BENCHMARK.</span>
                  </h1>
                  <p className="subtitle">
                    Keep the pieces that fit. Remember what makes them work.
                  </p>
                </div>
                <button className="primary add" onClick={() => setEditor(null)}>
                  <Plus size={19} /> Add a piece
                </button>
              </div>
              {session.mode === "local" && (
                <p className="dev-note">
                  Local development mode · data stays on this computer.
                </p>
              )}
              {error && (
                <div className="alert" role="alert">
                  {error}
                  <button
                    aria-label="Dismiss error"
                    onClick={() => setError("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {notice && (
                <div className="notice" role="status">
                  <Check size={16} />
                  {notice}
                  <button
                    aria-label="Dismiss notification"
                    onClick={() => setNotice("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <div className="content-grid">
                <section className="collection">
                  <div className="collection-head">
                    <h2>
                      THE COLLECTION{" "}
                      <sup>{garments.length.toString().padStart(2, "0")}</sup>
                    </h2>
                    <label className="search">
                      <Search size={17} />
                      <input
                        aria-label="Search wardrobe"
                        placeholder="Find a piece…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="filters">
                    {["All pieces", "Tops", "Bottoms", "Perfect fits"].map(
                      (f) => (
                        <button
                          key={f}
                          onClick={() => setFilter(f)}
                          className={filter === f ? "selected" : ""}
                        >
                          {f}
                          {f === "Perfect fits" && <Heart size={13} />}
                        </button>
                      ),
                    )}
                  </div>
                  {visible.length ? (
                    <div className="cards">
                      {visible.map((g, i) => (
                        <article className="garment-card" key={g.id}>
                          <button
                            className={
                              "garment-visual color-" + g.color.toLowerCase()
                            }
                            onClick={() => setEditor(g)}
                            aria-label={"View " + g.name}
                          >
                            <span className="piece-number">
                              {(i + 1).toString().padStart(2, "0")} /{" "}
                              {g.category.toUpperCase()}
                            </span>
                            {g.imagePath ? (
                              <img
                                src={
                                  "/api/garments/" +
                                  g.id +
                                  "/image?v=" +
                                  encodeURIComponent(g.updatedAt)
                                }
                                alt={g.name}
                              />
                            ) : (
                              <GarmentArt
                                color={g.color}
                                category={g.category}
                              />
                            )}
                            <span className="size-tag">SIZE {g.labelSize}</span>
                            {g.perfectFit && (
                              <span className="fit-badge">
                                <Check size={12} /> PERFECT FIT
                              </span>
                            )}
                          </button>
                          <div className="card-details">
                            <span className="tiny muted">
                              {g.brand.toUpperCase()} · {g.fabric.toUpperCase()}
                            </span>
                            <h3>{g.name}</h3>
                            <div className="card-bottom">
                              <span>{g.silhouette} fit</span>
                              <div>
                                <button
                                  aria-label={"Edit " + g.name}
                                  onClick={() => setEditor(g)}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  aria-label={"Delete " + g.name}
                                  onClick={() => setDeleteId(g.id)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </article>
                      ))}
                      <button
                        className="add-card"
                        onClick={() => setEditor(null)}
                      >
                        <span>
                          <Plus size={26} />
                        </span>
                        <strong>ONE MORE GOOD FIT?</strong>
                        <small>Make room for your next favourite.</small>
                      </button>
                    </div>
                  ) : (
                    <div className="empty">
                      <span className="empty-icon">
                        <Shirt size={38} />
                      </span>
                      <h2>
                        {garments.length
                          ? "NO PIECES FOUND."
                          : "START WITH A FAVOURITE."}
                      </h2>
                      <p>
                        {garments.length
                          ? "Try another search or filter."
                          : "That shirt you always reach for? Add it here and save the details that make it yours."}
                      </p>
                      <button
                        className="primary"
                        onClick={() =>
                          garments.length
                            ? (setQuery(""), setFilter("All pieces"))
                            : setEditor(null)
                        }
                      >
                        {garments.length
                          ? "Clear filters"
                          : "Add your first piece"}
                        <ArrowUpRight size={18} />
                      </button>
                    </div>
                  )}
                </section>
                <aside className="insights">
                  <div className="fit-note">
                    <div className="tiny">
                      A LITTLE FIT CHECK <ArrowUpRight size={15} />
                    </div>
                    <span className="big-stat">
                      {garments
                        .filter((g) => g.perfectFit)
                        .length.toString()
                        .padStart(2, "0")}
                      <span>✳</span>
                    </span>
                    <h3>
                      PIECES THAT
                      <br />
                      JUST GET YOU.
                    </h3>
                    <p>
                      Mark your perfect fits. They’re your personal reference
                      for what feels right.
                    </p>
                    <button onClick={() => setFilter("Perfect fits")}>
                      See perfect fits <ArrowRight size={17} />
                    </button>
                  </div>
                  <div className="profile-note">
                    <span className="tiny">YOUR FIT PREFERENCE</span>
                    <h3>
                      {session.profile.preferredFit.toUpperCase()}
                      <ArrowUpRight size={24} />
                    </h3>
                    <p>A wardrobe that moves the way you do.</p>
                    <button
                      className="text-button"
                      onClick={() => setProfile(true)}
                    >
                      Edit my profile <Pencil size={13} />
                    </button>
                  </div>
                  <div className="tip">
                    <span className="tiny">FIELD NOTES / 001</span>
                    <h3>
                      THE LABEL ISN’T
                      <br />
                      THE WHOLE STORY.
                    </h3>
                    <p>
                      Add garment measurements to remember the fit beyond a size
                      tag.
                    </p>
                  </div>
                </aside>
              </div>
              <footer>
                <span>FYTTS® — WEAR WHAT WORKS.</span>
                <span>YOUR WARDROBE, SAVED.</span>
              </footer>
            </>
          )}
        </section>
      </main>
      {editor !== undefined && (
        <Editor
          garment={editor}
          onClose={() => {
            setEditor(undefined);
            load().catch((e) => setError(e.message));
          }}
          onSaved={(g) => {
            setGarments((xs) => [g, ...xs.filter((x) => x.id !== g.id)]);
            setNotice("Your piece is saved.");
            setEditor(undefined);
          }}
        />
      )}
      {profile && (
        <ProfileEditor
          profile={session.profile}
          onClose={() => setProfile(false)}
          onSaved={(p) => {
            setSession({ ...session, profile: p });
            setProfile(false);
            setNotice("Fit profile updated.");
          }}
        />
      )}
      {deleteId && (
        <div className="overlay">
          <section
            className="dialog small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <button
              className="close"
              aria-label="Close"
              onClick={() => setDeleteId(null)}
            >
              <X />
            </button>
            <p className="eyebrow">MAKE SOME ROOM</p>
            <h2 id="delete-title">REMOVE THIS PIECE?</h2>
            <p>
              Its wardrobe details and photo will be removed. Saved comparison
              snapshots will stay in your checks.
            </p>
            <div className="actions">
              <button className="secondary" onClick={() => setDeleteId(null)}>
                Keep it
              </button>
              <button className="danger" disabled={busy} onClick={remove}>
                {busy ? "Removing…" : "Remove piece"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Auth({
  onDone,
  initialError,
}: {
  onDone: () => Promise<void>;
  initialError: string;
}) {
  const [signup, setSignup] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await api<{ needsConfirmation: boolean }>(
        "/auth/" + (signup ? "signup" : "login"),
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
      if (r.needsConfirmation) setConfirmation(true);
      else await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-art">
        <a className="logo" href="/">
          FYTTS<span>®</span>
        </a>
        <span className="tiny">PERSONAL STYLE. NO GUESSWORK.</span>
        <h1>
          GOOD FITS.
          <br />
          ON <em>REPEAT.</em>
        </h1>
        <div className="art-collage">
          <div className="art-card">
            <GarmentArt color="Blue" />
            <span>THE ONE YOU ALWAYS REACH FOR.</span>
          </div>
          <span className="art-stamp">
            YOUR FIT.
            <br />
            YOUR RULES.
            <ArrowUpRight size={28} />
          </span>
          <span className="collage-star">✳</span>
        </div>
        <p>Start with what fits. Build from there.</p>
      </section>
      <section className="auth-form">
        <span className="tiny">YOUR PERSONAL WARDROBE / 01</span>
        <h2>
          {confirmation
            ? "CHECK YOUR INBOX."
            : signup
              ? "MAKE IT YOURS."
              : "WELCOME BACK."}
        </h2>
        <p>
          {confirmation
            ? "Confirm your email address, then return here to sign in."
            : signup
              ? "Save the pieces you love and the details that make them fit."
              : "Your favourite fits are right where you left them."}
        </p>
        {confirmation ? (
          <button
            className="primary"
            onClick={() => {
              setConfirmation(false);
              setSignup(false);
            }}
          >
            Back to sign in
            <ArrowRight size={18} />
          </button>
        ) : (
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email address"
              />
              {signup && (
                <small className="muted">
                  Use your own email address so you can confirm your account.
                </small>
              )}
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                required
                minLength={10}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 10 characters"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : signup ? (
                "Create account"
              ) : (
                "Sign in"
              )}
              <ArrowUpRight size={18} />
            </button>
            <p className="switch">
              {signup ? "Already have an account?" : "New to FYTTS?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setSignup(!signup);
                  setError("");
                }}
              >
                {signup ? "Sign in" : "Create an account"}
              </button>
            </p>
          </form>
        )}
        <div className="auth-foot">
          <Check size={16} /> Your wardrobe and photos stay private.
        </div>
      </section>
    </div>
  );
}
function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (s: string) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
function Editor({
  garment,
  onClose,
  onSaved,
}: {
  garment: Garment | null;
  onClose: () => void;
  onSaved: (g: Garment) => void;
}) {
  const [d, setD] = useState<GarmentInput>(
      garment
        ? (Object.fromEntries(
            Object.keys(empty).map((k) => [
              k,
              garment[k as keyof GarmentInput],
            ]),
          ) as GarmentInput)
        : { ...empty, measurements: {} },
    ),
    [step, setStep] = useState(1),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [savedId, setSavedId] = useState(garment?.id);
  useDialog(true, () => {
    if (!busy) onClose();
  });
  function field<K extends keyof GarmentInput>(k: K, v: GarmentInput[K]) {
    setD((x) => ({ ...x, [k]: v }));
  }
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    setError("");
    try {
      let g = await api<Garment>("/garments" + (savedId ? "/" + savedId : ""), {
        method: savedId ? "PATCH" : "POST",
        body: JSON.stringify(d),
      });
      setSavedId(g.id);
      if (file) {
        const form = new FormData();
        form.append("image", file);
        try {
          g = await api<Garment>("/garments/" + g.id + "/image", {
            method: "POST",
            body: form,
          });
        } catch (e) {
          throw new Error(
            "Details saved. Photo upload failed: " +
              (e as Error).message +
              " Retry saving to upload it.",
          );
        }
      }
      onSaved(g);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="overlay">
      <section
        className="dialog editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
      >
        <button
          className="close"
          aria-label="Close editor"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
        <p className="eyebrow">
          {garment ? "A FAMILIAR FAVOURITE" : "MAKE ROOM FOR A GOOD FIT"}
        </p>
        <h2 id="editor-title">
          {garment ? "EDIT YOUR PIECE." : "ADD A PIECE."}
        </h2>
        <div className="steps">
          {["The basics", "The fit", "The details"].map((s, i) => (
            <span className={step === i + 1 ? "current" : ""} key={s}>
              <b>{i + 1}</b>
              {s}
            </span>
          ))}
        </div>
        <form onSubmit={submit}>
          {step === 1 && (
            <div className="form-grid">
              <label className="wide">
                Give it a name
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="My everyday Oxford"
                  value={d.name}
                  onChange={(e) => field("name", e.target.value)}
                />
              </label>
              <BrandInput
                value={d.brand}
                onChange={(value) => field("brand", value)}
              />
              <Select
                label="Category"
                value={d.category}
                options={categories}
                onChange={(v) =>
                  field("category", v as GarmentInput["category"])
                }
              />
              <label>
                Size on label
                <input
                  required
                  maxLength={30}
                  placeholder="e.g. M / 32"
                  value={d.labelSize}
                  onChange={(e) => field("labelSize", e.target.value)}
                />
              </label>
              <label>
                Fabric
                <input
                  required
                  maxLength={80}
                  placeholder="e.g. 100% cotton"
                  value={d.fabric}
                  onChange={(e) => field("fabric", e.target.value)}
                />
              </label>
            </div>
          )}
          {step === 2 && (
            <div className="form-grid">
              <Select
                label="Silhouette"
                value={d.silhouette}
                options={silhouettes}
                onChange={(v) =>
                  field("silhouette", v as GarmentInput["silhouette"])
                }
              />
              <Select
                label="Fabric stretch"
                value={d.stretch}
                options={stretches}
                onChange={(v) => field("stretch", v as GarmentInput["stretch"])}
              />
              <Select
                label="How does it feel?"
                value={d.comfort}
                options={comforts}
                onChange={(v) => field("comfort", v as GarmentInput["comfort"])}
              />
              <Select
                label="Colour"
                value={d.color}
                options={["Blue", "Pink", "Cream", "Black", "Green", "Orange"]}
                onChange={(v) => field("color", v as GarmentInput["color"])}
              />
              <label className="checkbox wide">
                <input
                  type="checkbox"
                  checked={d.perfectFit}
                  onChange={(e) => field("perfectFit", e.target.checked)}
                />
                <span>
                  <strong>This is a perfect fit.</strong>
                  <small>Keep it as a reference for what works.</small>
                </span>
                <Heart size={20} />
              </label>
              <label className="wide">
                Fit notes <span className="muted">(optional)</span>
                <textarea
                  maxLength={1000}
                  rows={3}
                  placeholder="What do you love about the fit?"
                  value={d.notes}
                  onChange={(e) => field("notes", e.target.value)}
                />
              </label>
            </div>
          )}
          {step === 3 && (
            <>
              <p className="helper">
                Optional details. Measure the garment in centimetres, using the
                same method each time.
              </p>
              <div className="form-grid">
                {(["chest", "waist", "hip", "length"] as const).map((k) => (
                  <label key={k} className="capitalize">
                    {k} (cm)
                    <input
                      type="number"
                      min="0.1"
                      max="400"
                      step="0.1"
                      placeholder="—"
                      value={d.measurements[k] ?? ""}
                      onChange={(e) =>
                        field("measurements", {
                          ...d.measurements,
                          [k]: e.target.value
                            ? Number(e.target.value)
                            : undefined,
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="upload">
                {preview ? (
                  <img src={preview} alt="Selected garment" />
                ) : (
                  <Upload size={24} />
                )}
                <span>
                  <strong>{file ? file.name : "Add a photo (optional)"}</strong>
                  <small>JPEG, PNG or WebP · up to 5 MB</small>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (
                      f &&
                      (!["image/jpeg", "image/png", "image/webp"].includes(
                        f.type,
                      ) ||
                        f.size > 5242880)
                    ) {
                      setError("Choose a JPEG, PNG or WebP image under 5 MB.");
                      e.target.value = "";
                      return;
                    }
                    setError("");
                    setFile(f || null);
                  }}
                />
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="actions">
            {step > 1 ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft size={16} /> Back
              </button>
            ) : (
              <span />
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : step === 3 ? "Save piece" : "Continue"}
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <ArrowRight size={17} />
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function ProfileEditor({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (p: Profile) => void;
}) {
  const [name, setName] = useState(profile.displayName),
    [fit, setFit] = useState(profile.preferredFit),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useDialog(true, () => {
    if (!busy) onClose();
  });
  return (
    <div className="overlay">
      <section
        className="dialog small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
      >
        <button className="close" aria-label="Close profile" onClick={onClose}>
          <X />
        </button>
        <p className="eyebrow">ALL ABOUT YOU</p>
        <h2 id="profile-title">YOUR FIT PROFILE.</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              onSaved(
                await api("/profile", {
                  method: "PATCH",
                  body: JSON.stringify({
                    displayName: name,
                    preferredFit: fit,
                  }),
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            What should we call you?
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Select
            label="Your preferred fit"
            value={fit}
            options={silhouettes}
            onChange={(s) => setFit(s as Profile["preferredFit"])}
          />
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
            <Check size={17} />
          </button>
        </form>
      </section>
    </div>
  );
}
