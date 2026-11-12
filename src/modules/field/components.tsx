import { useState, type FormEvent } from "react";
import { dayOf, formatDay } from "../../core";
import {
  MAX_LEVEL,
  PokemonSprite,
  TEAM_SIZE,
  TypeChips,
  dexLabel,
  displayName,
  type OwnedPokemon,
  type PokemonLevel,
} from "../../pokemon";

/** Lv. 12 with a thin bar toward the next level. */
export function LevelBar({ level, compact = false }: { level: PokemonLevel; compact?: boolean }) {
  const max = level.level >= MAX_LEVEL;
  const pct = max ? 100 : (level.into / level.needed) * 100;
  return (
    <div className={`poke-level${compact ? " is-compact" : ""}`}>
      <span className="poke-level-num">Lv. {level.level}</span>
      <span
        className="poke-level-bar"
        role="progressbar"
        aria-label={`Progress to level ${level.level + 1}`}
        aria-valuemin={0}
        aria-valuemax={max ? 1 : level.needed}
        aria-valuenow={max ? 1 : level.into}
      >
        <span className="poke-level-fill" style={{ width: `${pct}%` }} />
      </span>
      {!compact && (
        <span className="poke-level-text">{max ? "Max level" : `${level.into.toLocaleString()} / ${level.needed.toLocaleString()} EXP`}</span>
      )}
    </div>
  );
}

/** Details and actions for the Pokémon you've tapped. */
export function SelectedCard({
  pokemon,
  level,
  team,
  teamFull,
  onClose,
  onPet,
  onStore,
  onRename,
  onTeam,
  onSummary,
}: {
  pokemon: OwnedPokemon;
  level: PokemonLevel;
  team: boolean;
  teamFull: boolean;
  onClose: () => void;
  onPet: () => void;
  onStore: () => void;
  onRename: (name: string) => void;
  onTeam: (join: boolean) => void;
  onSummary: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const d = pokemon.data;
  const name = displayName(pokemon);

  const startRename = () => {
    setDraft(d.nickname ?? "");
    setRenaming(true);
  };
  const save = (e?: FormEvent) => {
    e?.preventDefault();
    onRename(draft);
    setRenaming(false);
  };

  return (
    <div className="field-card" role="dialog" aria-label={`${name} details`}>
      <PokemonSprite dex={d.dex} shiny={d.shiny} name={d.name} className="field-card-sprite" />
      <div className="field-card-body">
        {renaming ? (
          <form className="field-rename" onSubmit={save}>
            <input
              autoFocus
              value={draft}
              maxLength={24}
              placeholder={d.name}
              aria-label="Nickname"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setRenaming(false))}
            />
            <button className="btn-primary" type="submit">
              Save
            </button>
          </form>
        ) : (
          <div className="field-card-name">
            <strong>{name}</strong>
            <span className="muted">
              {d.nickname ? `${d.name} ` : ""}
              {dexLabel(d.dex)}
            </span>
            {team && <span className="team-badge">★ Team</span>}
          </div>
        )}
        <LevelBar level={level} />
        <div className="field-card-tags">
          <TypeChips types={d.types} />
          {d.shiny && <span className="field-badge is-shiny">✨ Shiny</span>}
          {d.rarity !== "common" && <span className={`field-badge is-${d.rarity}`}>{d.rarity === "legendary" ? "Legendary" : "Mythical"}</span>}
        </div>
        <p className="field-card-meta muted">
          Met {metLabel(pokemon.createdAt)}. {team ? "Earns XP when you do. " : ""}Tap the ground to send {name} there.
        </p>
        <div className="field-card-actions">
          <button className="btn-ghost is-summary" onClick={onSummary}>
            Summary
          </button>
          <button className="btn-ghost" onClick={onPet}>
            ♥ Pet
          </button>
          {team ? (
            <button className="btn-ghost" onClick={() => onTeam(false)}>
              Remove from team
            </button>
          ) : (
            <button className="btn-ghost is-team" onClick={() => onTeam(true)} disabled={teamFull} title={teamFull ? `The team is full (${TEAM_SIZE})` : undefined}>
              ★ Add to team
            </button>
          )}
          {!renaming && (
            <button className="btn-ghost" onClick={startRename}>
              Rename
            </button>
          )}
          {!team && (
            <button className="btn-ghost" onClick={onStore}>
              Send to storage
            </button>
          )}
        </div>
      </div>
      <button className="field-card-close" onClick={onClose} aria-label="Close" title="Close (Esc)">
        <span aria-hidden>✕</span>
      </button>
    </div>
  );
}

/** The six team slots. */
export function TeamPanel({
  team,
  levels,
  selectedId,
  onPick,
}: {
  team: OwnedPokemon[];
  levels: Map<string, PokemonLevel>;
  selectedId: string | null;
  onPick: (p: OwnedPokemon) => void;
}) {
  const slots = Array.from({ length: TEAM_SIZE }, (_, i) => team[i] ?? null);
  return (
    <ol className="team-grid">
      {slots.map((p, i) =>
        p ? (
          <li key={p.id}>
            <button className={`team-slot${p.id === selectedId ? " is-active" : ""}${p.data.shiny ? " is-shiny" : ""}`} onClick={() => onPick(p)}>
              <PokemonSprite dex={p.data.dex} shiny={p.data.shiny} name={p.data.name} />
              <span className="team-slot-body">
                <span className="team-slot-name">{displayName(p)}</span>
                <LevelBar level={levels.get(p.id)!} compact />
              </span>
            </button>
          </li>
        ) : (
          <li key={`empty-${i}`}>
            <div className="team-slot is-empty">
              <span className="team-slot-plus" aria-hidden>
                +
              </span>
              <span className="muted">Empty slot</span>
            </div>
          </li>
        ),
      )}
    </ol>
  );
}

/** A Pokémon in the roster lists below the field. */
export function RosterTile({
  pokemon,
  level,
  team,
  active,
  onClick,
  action,
}: {
  pokemon: OwnedPokemon;
  level: number;
  team?: boolean;
  active?: boolean;
  onClick?: () => void;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  const d = pokemon.data;
  return (
    <li className={`roster-tile${active ? " is-active" : ""}${d.shiny ? " is-shiny" : ""} rarity-${d.rarity}`}>
      <button className="roster-main" onClick={onClick} title={`${displayName(pokemon)} ${dexLabel(d.dex)} · Lv. ${level}`} disabled={!onClick}>
        {team && (
          <span className="roster-team" aria-label="On your team">
            ★
          </span>
        )}
        <span className="roster-level">Lv {level}</span>
        <PokemonSprite dex={d.dex} shiny={d.shiny} name={d.name} />
        <span className="roster-name">{displayName(pokemon)}</span>
      </button>
      {action && (
        <button className="roster-action" onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </button>
      )}
    </li>
  );
}

/** "today", "yesterday" or "on Mon, Oct 12". */
function metLabel(iso: string): string {
  const day = formatDay(dayOf(iso));
  return day === "Today" || day === "Yesterday" ? day.toLowerCase() : `on ${day}`;
}
