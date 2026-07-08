import { useEffect, useMemo, useState } from "react";

const TIERS = ["S", "A", "B", "C", "D", "E", "?"];
const TIER_LABEL = {
  S: "God roll", A: "Keeper", B: "Solid", C: "Backup", D: "Shard it",
  E: "Exotic", "?": "Unrated",
};
const TIER_ORDER_WORST_FIRST = { D: 0, C: 1, B: 2, A: 3, S: 4, E: 5, "?": 6 };
const MODES = [["all", "All"], ["pve", "PvE"], ["pvp", "PvP"]];
const tierClass = (t) => `tier-${t === "?" ? "U" : t}`;

// Exotics with no community rolls get their own tier instead of "?"
function effectiveGrade(w, mode) {
  const g = w.grades?.[mode] || { tier: "?", ratio: 0, rollsConsidered: 0, bestRoll: [] };
  if (g.tier === "?" && w.tier === "Exotic") return { ...g, tier: "E" };
  return g;
}

export default function App() {
  const [db, setDb] = useState(null);
  const [perkdb, setPerkdb] = useState(null);
  const [vault, setVault] = useState(null);
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [filter, setFilter] = useState(null);
  const [worstFirst, setWorstFirst] = useState(true);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("all");
  const [selected, setSelected] = useState(null);

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
    fetch("/perkdb.json").then((r) => (r.ok ? r.json() : {})).then(setPerkdb).catch(() => setPerkdb({}));

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

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const weapons = useMemo(() => {
    if (!vault || !db) return [];
    return vault.filter((it) => db[it.itemHash]).map((it) => ({ ...it, ...db[it.itemHash] }));
  }, [vault, db]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(TIERS.map((t) => [t, 0]));
    for (const w of weapons) c[effectiveGrade(w, mode).tier]++;
    return c;
  }, [weapons, mode]);

  const shown = useMemo(() => {
    let list = weapons;
    if (filter) list = list.filter((w) => effectiveGrade(w, mode).tier === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((w) => w.name.toLowerCase().includes(q) || w.type.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const d =
        TIER_ORDER_WORST_FIRST[effectiveGrade(a, mode).tier] -
        TIER_ORDER_WORST_FIRST[effectiveGrade(b, mode).tier];
      return worstFirst ? d || a.name.localeCompare(b.name) : -d || a.name.localeCompare(b.name);
    });
  }, [weapons, filter, worstFirst, search, mode]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true" />Vault Grader</div>
        {status === "ready" && <a className="ghost-btn" href="/api/logout">Sign out</a>}
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
          <div className="mode-row">
            <div className="modes" role="group" aria-label="Grading mode">
              {MODES.map(([m, label]) => (
                <button key={m} className={`mode ${mode === m ? "active" : ""}`} onClick={() => setMode(m)}>
                  {label}
                </button>
              ))}
            </div>
            <span className="muted mode-hint">
              {mode === "all" ? "Best grade across every activity" : `Graded for ${mode.toUpperCase()} only`}
            </span>
          </div>

          <TriageBar counts={counts} total={weapons.length} filter={filter} onFilter={setFilter} />

          <div className="controls">
            <input className="search" placeholder="Search your weapons" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="ghost-btn" onClick={() => setWorstFirst((v) => !v)}>
              {worstFirst ? "Worst first" : "Best first"}
            </button>
          </div>

          {shown.length === 0 ? (
            <p className="muted center">Nothing matches. Clear the filter or search to see your full vault.</p>
          ) : (
            <ul className="grid">
              {shown.map((w) => (
                <WeaponCard key={w.instanceId} w={w} mode={mode} onOpen={() => setSelected(w)} />
              ))}
            </ul>
          )}
        </main>
      )}

      {selected && (
        <DetailView w={selected} mode={mode} perkdb={perkdb || {}} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function Landing() {
  return (
    <section className="landing">
      <p className="eyebrow">Your vault, triaged</p>
      <h1>Every weapon you own, graded against <em>180,000+ community god rolls</em></h1>
      <p className="lede">
        Sign in with Bungie and get an instant S-to-D verdict on your entire vault —
        for PvE and PvP separately — using the same wishlist data DIM uses.
      </p>
      <a className="cta" href="/api/login">Sign in with Bungie</a>
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
          {total.toLocaleString()} weapons{filter ? ` · showing ${TIER_LABEL[filter].toLowerCase()}` : ""}
        </span>
      </div>
      <div className="bar" role="group">
        {TIERS.filter((t) => counts[t] > 0).map((t) => (
          <button
            key={t}
            className={`seg ${tierClass(t)} ${filter === t ? "active" : ""}`}
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
            <i className={`dot ${tierClass(t)}`} /> {t} · {TIER_LABEL[t]}
          </span>
        ))}
      </div>
    </section>
  );
}

function WeaponCard({ w, mode, onOpen }) {
  const g = effectiveGrade(w, mode);
  return (
    <li className={`card tierline-${g.tier === "?" ? "U" : g.tier}`}>
      <button className="card-btn" onClick={onOpen}>
        {w.icon && <img className="icon" src={w.icon} alt="" loading="lazy" />}
        <div className="card-body">
          <span className="card-name">{w.name}</span>
          <span className="card-type">{w.type}</span>
        </div>
        <div className={`grade ${tierClass(g.tier)}`}>
          <span className="grade-letter">{g.tier}</span>
          <span className="grade-sub">
            {g.tier === "?" ? "unrated" : g.tier === "E" ? "exotic" : `${Math.round(g.ratio * 100)}%`}
          </span>
        </div>
      </button>
    </li>
  );
}

function PerkChip({ hash, perkdb, matched, owned }) {
  const p = perkdb[hash];
  if (!p) return null;
  return (
    <span
      className={`perk ${matched ? "perk-hit" : ""} ${owned ? "perk-owned" : ""}`}
      title={matched ? "Recommended" : undefined}
    >
      {p[1] && <img src={p[1]} alt="" />}
      {p[0]}
    </span>
  );
}

function DetailView({ w, mode, perkdb, onClose }) {
  const g = effectiveGrade(w, mode);
  const best = new Set(g.bestRoll || []);
  const ownedSet = new Set(w.perks || []);
  const ownedWeaponPerks = (w.perks || []).filter((h) => perkdb[h]);
  const missing = (g.bestRoll || []).filter((h) => !ownedSet.has(h));
  const modeGrades = MODES.map(([m, label]) => [label, effectiveGrade(w, m)]);
  const cols = (w.cols || []).filter((c) => c.some((h) => perkdb[h]));

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${w.name} details`}>
        <div className="sheet-head">
          {w.icon && <img className="sheet-icon" src={w.icon} alt="" />}
          <div className="sheet-title">
            <h3>{w.name}</h3>
            <span className="muted">{w.tier} {w.type}</span>
          </div>
          <button className="ghost-btn close" onClick={onClose}>Close</button>
        </div>

        <div className="mode-grades">
          {modeGrades.map(([label, mg]) => (
            <div key={label} className="mode-grade">
              <span className="mode-grade-label">{label}</span>
              <div className={`grade ${tierClass(mg.tier)}`}>
                <span className="grade-letter">{mg.tier}</span>
                <span className="grade-sub">
                  {mg.tier === "?" ? "unrated" : mg.tier === "E" ? "exotic" : `${Math.round(mg.ratio * 100)}%`}
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="verdict">
          {g.tier === "E"
            ? "Exotics have fixed rolls — there's nothing to reroll, so they aren't graded against the wishlist."
            : g.tier === "?"
            ? "No community recommendations for this weapon in this mode."
            : `${TIER_LABEL[g.tier]} — matched against ${g.rollsConsidered.toLocaleString()} community rolls${mode !== "all" ? ` for ${mode.toUpperCase()}` : ""}.`}
        </p>

        <section>
          <h4>Your roll</h4>
          {ownedWeaponPerks.length === 0 ? (
            <p className="muted">No perk data on this copy.</p>
          ) : (
            <div className="perks">
              {ownedWeaponPerks.map((h) => (
                <PerkChip key={h} hash={h} perkdb={perkdb} matched={best.has(h)} />
              ))}
            </div>
          )}
          {g.tier !== "?" && g.tier !== "S" && g.tier !== "E" && missing.some((h) => perkdb[h]) && (
            <>
              <h4>What the god roll wants instead</h4>
              <div className="perks">
                {missing.map((h) => (
                  <PerkChip key={h} hash={h} perkdb={perkdb} matched={false} />
                ))}
              </div>
            </>
          )}
        </section>

        {cols.length > 0 && (
          <section>
            <h4>Everything this weapon can roll</h4>
            <div className="cols">
              {cols.map((col, i) => (
                <div className="col" key={i}>
                  <span className="col-label">Column {i + 1}</span>
                  <div className="perks perks-col">
                    {col.map((h) => (
                      <PerkChip key={h} hash={h} perkdb={perkdb} matched={best.has(h)} owned={ownedSet.has(h)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="fineprint">Gold outline = recommended by the community · filled = on your copy</p>
          </section>
        )}

        {w.stats?.length > 0 && (
          <section>
            <h4>Stats</h4>
            <div className="stats">
              {w.stats.map(([name, value, isBar]) => (
                <div className="stat" key={name}>
                  <span className="stat-name">{name}</span>
                  {isBar ? (
                    <span className="stat-bar"><i style={{ width: `${Math.min(value, 100)}%` }} /></span>
                  ) : (
                    <span className="stat-bar stat-num" />
                  )}
                  <span className="stat-value">{value}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
