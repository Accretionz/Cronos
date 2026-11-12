import { useEffect, useState } from "react";
import { LIGHT_TYPES, TYPE_COLORS, artworkUrl, spriteUrl } from "./species";
import "./pokemon.css";

/**
 * A Pokémon picture. Tries the pixel sprite, then the official artwork,
 * then shows a "?" if neither loads (offline, or PokéAPI hasn't got one yet).
 */
export function PokemonSprite({ dex, shiny = false, name, className }: { dex: number; shiny?: boolean; name: string; className?: string }) {
  const sources = [spriteUrl(dex, shiny), artworkUrl(dex, shiny)];
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [dex, shiny]);

  if (attempt >= sources.length) {
    return (
      <span className={`poke-sprite is-missing ${className ?? ""}`} role="img" aria-label={`${name} (picture unavailable)`}>
        ?
      </span>
    );
  }
  return (
    <img
      key={sources[attempt]}
      className={`poke-sprite${attempt > 0 ? " is-artwork" : ""} ${className ?? ""}`}
      src={sources[attempt]}
      alt={name}
      draggable={false}
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}

export function TypeChips({ types }: { types: string[] }) {
  return (
    <span className="type-chips">
      {types.map((t) => (
        <span
          key={t}
          className={`type-chip${LIGHT_TYPES.has(t) ? " is-light" : ""}`}
          style={{ background: TYPE_COLORS[t] ?? "var(--muted)" }}
        >
          {t}
        </span>
      ))}
    </span>
  );
}
