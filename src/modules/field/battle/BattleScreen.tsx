import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useCore } from "../../../core";
import {
  STATUS_LABEL,
  activeOf,
  battleRewards,
  canSwitchTo,
  createBattle,
  loadOwnedBattler,
  loadWildBattler,
  newSeed,
  openingEvents,
  pickWildEncounter,
  resolveTurn,
  rngFrom,
  sendIn,
  type BattleAction,
  type BattleEvent,
  type BattleRewards,
  type BattleState,
  type Battler,
  type MajorStatus,
  type SideIndex,
} from "../../../pokemon/battle";
import { PokemonSprite, TYPE_COLORS, backSpriteUrl, teamOf, useOwnedPokemon, usePokemonExp } from "../../../pokemon";
import { LIGHT_TYPES } from "../../../pokemon/species";
import { saveBattleRewards } from "./save";
import "./battle.css";

/** What's on screen while events play out (it trails the real state until the turn finishes). */
interface View {
  active: [number, number];
  hp: Record<string, number>;
  status: Record<string, MajorStatus | null>;
  fainted: Record<string, boolean>;
  /** Which side just got hit or attacked (for a short animation). */
  hit: SideIndex | null;
  attack: SideIndex | null;
}

const viewOf = (s: BattleState): View => {
  const all = [...s.sides[0].battlers, ...s.sides[1].battlers];
  return {
    active: [s.sides[0].active, s.sides[1].active],
    hp: Object.fromEntries(all.map((b) => [b.key, b.hp])),
    status: Object.fromEntries(all.map((b) => [b.key, b.status])),
    fainted: Object.fromEntries(all.map((b) => [b.key, b.hp <= 0])),
    hit: null,
    attack: null,
  };
};

function applyEvent(v: View, e: BattleEvent, s: BattleState): View {
  const keyOf = (side: SideIndex, index = v.active[side]) => s.sides[side].battlers[index].key;
  const next: View = { ...v, hit: null, attack: null };
  switch (e.t) {
    case "switch":
      next.active = [...v.active] as [number, number];
      next.active[e.side] = e.index;
      next.hp = { ...v.hp, [keyOf(e.side, e.index)]: e.hp };
      break;
    case "move":
      next.attack = e.side;
      break;
    case "damage":
      next.hp = { ...v.hp, [keyOf(e.side)]: e.hp };
      if (e.amount > 0) next.hit = e.side;
      break;
    case "heal":
      next.hp = { ...v.hp, [keyOf(e.side)]: e.hp };
      break;
    case "status":
      next.status = { ...v.status, [keyOf(e.side)]: e.status };
      break;
    case "faint":
      next.fainted = { ...v.fainted, [keyOf(e.side)]: true };
      break;
  }
  return next;
}

/** How long each kind of event stays on screen (ms). A tap moves on sooner. */
const PACE = { text: 1050, hp: 520, quick: 160 };

type Phase = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready" };

/**
 * A wild battle, over the Field: your team against a wild Pokémon near your team's level.
 * The rules live in pokemon/battle (pure); this only draws it and saves what you earned.
 */
