import { useEffect, useMemo, useState } from "react";

const TIERS = ["S", "A", "B", "C", "D", "?"];
const TIER_LABEL = {
  S: "God roll",
  A: "Keeper",
  B: "Solid",
  C: "Backup",
  D: "Shard it",
  "?": "Unrated",
};
const TIER_ORDER_WORST_FIRST = { D: 0, C: 1, B: 2, A: 3, S: 4, "?": 5 };

export default function App() {
  const [db, setDb] = useState(null); // weapon hash -> {name, icon, type, tier}
  const [vault, setVault] = useState(null); // graded items from /api/vault
  const [status, setStatus] = useState("loading"); // loading | signedout | loadingvault | ready | error
  const [errorMsg, setErrorMsg] = useState("");
  const [filter, setFilter] = useState(null); // tier filter or null
  const [worstFirst, setWorstFirst] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      setErrorMsg(
        {
          denied: "Sign-in was cancelled. No problem — try again whenever.",
          state: "Sign-in session expired. Try again.",
          token: "Bungie sign-in failed. Try again in a moment.",
        }[params.get("error")] || "Something went wrong signing in."
      );
      window.history.replaceState({}, "", "/");
    }

    fetch("/db.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("db.json missing"))))
      .then(setDb)
      .catch(() => setErrorMsg("Weapon database missing — run scripts/build-db.mjs before deploying."));

    fetch("/api/vault")
      .then(async (r) => {
        if (r.status === 401) return setStatus("signedout");
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "vault fetch failed");
        setVault(data.items);
        setStatus("ready");
      })
      .catch((e) => {
        setStatus("error");
        setErrorMsg(String(e.message || e));
      });
  }, []);

  const weapons = useMemo(() => {
    if (!vault || !db) return [];
    return vault
      .filter((it) => db[it.itemHash]) // weapons only — db.json contains only weapons
      .map((it) => ({ ...it, ...db[it.itemHash] }));
  }, [vault, db]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(TIERS.map((t) => [t, 0]));
    for (const w of weapons) c[w.tier]++;
    return c;
  }, [weapons]);

  const shown = useMemo(() => {
    let list = weapons;
    if (filter) list = list.filter((w) => w.tier === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((w) => w.name.toLowerCase().includes(q) || w.type.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const d = TIER_ORDER_WORST_FIRST[a.tier] - TIER_ORDER_WORST_FIRST[b.tier];
      return worstFirst ? d || a.name.localeCompare(b.name) : -d || a.name.localeCompare(b.name);
    });
  }, [weapons, filter, worstFirst, search]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Vault Grader
        </div>
        {status === "ready" && (
          <a className="ghost-btn" href="/api/logout">
            Sign out
          </a>
        )}
      </header>

      {errorMsg && <div className="notice">{errorMsg}</div>}

      {status === "signedout" && <Landing />}
      {status === "loading" && <p className="muted center">Checking your session…</p>}
      {status === "error" && (
        <div className="center">
          <p className="muted">Couldn't load your vault. {errorMsg}</p>
          <a className="cta" href="/api/login">Sign in again</a>
        </div>
      )}

      {status === "ready" && (
        <main>
          <TriageBar counts={counts} total={weapons.length} filter={filter} onFilter={setFilter} />

          <div className="controls">
            <input
              className="search"
              placeholder="Search your weapons"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="ghost-btn" onClick={() => setWorstFirst((v) => !v)}>
              {worstFirst ? "Worst first" : "Best first"}
            </button>
          </div>

          {shown.length === 0 ? (
            <p className="muted center">Nothing matches. Clear the filter or search to see your full vault.</p>
          ) : (
            <ul className="grid">
              {shown.map((w) => (
                <WeaponCard key={w.instanceId} w={w} />
              ))}
            </ul>
          )}
        </main>
      )}
    </div>
  );
}

function Landing() {
  return (
    <section className="landing">
      <p className="eyebrow">Your vault, triaged</p>
      <h1>
        Every weapon you own, graded against{" "}
        <em>180,000+ community god rolls</em>
      </h1>
      <p className="lede">
        Sign in with Bungie and get an instant S-to-D verdict on your entire vault —
        the same wishlist data DIM uses, so you finally know what to keep and what to shard.
      </p>
      <a className="cta" href="/api/login">
        Sign in with Bungie
      </a>
      <p className="fineprint">
        Read-only access to your inventory. Sign in happens on bungie.net — we never see
        your PlayStation, Xbox, or Steam credentials.
      </p>
    </section>
  );
}

function TriageBar({ counts, total, filter, onFilter }) {
  if (!total) return null;
  return (
    <section className="triage" aria-label="Vault grade distribution">
      <div className="triage-head">
        <h2>Vault triage</h2>
        <span className="muted">
          {total.toLocaleString()} weapons
          {filter ? ` · showing ${TIER_LABEL[filter].toLowerCase()}` : ""}
        </span>
      </div>
      <div className="bar" role="group">
        {TIERS.filter((t) => counts[t] > 0).map((t) => (
          <button
            key={t}
            className={`seg tier-${t === "?" ? "U" : t} ${filter === t ? "active" : ""}`}
            style={{ flexGrow: counts[t] }}
            onClick={() => onFilter(filter === t ? null : t)}
            title={`${TIER_LABEL[t]}: ${counts[t]}`}
          >
            <span className="seg-tier">{t}</span>
            <span className="seg-count">{counts[t]}</span>
          </button>
        ))}
      </div>
      <div className="legend">
        {TIERS.map((t) => (
          <span key={t} className="legend-item">
            <i className={`dot tier-${t === "?" ? "U" : t}`} /> {t} · {TIER_LABEL[t]}
          </span>
        ))}
      </div>
    </section>
  );
}

function WeaponCard({ w }) {
  return (
    <li className={`card tierline-${w.tier === "?" ? "U" : w.tier}`}>
      {w.icon && <img className="icon" src={w.icon} alt="" loading="lazy" />}
      <div className="card-body">
        <span className="card-name">{w.name}</span>
        <span className="card-type">{w.type}</span>
      </div>
      <div className={`grade tier-${w.tier === "?" ? "U" : w.tier}`}>
        <span className="grade-letter">{w.tier}</span>
        <span className="grade-sub">
          {w.tier === "?" ? "unrated" : `${Math.round(w.ratio * 100)}%`}
        </span>
      </div>
    </li>
  );
}
