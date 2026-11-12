import { useEffect, useRef, useState } from "react";
import { moduleHref, useCore, useItems, useModules } from "../../core";
import {
  DEX_SIZE,
  POINTS_LABEL,
  PokemonSprite,
  TypeChips,
  dexLabel,
  getSpecies,
  formatPoints,
  newOwnedPokemon,
  preloadImage,
  refund,
  spendPoints,
  spriteUrl,
  useOwnedPokemon,
  usePoints,
} from "../../pokemon";
import { BallArt } from "./BallArt";
import { GachaMachine, TIMING, type Phase, type Shown } from "./GachaMachine";
import { DEFAULT_MACHINE, MACHINES, ballFor, machineById, oddsOf, pull, type MachineId, type Pull } from "./machines";
import { SUMMON, recentSummons, summonStats, type Summon, type SummonData } from "./model";
import "./summon.css";
import "./gacha.css";

const RECENT_LIMIT = 16;

/** The steps after the Pokémon is known, in order. */
const SEQUENCE: Phase[] = ["drop", "approach", "wobble", "open"];

const MACHINE_PREF = "cronos.summon.machine";
const loadMachine = (): MachineId => {
  try {
    return machineById(localStorage.getItem(MACHINE_PREF)).id;
  } catch {
    return DEFAULT_MACHINE;
  }
};