export function BattleScreen({ onClose }: { onClose: () => void }) {
  const { store, bus } = useCore();
  const owned = useOwnedPokemon();
  const exp = usePokemonExp();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"moves" | "switch">("moves");
  const [rewards, setRewards] = useState<BattleRewards | null>(null);
  const [round, setRound] = useState(0);
  const hurry = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  const saved = useRef<string | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      hurry.current?.();
    };
  }, []);

  // Set up a battle (again when "Battle again" bumps the round).
  useEffect(() => {
    let live = true;
    (async () => {
      setPhase({ kind: "loading" });
      setRewards(null);
      setPanel("moves");
      setMessage("");
      try {
        const team = teamOf(owned);
        if (!team.length) throw new Error("Add Pokémon to your team first.");
        const seed = newSeed();
        const rng = rngFrom(seed);
        const mine = await Promise.all(team.map((p) => loadOwnedBattler(p, exp.get(p.id) ?? 0)));
        const enc = pickWildEncounter(
          mine.map((b) => b.level),
          rng,
        );
        const wild = await loadWildBattler(enc.dex, enc.level, rng);
        if (!live) return;
        const state = createBattle({ id: `${Date.now().toString(36)}-${seed.toString(36)}`, kind: "wild", player: { name: "You", battlers: mine }, foe: { name: "Wild", battlers: [wild] }, seed: rng.state() });
        setBattle(state);
        setView(viewOf(state));
        setPhase({ kind: "ready" });
        await play(state, openingEvents(state), state);
      } catch (err) {
        if (!live) return;
        const offline = err instanceof TypeError;
        setPhase({ kind: "error", message: offline ? "Couldn't reach PokéAPI. Check your connection and try again." : err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = window.setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        if (hurry.current === done) hurry.current = null;
        resolve();
      }
      hurry.current = done;
    });

  /** Show events one by one, then settle on the new state. */
  async function play(before: BattleState, events: BattleEvent[], after: BattleState) {
    setBusy(true);
    let v = viewOf(before);
    for (const e of events) {
      if (!alive.current) return;
      v = applyEvent(v, e, after);
      setView(v);
      if (e.text) setMessage(e.text);
      await wait(e.text ? PACE.text : e.t === "damage" || e.t === "heal" ? PACE.hp : PACE.quick);
    }
    if (!alive.current) return;
    setBattle(after);
    setView({ ...viewOf(after) });
    setBusy(false);
    if (after.outcome) finish(after);
    else if (after.needsSwitch) {
      setPanel("switch");
      setMessage("Choose your next Pokémon.");
    } else {
      setPanel("moves");
      setMessage(`What will ${activeOf(after, 0).name} do?`);
    }
  }

  function finish(s: BattleState) {
    const r = battleRewards(s);
    setRewards(r);
    if (saved.current !== s.id && Object.keys(r.exp).length) {
      saved.current = s.id;
      void saveBattleRewards(store, bus, s.id, r);
    }
  }

  async function act(action: BattleAction) {
    if (!battle || busy || battle.outcome) return;
    if (battle.needsSwitch && action.kind === "switch") {
      const r = sendIn(battle, action.index);
      return play(battle, r.events, r.state);
    }
    const r = resolveTurn(battle, action);
    await play(battle, r.events, r.state);
  }

  // Esc leaves (it's a wild battle); a tap on the scene hurries the text along.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (busy && (e.key === "Enter" || e.key === " ")) hurry.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const me = battle && view ? battle.sides[0].battlers[view.active[0]] : null;
  const foe = battle && view ? battle.sides[1].battlers[view.active[1]] : null;

  return (
    <div className="battle-overlay" role="dialog" aria-modal="true" aria-label="Wild battle">
      <div className="battle">
        <button className="battle-close" onClick={onClose} aria-label={battle?.outcome ? "Close" : "Leave the battle"} title={battle?.outcome ? "Close" : "Leave (counts as running away)"}>
          ✕
        </button>

        {phase.kind === "loading" && (
          <div className="battle-loading">
            <span className="battle-spinner" aria-hidden />
            <p>Looking for a wild Pokémon…</p>
          </div>
        )}
        {phase.kind === "error" && (
          <div className="battle-loading">
            <p className="hint-error">{phase.message}</p>
            <div className="battle-end-actions">
              <button className="btn-ghost" onClick={onClose}>
                Close
              </button>
              <button className="btn-primary" onClick={() => setRound((n) => n + 1)}>
                Try again
              </button>
            </div>
          </div>
        )}

        {phase.kind === "ready" && battle && view && me && foe && (
          <>
            <div className="battle-scene" onClick={() => hurry.current?.()}>
              <div className="battle-foe">
                <InfoBox b={foe} hp={view.hp[foe.key]} status={view.status[foe.key]} showNumbers={false} />
                <div className={`battle-mon is-foe${view.hit === 1 ? " is-hit" : ""}${view.attack === 1 ? " is-attacking" : ""}${view.fainted[foe.key] ? " is-fainted" : ""}`} key={foe.key}>
                  <span className="battle-platform" aria-hidden />
                  <PokemonSprite dex={foe.dex} shiny={foe.shiny} name={foe.name} className="battle-sprite" />
                </div>
              </div>
              <div className="battle-me">
                <div className={`battle-mon is-mine${view.hit === 0 ? " is-hit" : ""}${view.attack === 0 ? " is-attacking" : ""}${view.fainted[me.key] ? " is-fainted" : ""}`} key={me.key}>
                  <span className="battle-platform" aria-hidden />
                  <BackSprite b={me} />
                </div>
                <InfoBox b={me} hp={view.hp[me.key]} status={view.status[me.key]} showNumbers />
              </div>
            </div>

            <div className="battle-console">
              <p className="battle-message" aria-live="polite" onClick={() => hurry.current?.()}>
                {message || " "}
              </p>

              {battle.outcome ? (
                <EndPanel s={battle} rewards={rewards} onAgain={() => setRound((n) => n + 1)} onClose={onClose} />
              ) : busy ? null : panel === "switch" || battle.needsSwitch ? (
                <div className="battle-switch">
                  <div className="battle-team">
                    {battle.sides[0].battlers.map((b, i) => (
                      <button key={b.key} className={`battle-team-mon${i === battle.sides[0].active ? " is-active" : ""}`} disabled={!canSwitchTo(battle, 0, i)} onClick={() => void act({ kind: "switch", index: i })}>
                        <PokemonSprite dex={b.dex} shiny={b.shiny} name={b.name} />
                        <span className="battle-team-name">{b.name}</span>
                        <span className="battle-team-lv">Lv. {b.level}</span>
                        <HpBar hp={b.hp} max={b.stats.hp} small />
                      </button>
                    ))}
                  </div>
                  {!battle.needsSwitch && (
                    <button className="btn-ghost battle-back" onClick={() => setPanel("moves")}>
                      Back
                    </button>
                  )}
                </div>
              ) : (
                <div className="battle-actions">
                  <div className="battle-moves">
                    {me.moves.some((m) => m.pp > 0) ? (
                      me.moves.map((m, i) => (
                        <button
                          key={m.slug}
                          className="battle-move"
                          style={{ "--type": TYPE_COLORS[m.type] ?? "var(--muted)" } as CSSProperties}
                          disabled={m.pp <= 0}
                          onClick={() => void act({ kind: "move", index: i })}
                          title={`${m.category === "status" ? "Status" : `Power ${m.power ?? "—"}`} · Accuracy ${m.accuracy ?? "—"}`}
                        >
                          <span className="battle-move-name">{m.name}</span>
                          <span className="battle-move-meta">
                            <span className={`battle-move-type${LIGHT_TYPES.has(m.type) ? " is-light" : ""}`}>{m.type}</span>
                            <span className="battle-move-pp">
                              {m.pp}/{m.maxPp}
                            </span>
                          </span>
                        </button>
                      ))
                    ) : (
                      <button className="battle-move" style={{ "--type": "var(--muted)" } as CSSProperties} onClick={() => void act({ kind: "move", index: 0 })}>
                        <span className="battle-move-name">Struggle</span>
                        <span className="battle-move-meta">No PP left</span>
                      </button>
                    )}
                  </div>
                  <div className="battle-side-actions">
                    <button className="btn-ghost" onClick={() => setPanel("switch")} disabled={!battle.sides[0].battlers.some((_, i) => canSwitchTo(battle, 0, i))}>
                      Pokémon
                    </button>
                    <button className="btn-ghost" onClick={() => void act({ kind: "run" })}>
                      Run
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function InfoBox({ b, hp, status, showNumbers }: { b: Battler; hp: number; status: MajorStatus | null; showNumbers: boolean }) {
  return (
    <div className="battle-info">
      <div className="battle-info-head">
        <strong className="battle-info-name">{b.name}</strong>
        {status && <span className={`battle-status is-${status}`}>{STATUS_LABEL[status]}</span>}
        <span className="battle-info-lv">Lv. {b.level}</span>
      </div>
      <HpBar hp={hp} max={b.stats.hp} />
      {showNumbers && (
        <div className="battle-info-hp">
          {hp} / {b.stats.hp}
        </div>
      )}
    </div>
  );
}

function HpBar({ hp, max, small = false }: { hp: number; max: number; small?: boolean }) {
  const pct = max ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  const tone = pct > 50 ? "high" : pct > 20 ? "mid" : "low";
  return (
    <div className={`battle-hp${small ? " is-small" : ""}`} role="meter" aria-label="HP" aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp}>
      <span className="battle-hp-label" aria-hidden>
        HP
      </span>
      <span className="battle-hp-track">
        <span className={`battle-hp-fill is-${tone}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

/** Your Pokémon from behind; falls back to the front sprite when there's no back view. */
function BackSprite({ b }: { b: Battler }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <PokemonSprite dex={b.dex} shiny={b.shiny} name={b.name} className="battle-sprite is-back" />;
  return <img className="poke-sprite battle-sprite is-back" src={backSpriteUrl(b.dex, b.shiny)} alt={b.name} draggable={false} onError={() => setFailed(true)} />;
}

function EndPanel({ s, rewards, onAgain, onClose }: { s: BattleState; rewards: BattleRewards | null; onAgain: () => void; onClose: () => void }) {
  const names = new Map(s.sides[0].battlers.map((b) => [b.ownedId, b.name]));
  const gains = Object.entries(rewards?.exp ?? {});
  const title = s.outcome === "win" ? "You won!" : s.outcome === "lose" ? "Your team needs a rest" : "Got away safely";
  return (
    <div className="battle-end">
      <strong className="battle-end-title">{title}</strong>
      {gains.length > 0 ? (
        <ul className="battle-end-gains">
          {gains.map(([id, n]) => (
            <li key={id}>
              {names.get(id)} <strong>+{n.toLocaleString()} EXP</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted battle-end-note">{s.outcome === "lose" ? "No harm done: your Pokémon are back to full health for the next battle." : "No EXP this time."}</p>
      )}
      <div className="battle-end-actions">
        <button className="btn-ghost" onClick={onClose}>
          Done
        </button>
        <button className="btn-primary" onClick={onAgain}>
          Battle again
        </button>
      </div>
    </div>
  );
}
