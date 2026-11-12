import { useEffect, useMemo, useRef, useState } from "react";
import { moduleHref, useCore } from "../../core";
import { Modal } from "../../ui";
import {
  FIELD_CAPACITY,
  PokemonSummary,
  TEAM_SIZE,
  addToTeam,
  displayName,
  inField,
  inStorage,
  onTeam,
  pokemonLevel,
  removeFromTeam,
  setHome,
  setNickname,
  teamOf,
  useOwnedPokemon,
  usePokemonExp,
  type OwnedPokemon,
  type PokemonLevel,
} from "../../pokemon";
import { BattleScreen } from "./battle/BattleScreen";
import { RosterTile, SelectedCard, TeamPanel } from "./components";
import { darknessAt, timeOfDayLabel, type CreatureSpec } from "./engine";
import { FieldView, type FieldHandle } from "./FieldView";
import "./field.css";

const TIME_ICON = { Day: "☀", Dusk: "☾", Night: "☾", Dawn: "☀" } as const;

export function FieldPage() {
  const { store } = useCore();
  const owned = useOwnedPokemon();
  const out = inField(owned);
  const stored = newestFirst(inStorage(owned));
  const full = out.length >= FIELD_CAPACITY;
  const team = teamOf(owned);
  const exp = usePokemonExp();
  const levels = new Map<string, PokemonLevel>(owned.map((p) => [p.id, pokemonLevel(exp.get(p.id) ?? 0, p.data.growthRate)]));
  const levelOf = (p: OwnedPokemon) => levels.get(p.id)!;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [battling, setBattling] = useState(false);
  const summaryOf = owned.find((p) => p.id === summaryId) ?? null;
  const view = useRef<FieldHandle>(null);
  const stage = useRef<HTMLElement>(null);
  const selected = out.find((p) => p.id === selectedId) ?? null;
  const timeOfDay = useTimeOfDay();

  // Only hand the engine a new roster when something it shows actually changed.
  const rosterKey = JSON.stringify(out.map((p) => [p.id, p.data.dex, p.data.shiny, displayName(p), p.data.types, levelOf(p).level, onTeam(p)]));
  const roster = useMemo<CreatureSpec[]>(
    () =>
      out.map((p) => ({
        id: p.id,
        dex: p.data.dex,
        name: displayName(p),
        types: p.data.types,
        shiny: p.data.shiny,
        rarity: p.data.rarity,
        level: levelOf(p).level,
        team: onTeam(p),
      })),
    [rosterKey],
  );

  // Esc closes the card from anywhere on the page (not just when the field has focus).
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) view.current?.select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 3500);
  };

  const pickFromList = (p: OwnedPokemon) => {
    view.current?.select(p.id, true);
    stage.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const setTeam = async (p: OwnedPokemon, join: boolean) => {
    if (!join) return removeFromTeam(store, p);
    const result = await addToTeam(store, p);
    if (result === "team-full") flash(`Your team is full (${TEAM_SIZE}). Remove someone first.`);
    else if (result === "field-full") flash(`The field is full (${FIELD_CAPACITY}). Send someone to storage first.`);
    else if (result === "added") flash(`${displayName(p)} joined your team!`);
  };

  const sendOut = async (p: OwnedPokemon) => {
    if (!(await setHome(store, p, "field"))) flash(`The field is full (${FIELD_CAPACITY}). Send someone to storage first.`);
  };

  return (
    <div className="page page-wide field-page">
      <header className="page-header field-header">
        <div>
          <h1>Field</h1>
          <p className="muted">
            Your Pokémon roam here. Tap one to say hi, then tap the ground to send it somewhere. Pick up to {TEAM_SIZE} for your
            team: they earn XP whenever you do, and fight in battles.
          </p>
        </div>
        <button
          className="btn-primary field-battle-btn"
          onClick={() => setBattling(true)}
          disabled={team.length === 0}
          title={team.length ? "Battle a wild Pokémon near your team's level" : "Add a Pokémon to your team to battle"}
        >
          <span aria-hidden>⚔</span> Wild battle
        </button>
      </header>
      {battling && <BattleScreen onClose={() => setBattling(false)} />}

      <section className="field-stage" ref={stage}>
        <FieldView
          ref={view}
          roster={roster}
          onSelect={setSelectedId}
          label={`Field with ${out.length} Pokémon. Use the list below the field to pick one.`}
        />

        <div className="field-hud">
          <span className="field-pill" title="Follows your local time">
            <span aria-hidden>{TIME_ICON[timeOfDay]}</span> {timeOfDay}
          </span>
          <span className="field-pill">
            {out.length} / {FIELD_CAPACITY} out
          </span>
        </div>

        <div className="field-zoom" role="group" aria-label="View">
          <button onClick={() => view.current?.zoomBy(1.25)} aria-label="Zoom in">
            +
          </button>
          <button onClick={() => view.current?.zoomBy(0.8)} aria-label="Zoom out">
            −
          </button>
          <button onClick={() => view.current?.resetView()} aria-label="Reset view" title="Reset view">
            ⤢
          </button>
        </div>

        {owned.length === 0 && (
          <div className="field-empty">
            <strong>Your field is empty</strong>
            <span>Summon a Pokémon and it will start roaming here.</span>
            <a className="btn-primary" href={moduleHref("summon")}>
              Go to Summon
            </a>
          </div>
        )}

        {notice && (
          <div className="field-notice" role="status">
            {notice}
          </div>
        )}

        {selected && (
          <SelectedCard
            key={selected.id}
            pokemon={selected}
            level={levelOf(selected)}
            team={onTeam(selected)}
            teamFull={team.length >= TEAM_SIZE}
            onClose={() => view.current?.select(null)}
            onPet={() => view.current?.pet(selected.id)}
            onStore={() => void setHome(store, selected, "storage")}
            onRename={(name) => void setNickname(store, selected, name)}
            onTeam={(join) => void setTeam(selected, join)}
            onSummary={() => setSummaryId(selected.id)}
          />
        )}
      </section>
      <p className="field-hint muted">Drag to look around · Pinch or Ctrl/⌘ + scroll to zoom · Esc to let go</p>

      {owned.length > 0 && (
        <section className="section">
          <h2 className="section-title">
            Team <span className="muted">{team.length} / {TEAM_SIZE}</span>
          </h2>
          <TeamPanel team={team} levels={levels} selectedId={selectedId} onPick={pickFromList} />
          {team.length === 0 && <p className="muted team-hint">Tap a Pokémon in the field and choose “Add to team”.</p>}
        </section>
      )}

      <section className="section">
        <h2 className="section-title">
          In the field <span className="muted">{out.length} / {FIELD_CAPACITY}</span>
        </h2>
        {out.length === 0 ? (
          <p className="muted">{owned.length ? "Nobody's out right now. Send someone from storage." : "No Pokémon yet."}</p>
        ) : (
          <ul className="roster-grid">
            {newestFirst(out).map((p) => (
              <RosterTile key={p.id} pokemon={p} level={levelOf(p).level} team={onTeam(p)} active={p.id === selectedId} onClick={() => pickFromList(p)} />
            ))}
          </ul>
        )}
      </section>

      {stored.length > 0 && (
        <section className="section">
          <h2 className="section-title">
            In storage <span className="muted">{stored.length}</span>
          </h2>
          <ul className="roster-grid">
            {stored.map((p) => (
              <RosterTile key={p.id} pokemon={p} level={levelOf(p).level} action={{ label: "Send out", onClick: () => void sendOut(p), disabled: full }} />
            ))}
          </ul>
        </section>
      )}

      {summaryOf && (
        <Modal title={`${displayName(summaryOf)} summary`} onClose={() => setSummaryId(null)} wide>
          <PokemonSummary pokemon={summaryOf} gainedExp={exp.get(summaryOf.id) ?? 0} />
        </Modal>
      )}
    </div>
  );
}

function newestFirst(list: OwnedPokemon[]): OwnedPokemon[] {
  return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
}

/** "Day" / "Dusk" / "Night" / "Dawn", refreshed every minute. */
function useTimeOfDay() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return timeOfDayLabel(darknessAt(now), now);
}
