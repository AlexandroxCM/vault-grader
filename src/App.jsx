import { useEffect, useMemo, useState } from "react";

const TIERS = ["S", "A", "B", "C", "D", "E", "?"];
const TIER_LABEL = {
  S: "God roll", A: "Keeper", B: "Solid", C: "Backup", D: "Shard it",
  E: "Exotic", "?": "Unrated",
};
const TIER_ORDER_WORST_FIRST = { D: 0, C: 1, B: 2, A: 3, S: 4, E: 5, "?": 6 };
const TIER_ORDER_BEST_FIRST = { S: 0, A: 1, B: 2, C: 3, D: 4, E: 5, "?": 6 };
const MODES = [["all", "All"], ["pve", "PvE"], ["pvp", "PvP"]];
const tierClass = (t) => `tier-${t === "?" ? "U" : t}`;

// Exotics with no community rolls get their own tier instead of "?"
function effectiveGrade(w, mode) {
  const g = w.grades?.[mode] || { tier: "?", ratio: 0, rollsConsidered: 0, bestRoll: [] };
  if (g.tier === "?" && w.tier === "Exotic") return { ...g, tier: "E" };
  return g;
}

function useRoute() {
  const [route, setRoute] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
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
  const [dupesView, setDupesView] = useState(false);
  const [copied, setCopied] = useState(false);

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
    const order = worstFirst ? TIER_ORDER_WORST_FIRST : TIER_ORDER_BEST_FIRST;
    return [...list].sort((a, b) => {
      const d = order[effectiveGrade(a, mode).tier] - order[effectiveGrade(b, mode).tier];
      return d || a.name.localeCompare(b.name);
    });
  }, [weapons, filter, worstFirst, search, mode]);

  // Group same-name copies; rank within group; mark keep/shard.
  const dupeGroups = useMemo(() => {
    const byName = new Map();
    for (const w of weapons) {
      if (search.trim() && !w.name.toLowerCase().includes(search.trim().toLowerCase())) continue;
      if (!byName.has(w.name)) byName.set(w.name, []);
      byName.get(w.name).push(w);
    }
    const groups = [];
    for (const copies of byName.values()) {
      if (copies.length < 2) continue;
      const ranked = [...copies].sort((a, b) => {
        const ga = effectiveGrade(a, mode), gb = effectiveGrade(b, mode);
        return TIER_ORDER_BEST_FIRST[ga.tier] - TIER_ORDER_BEST_FIRST[gb.tier] || gb.ratio - ga.ratio;
      });
      const top = effectiveGrade(ranked[0], mode);
      groups.push({
        name: ranked[0].name,
        type: ranked[0].type,
        copies: ranked.map((w, i) => {
          const g = effectiveGrade(w, mode);
          const tie = i > 0 && g.tier === top.tier && g.ratio === top.ratio;
          return { w, verdict: i === 0 ? "keep" : tie ? "tie" : "shard" };
        }),
      });
    }
    return groups.sort((a, b) => b.copies.length - a.copies.length || a.name.localeCompare(b.name));
  }, [weapons, mode, search]);

  const shardList = useMemo(() => {
    const lines = new Set();
    for (const g of dupeGroups)
      for (const c of g.copies)
        if (c.verdict === "shard")
          lines.add(`${c.w.name} (${c.w.type}) — duplicate, worse than your best copy`);
    for (const w of weapons)
      if (effectiveGrade(w, mode).tier === "D")
        lines.add(`${w.name} (${w.type}) — no community roll match`);
    return [...lines].sort();
  }, [dupeGroups, weapons, mode]);

  const copyShardList = () => {
    const text = `Vault Grader shard list (${mode.toUpperCase()} · ${new Date().toLocaleDateString()})\n\n` + shardList.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true" />Vault Grader</div>
        <nav className="nav">
          <a className={`ghost-btn ${route.startsWith("#/db") ? "toggled" : ""}`} href="#/db">Database</a>
          <a className={`ghost-btn ${!route.startsWith("#/db") ? "toggled" : ""}`} href="#/">My vault</a>
          {status === "ready" && <a className="ghost-btn" href="/api/logout">Sign out</a>}
        </nav>
      </header>

      {errorMsg && <div className="notice">{errorMsg}</div>}

      {route.startsWith("#/db") ? (
        <DbBrowser db={db} onOpen={setSelected} />
      ) : (
        <>
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
            {!dupesView && (
              <button className="ghost-btn" onClick={() => setWorstFirst((v) => !v)}>
                {worstFirst ? "Worst first" : "Best first"}
              </button>
            )}
            <button className={`ghost-btn ${dupesView ? "toggled" : ""}`} onClick={() => setDupesView((v) => !v)}>
              Duplicates{dupeGroups.length ? ` (${dupeGroups.length})` : ""}
            </button>
            {shardList.length > 0 && (
              <button className="ghost-btn" onClick={copyShardList}>
                {copied ? "Copied!" : `Copy shard list (${shardList.length})`}
              </button>
            )}
          </div>

          {dupesView ? (
            dupeGroups.length === 0 ? (
              <p className="muted center">No duplicates — your vault has one copy of everything shown.</p>
            ) : (
              <div className="dupes">
                {dupeGroups.map((g) => (
                  <section className="dupe-group" key={g.name}>
                    <div className="dupe-head">
                      <span className="dupe-name">{g.name}</span>
                      <span className="muted">{g.type} · {g.copies.length} copies</span>
                    </div>
                    <ul className="grid">
                      {g.copies.map(({ w, verdict }) => (
                        <li key={w.instanceId} className={`card tierline-${effectiveGrade(w, mode).tier === "?" ? "U" : effectiveGrade(w, mode).tier}`}>
                          <button className="card-btn" onClick={() => setSelected(w)}>
                            {w.icon && <img className="icon" src={w.icon} alt="" loading="lazy" />}
                            <div className="card-body">
                              <span className={`chip chip-${verdict}`}>
                                {verdict === "keep" ? "KEEP" : verdict === "tie" ? "TIE" : "SHARD"}
                              </span>
                            </div>
                            <div className={`grade ${tierClass(effectiveGrade(w, mode).tier)}`}>
                              <span className="grade-letter">{effectiveGrade(w, mode).tier}</span>
                              <span className="grade-sub">
                                {effectiveGrade(w, mode).tier === "?" ? "unrated" : effectiveGrade(w, mode).tier === "E" ? "exotic" : `${Math.round(effectiveGrade(w, mode).ratio * 100)}%`}
                              </span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )
          ) : shown.length === 0 ? (
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

        </>
      )}

      {selected && (
        <DetailView w={selected} mode={mode} perkdb={perkdb || {}} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

const pick = (arr) => [...new Set(arr.filter(Boolean))];

function DbBrowser({ db, onOpen }) {
  const [f, setF] = useState({ q: "", season: "", slot: "", elem: "", rarity: "", breaker: "", src: "" });
  const all = useMemo(() => {
    if (!db) return [];
    return Object.entries(db).map(([hash, w]) => ({ itemHash: Number(hash), ...w }));
  }, [db]);

  const opts = useMemo(() => ({
    season: pick(all.map((w) => w.season)).sort((a, b) => b - a),
    slot: pick(all.map((w) => w.slot)),
    elem: pick(all.map((w) => w.elem)),
    rarity: pick(all.map((w) => w.tier)),
    breaker: pick(all.map((w) => w.breaker)),
  }), [all]);

  const SOURCES = ["Raid", "Dungeon", "Trials", "Iron Banner", "Nightfall", "Crucible", "Gambit"];

  const shown = useMemo(() => {
    return all.filter((w) => {
      if (f.q && !w.name.toLowerCase().includes(f.q.toLowerCase()) && !w.type.toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.season && String(w.season) !== f.season) return false;
      if (f.slot && w.slot !== f.slot) return false;
      if (f.elem && w.elem !== f.elem) return false;
      if (f.rarity && w.tier !== f.rarity) return false;
      if (f.breaker && w.breaker !== f.breaker) return false;
      if (f.src && !(w.src || "").toLowerCase().includes(f.src.toLowerCase())) return false;
      return true;
    }).sort((a, b) => (b.season || 0) - (a.season || 0) || a.name.localeCompare(b.name));
  }, [all, f]);

  if (!db) return <p className="muted center">Loading weapon database…</p>;

  const sel = (key, label, options) => (
    <select className="filter-select" value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })}>
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{key === "season" ? `Season ${o}` : o}</option>)}
    </select>
  );

  return (
    <main>
      <section className="dbhead">
        <h1 className="db-title">Weapon database</h1>
        <p className="muted">
          Every weapon in the game — {all.length.toLocaleString()} of them — with full perk pools,
          stats, and community god rolls. No sign-in needed.
        </p>
      </section>
      <div className="filters">
        <input className="search" placeholder="Search weapons" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        {sel("season", "All seasons", opts.season)}
        {sel("slot", "All slots", opts.slot)}
        {sel("elem", "All elements", opts.elem)}
        {sel("rarity", "All rarities", opts.rarity)}
        {sel("breaker", "Any breaker", opts.breaker)}
        <select className="filter-select" value={f.src} onChange={(e) => setF({ ...f, src: e.target.value })}>
          <option value="">All sources</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <p className="muted count">{shown.length.toLocaleString()} weapons</p>
      <ul className="grid">
        {shown.slice(0, 120).map((w) => (
          <li key={w.itemHash} className="card tierline-U">
            <button className="card-btn" onClick={() => onOpen(w)}>
              {w.icon && <img className="icon" src={w.icon} alt="" loading="lazy" />}
              <div className="card-body">
                <span className="card-name">{w.name}</span>
                <span className="card-type">
                  {[w.tier, w.elem, w.type].filter(Boolean).join(" · ")}
                  {w.season ? ` · S${w.season}` : ""}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {shown.length > 120 && <p className="muted center">Showing first 120 — narrow the filters to see the rest.</p>}
    </main>
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
  const isPublic = !w.grades;
  const [pub, setPub] = useState(null);
  useEffect(() => {
    if (!isPublic) return;
    fetch(`/api/rolls?hash=${w.itemHash}`).then((r) => r.json()).then(setPub).catch(() => setPub({ found: false }));
  }, [w.itemHash, isPublic]);

  const g = effectiveGrade(w, mode);
  const recommended = isPublic ? new Set([...(pub?.pve || []), ...(pub?.pvp || [])]) : null;
  const best = isPublic ? recommended : new Set(g.bestRoll || []);
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

        {!isPublic && <div className="mode-grades">
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
        </div>}

        <p className="verdict">
          {isPublic
            ? pub === null
              ? "Loading community recommendations…"
              : pub.found
              ? `${pub.rollCount.toLocaleString()} community-recommended rolls${pub.viaReissue ? " (via another version of this weapon)" : ""}. Recommended perks are outlined in gold below.`
              : "No community recommendations for this weapon."
            : g.tier === "E"
            ? "Exotics have fixed rolls — there's nothing to reroll, so they aren't graded against the wishlist."
            : g.tier === "?"
            ? "No community recommendations for this weapon in this mode."
            : `${TIER_LABEL[g.tier]} — matched against ${g.rollsConsidered.toLocaleString()} community rolls${mode !== "all" ? ` for ${mode.toUpperCase()}` : ""}.${w.grades?.viaReissue ? " Graded via another version of this weapon (yours is an older reissue)." : ""}`}
        </p>
        {w.flavor && <p className="flavor">“{w.flavor}”</p>}
        {(w.season || w.breaker || w.ammo || w.foundry || w.src) && (
          <p className="meta muted">
            {[w.season ? `Season ${w.season}` : null, w.slot, w.ammo ? `${w.ammo} ammo` : null,
              w.breaker ? `Breaker: ${w.breaker}` : null, w.foundry ? `Foundry: ${w.foundry}` : null]
              .filter(Boolean).join(" · ")}
            {w.src ? ` · ${w.src}` : ""}
          </p>
        )}

        {!isPublic && <section>
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
        </section>}

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