/** Development only: tests can queue exact results (window.cronosNextSummon = [{ dex, shiny, tier }]). */
const forcedPull = (): Pull | undefined =>
  import.meta.env.DEV ? (window as unknown as { cronosNextSummon?: Pull[] }).cronosNextSummon?.shift() : undefined;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function SummonPage() {
  const { store } = useCore();
  const summons = useItems({ type: SUMMON }) as Summon[];
  const owned = useOwnedPokemon();
  const modules = useModules();
  const fieldOn = modules.some((m) => m.id === "field");
  const dailiesOn = modules.some((m) => m.id === "dailies");
  const { balance } = usePoints();
  const [machineId, setMachineId] = useState<MachineId>(loadMachine);
  const machine = machineById(machineId);
  const short = machine.cost - balance;
  const stats = summonStats(summons);
  const recent = recentSummons(summons, RECENT_LIMIT);

  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState<Shown | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [joinedField, setJoinedField] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Increases with every summon; an older run that sees a newer number stops. */
  const run = useRef(0);
  const skipped = useRef(false);
  const starting = useRef(false);
  /** Ends the current pause early (used by Skip). */
  const wake = useRef<(() => void) | null>(null);

  const animating = phase !== "idle" && phase !== "reveal" && phase !== "jam";

  /** Wait `ms`, unless the summon is skipped (then return right away). */
  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      if (skipped.current) return resolve();
      const done = () => {
        clearTimeout(timer);
        if (wake.current === done) wake.current = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      wake.current = done;
    });

  // Leaving the page mid-summon: stop the sequence (the summon itself is already saved).
  useEffect(
    () => () => {
      run.current++;
      wake.current?.();
    },
    [],
  );

  const swallowClick = useRef(false);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const reset = () => window.setTimeout(() => (swallowClick.current = false), 0);
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerup", reset, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerup", reset, true);
    };
  }, []);

  const skip = () => {
    skipped.current = true;
    wake.current?.();
  };

  // While the animation plays, a click or tap anywhere (or Esc / Space / Enter) skips to the result.
  useEffect(() => {
    if (!animating) return;
    const onPointer = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // The click that follows this press shouldn't also act on what's under it
      // (the Skip button turns into "Summon again" at that spot).
      swallowClick.current = true;
      skip();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        skip();
      }
    };
    // Attached after the click that started the summon has finished, so that click doesn't count.
    const t = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointer, true);
      document.addEventListener("keydown", onKey, true);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [animating]);

  // Showing a result: a click on anything that isn't a control (the machine, the backdrop, empty
  // space), or Esc, puts the Pokémon away and returns the machine to normal.
  const revealing = phase === "reveal" && shown !== null;
  useEffect(() => {
    if (!revealing) return;
    const dismiss = () => {
      setShown(null);
      setPhase("idle");
    };
    const onPointer = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const t = e.target as Element | null;
      if (t?.closest("button, a, input, textarea, select, label, [role=option], [role=listbox], .stage-info")) return;
      swallowClick.current = true; // the same click mustn't start a new summon on the machine
      dismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-ui-popup], .modal-backdrop")) dismiss();
    };
    const t = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointer, true);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [revealing]);

  const chooseMachine = (id: MachineId) => {
    if (animating) return;
    setMachineId(id);
    try {
      localStorage.setItem(MACHINE_PREF, id);
    } catch {
      /* preference only */
    }
    setError(null);
    setShown(null);
    setPhase("idle");
  };

  const summon = async () => {
    // A ref, not state: two quick clicks arrive before React re-renders.
    if (animating || starting.current) return;
    if (short > 0) {
      setError(`You need ${formatPoints(short)} more for the ${machine.name} machine.`);
      return;
    }
    const id = ++run.current;
    const reduced = prefersReducedMotion();
    skipped.current = reduced;
    setError(null);
    setShown(null);

    // Start turning right away (instant feedback); undo if paying fails.
    starting.current = true;
    setPhase("crank");
    const paid = await spendPoints(store, machine.cost, `${machine.name} summon`)
      .catch(() => null)
      .finally(() => (starting.current = false));
    if (!paid) {
      if (run.current === id) {
        setPhase("idle");
        setError(`Not enough ${POINTS_LABEL} for the ${machine.name} machine.`);
      }
      return;
    }

    const { dex, shiny } = forcedPull() ?? pull(machine);
    const seenBefore = summons.some((s) => s.data.dex === dex);

    let data: SummonData;
    try {
      const [info] = await Promise.all([getSpecies(dex), preloadImage(spriteUrl(dex, shiny)), pause(TIMING.crank)]);
      data = { dex, name: info.name, types: info.types, rarity: info.rarity, shiny, machine: machine.id, cost: machine.cost };
      // Save before the show, so leaving the page mid-animation never loses a summon.
      // The summon is the log entry; the Pokémon itself joins your collection (field or storage).
      const log = await store.create<SummonData>({ type: SUMMON, title: info.name, data });
      const pokemon = await store.create(newOwnedPokemon(data, owned, "summon", log.id, { growthRate: info.growthRate }));
      setJoinedField(pokemon.data.home === "field");
    } catch (err) {
      await refund(store, paid).catch(() => {});
      if (run.current !== id) return;
      const offline = err instanceof TypeError; // fetch() throws TypeError when the network is unreachable
      setError(
        (offline
          ? "Couldn't reach PokéAPI. Check your internet connection and try again."
          : `The machine jammed: ${err instanceof Error ? err.message : String(err)}. Try again.`) + " Your points were refunded.",
      );
      setPhase("jam");
      await new Promise((r) => setTimeout(r, TIMING.jam));
      if (run.current === id) setPhase("idle");
      return;
    }
    if (run.current !== id) return;

    setIsNew(!seenBefore);
    setShown({ summon: data, ball: ballFor(machine, data.rarity), fresh: true });
    for (const step of SEQUENCE) {
      if (skipped.current) break;
      setPhase(step);
      await pause(TIMING[step as keyof typeof TIMING]);
      if (run.current !== id) return;
    }
    setPhase("reveal");
  };

  const showPast = (s: Summon) => {
    if (animating) return;
    run.current++;
    setError(null);
    setIsNew(false);
    setShown({ summon: s.data, ball: ballFor(machineById(s.data.machine), s.data.rarity), fresh: false });
    setPhase("reveal");
  };

  const onStageClick = () => {
    if (animating) skip();
    else if (short <= 0) void summon();
  };

  const s = phase === "reveal" ? shown?.summon : undefined;
  const odds = oddsOf(machine).filter((o) => !/^common/i.test(o.label));

  return (
    <div className="page page-wide summon-page">
      <header className="summon-header">
        <h1>Summon</h1>
        <div className="points-balance" title={dailiesOn ? `${POINTS_LABEL}: earned from dailies and more` : POINTS_LABEL}>
          <span className="points-icon" aria-hidden>
            ◈
          </span>
          <strong className="points-value">{balance.toLocaleString()}</strong>
          <span className="muted">GP</span>
        </div>
      </header>

      <section className="card summon-stage">
        <div className="summon-machine">
          <GachaMachine phase={phase} shown={shown} machine={machine} onClick={onStageClick} />
        </div>

        <div className="summon-side">
          <div className="machine-picker" role="radiogroup" aria-label="Machine">
            {MACHINES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={m.id === machine.id}
                className={`machine-option is-${m.id}${m.id === machine.id ? " is-selected" : ""}`}
                onClick={() => chooseMachine(m.id)}
                disabled={animating}
                title={m.blurb}
              >
                <svg viewBox="-14 -14 28 28" className="machine-option-ball" aria-hidden>
                  <BallArt kind={m.ball} r={12} />
                </svg>
                <span className="machine-option-name">{m.name.replace(/ Ball$/, "")}</span>
                <span className={`machine-option-cost${balance < m.cost ? " is-short" : ""}`}>{m.cost.toLocaleString()}</span>
              </button>
            ))}
          </div>
          <p className="machine-odds" aria-label="Odds">
            <span className="machine-blurb">{machine.blurb}</span>
            {odds.map((o) => (
              <span key={o.label}>
                {o.label} <strong>{o.value}</strong>
              </span>
            ))}
          </p>

          <div className="stage-info" aria-live="polite">
            {s ? (
              <div className={`stage-details${shown?.fresh ? " is-fresh" : ""}`}>
                <div className="stage-name">
                  <strong>{s.name}</strong> <span className="muted">{dexLabel(s.dex)}</span>
                </div>
                <div className="stage-tags">
                  <TypeChips types={s.types} />
                  {s.shiny && <span className="poke-badge is-shiny">✨ Shiny</span>}
                  {s.rarity === "legendary" && <span className="poke-badge is-legendary">Legendary</span>}
                  {s.rarity === "mythical" && <span className="poke-badge is-mythical">Mythical</span>}
                  {shown?.fresh && isNew && <span className="poke-badge is-new">New!</span>}
                </div>
                {shown?.fresh && fieldOn && (
                  <a className="stage-field-link" href={moduleHref("field")}>
                    {joinedField ? "Roaming in your Field →" : "Field full: sent to storage →"}
                  </a>
                )}
              </div>
            ) : error ? (
              <p className="hint hint-error stage-caption" role="alert">
                {error}
              </p>
            ) : (
              <p className="muted stage-caption">
                {animating
                  ? "Click anywhere to skip"
                  : short > 0
                    ? `${formatPoints(short)} more needed.${dailiesOn ? " Dailies earn points." : ""}`
                    : "Turn the crank. Who will you meet?"}
              </p>
            )}
          </div>

          {animating ? (
            <button className="btn-ghost summon-btn" onClick={skip}>
              Skip
            </button>
          ) : (
            <button className="btn-primary summon-btn" onClick={() => void summon()} disabled={short > 0}>
              {phase === "idle" && !shown ? "Summon" : "Summon again"} · {formatPoints(machine.cost)}
            </button>
          )}
        </div>
      </section>

      <section className="summon-recent" aria-label="Recent summons">
        <div className="summon-recent-head">
          <h2 className="summon-recent-title">Recent</h2>
          <span className="muted summon-recent-stats">
            {stats.total.toLocaleString()} summon{stats.total === 1 ? "" : "s"} · Pokédex {stats.unique.toLocaleString()}/{DEX_SIZE.toLocaleString()}
            {stats.shinies > 0 && ` · ✨ ${stats.shinies.toLocaleString()}`}
          </span>
        </div>
        {recent.length === 0 ? (
          <p className="muted summon-recent-empty">Your summons will show up here.</p>
        ) : (
          <ul className="summon-history">
            {recent.map((r) => (
              <li key={r.id}>
                <button
                  className={`summon-past${r.data.shiny ? " is-shiny" : ""} rarity-${r.data.rarity}`}
                  onClick={() => showPast(r)}
                  disabled={animating}
                  title={`${r.data.name} ${dexLabel(r.data.dex)}${r.data.shiny ? " (shiny)" : ""}`}
                  aria-label={`${r.data.name}${r.data.shiny ? ", shiny" : ""}`}
                >
                  <PokemonSprite dex={r.data.dex} shiny={r.data.shiny} name={r.data.name} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
