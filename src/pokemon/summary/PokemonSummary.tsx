import { dayOf, formatDay } from "../../core";
import { PokemonSprite, TypeChips } from "../components";
import {
  GENDER_SYMBOL,
  GROWTH_LABELS,
  MAX_LEVEL,
  STAT_IDS,
  STAT_LABELS,
  STAT_SHORT,
  TYPES,
  abilityOf,
  calcStats,
  defaultMoveset,
  genderOf,
  natureEffect,
  natureOf,
  statTotal,
  upcomingMoves,
  useMoves,
  useSpecies,
  weaknesses,
  slugToName,
  type MoveData,
  type PokemonType,
  type SpeciesData,
} from "../dex";
import { pokemonLevel } from "../levels";
import { displayName, individualOf, type OwnedPokemon } from "../owned";
import { dexLabel } from "../species";
import "./summary.css";

/**
 * Everything about one of your Pokémon: level and EXP, stats (from its base stats, IVs, EVs,
 * nature and level, using the games' formula), nature, ability, gender, moves and type
 * matchups. Pokédex data loads from PokéAPI (cached); the rest comes from your saved Pokémon.
 */
export function PokemonSummary({ pokemon, gainedExp }: { pokemon: OwnedPokemon; gainedExp: number }) {
  const d = pokemon.data;
  const { data: species, loading, error } = useSpecies(d.dex);
  const growth = species?.growthRate ?? d.growthRate;
  const level = pokemonLevel(gainedExp, growth);
  const { pid, ivs, evs } = individualOf(pokemon);
  const nature = natureOf(pid);
  const effect = natureEffect(nature);
  const gender = species ? genderOf(pid, species.genderRate) : null;
  const ability = species ? abilityOf(pid, species.abilities) : null;
  const moveSlugs = species ? defaultMoveset(species.learnset, level.level) : [];
  const { moves } = useMoves(moveSlugs);
  const stats = species ? calcStats(species.baseStats, ivs, evs, level.level, nature) : null;
  const max = level.level >= MAX_LEVEL;
  const name = displayName(pokemon);

  return (
    <div className="psum">
      <header className="psum-head">
        <div className={`psum-portrait${d.shiny ? " is-shiny" : ""}`}>
          <PokemonSprite dex={d.dex} shiny={d.shiny} name={d.name} className="psum-sprite" />
        </div>
        <div className="psum-title">
          <div className="psum-name">
            <strong>{name}</strong>
            {gender && gender !== "genderless" && (
              <span className={`psum-gender is-${gender}`} aria-label={gender}>
                {GENDER_SYMBOL[gender]}
              </span>
            )}
            <span className="psum-level">Lv. {level.level}</span>
          </div>
          <div className="muted psum-sub">
            {d.nickname ? `${d.name} · ` : ""}
            {dexLabel(d.dex)}
            {species?.genus ? ` · ${species.genus}` : ""}
          </div>
          <div className="psum-tags">
            <TypeChips types={species?.types ?? d.types} />
            {d.shiny && <span className="psum-badge is-shiny">✨ Shiny</span>}
            {d.rarity !== "common" && <span className={`psum-badge is-${d.rarity}`}>{d.rarity === "legendary" ? "Legendary" : "Mythical"}</span>}
          </div>
        </div>
      </header>

      <section className="psum-exp" aria-label="Experience">
        <div className="psum-exp-head">
          <span>
            <strong>EXP</strong> {level.exp.toLocaleString()}
          </span>
          <span className="muted">{max ? "Max level" : `${level.toNext.toLocaleString()} to Lv. ${level.level + 1}`}</span>
        </div>
        <div className="psum-bar" role="progressbar" aria-valuemin={0} aria-valuemax={max ? 1 : level.needed} aria-valuenow={max ? 1 : level.into}>
          <span style={{ width: `${max ? 100 : (level.into / level.needed) * 100}%` }} />
        </div>
        <div className="muted psum-exp-foot">{growth ? `${GROWTH_LABELS[growth]} growth` : "Growth rate loading…"}</div>
      </section>

      {error && !species && <p className="hint hint-error psum-error">{error}. Showing what's saved; details will load when you're back online.</p>}
      {loading && !species && <p className="muted psum-loading">Loading Pokédex data…</p>}

      <div className="psum-grid">
        <section className="psum-card" aria-label="Stats">
          <h3>Stats</h3>
          <table className="psum-stats">
            <thead>
              <tr>
                <th />
                <th className="num">Stat</th>
                <th className="bar-col" />
                <th className="num muted" title="Base stat">Base</th>
                <th className="num muted" title="Individual value (0-31)">IV</th>
              </tr>
            </thead>
            <tbody>
              {STAT_IDS.map((s) => (
                <tr key={s} className={s === effect.up ? "is-up" : s === effect.down ? "is-down" : ""}>
                  <th scope="row" title={STAT_LABELS[s]}>
                    {STAT_SHORT[s]}
                    {s === effect.up && <span aria-label="raised by nature"> ▲</span>}
                    {s === effect.down && <span aria-label="lowered by nature"> ▼</span>}
                  </th>
                  <td className="num strong">{stats ? stats[s] : "–"}</td>
                  <td className="bar-col">
                    <span className="psum-statbar">
                      <span style={{ width: `${species ? Math.min(100, (species.baseStats[s] / 180) * 100) : 0}%` }} className={statClass(species?.baseStats[s])} />
                    </span>
                  </td>
                  <td className="num muted">{species ? species.baseStats[s] : "–"}</td>
                  <td className="num muted">{ivs[s]}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className="num strong">{stats ? statTotal(stats) : "–"}</td>
                <td />
                <td className="num muted">{species ? statTotal(species.baseStats) : "–"}</td>
                <td className="num muted">{statTotal(ivs)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="psum-card" aria-label="About">
          <h3>About</h3>
          <dl className="psum-facts">
            <dt>Nature</dt>
            <dd>
              {nature}
              {effect.up && (
                <span className="muted">
                  {" "}
                  (+{STAT_SHORT[effect.up]} −{STAT_SHORT[effect.down!]})
                </span>
              )}
            </dd>
            <dt>Ability</dt>
            <dd>{ability ? ability.name : "–"}</dd>
            <dt>Height</dt>
            <dd>{species ? `${species.height} m` : "–"}</dd>
            <dt>Weight</dt>
            <dd>{species ? `${species.weight} kg` : "–"}</dd>
            <dt>Met</dt>
            <dd>{formatDay(dayOf(pokemon.createdAt))}</dd>
          </dl>
          {species?.flavor && <p className="psum-flavor">“{species.flavor}”</p>}
        </section>
      </div>

      <section className="psum-card" aria-label="Moves">
        <h3>
          Moves{" "}
          {species?.learnsetVersion && <span className="muted psum-version">· as in {slugToName(species.learnsetVersion)}</span>}
        </h3>
        {species && moveSlugs.length === 0 && <p className="muted">No level-up moves known.</p>}
        <ul className="psum-moves">
          {moveSlugs.map((slug, i) => (
            <MoveRow key={slug} slug={slug} move={moves[i]} />
          ))}
        </ul>
        {species && <NextMoves species={species} level={level.level} />}
      </section>

      {species && <Matchups types={species.types} />}
    </div>
  );
}

function statClass(base: number | undefined) {
  if (base === undefined) return "";
  return base >= 120 ? "is-great" : base >= 90 ? "is-good" : base >= 60 ? "is-ok" : "is-low";
}

const CATEGORY_LABEL = { physical: "Physical", special: "Special", status: "Status" } as const;

function MoveRow({ slug, move }: { slug: string; move: MoveData | undefined }) {
  return (
    <li className="psum-move" title={move?.effect}>
      <div className="psum-move-head">
        <strong>{move?.name ?? slugToName(slug)}</strong>
        {move && <TypeChips types={[move.type]} />}
      </div>
      {move ? (
        <div className="psum-move-meta">
          <span className={`psum-cat is-${move.category}`}>{CATEGORY_LABEL[move.category]}</span>
          <span>
            <span className="muted">Pow</span> {move.power ?? "—"}
          </span>
          <span>
            <span className="muted">Acc</span> {move.accuracy ?? "—"}
          </span>
          <span>
            <span className="muted">PP</span> {move.pp}
          </span>
        </div>
      ) : (
        <div className="psum-move-meta muted">Loading…</div>
      )}
      {move?.effect && <p className="psum-move-effect muted">{move.effect}</p>}
    </li>
  );
}

function NextMoves({ species, level }: { species: SpeciesData; level: number }) {
  const next = upcomingMoves(species.learnset, level, 3);
  if (!next.length) return null;
  return (
    <p className="muted psum-next">
      Learns next: {next.map((e) => `${slugToName(e.move)} (Lv. ${e.level})`).join(", ")}
    </p>
  );
}

function Matchups({ types }: { types: string[] }) {
  const w = weaknesses(types);
  const group = (test: (m: number) => boolean) => TYPES.filter((t) => test(w[t]));
  const rows: [string, PokemonType[], string][] = [
    ["Weak to", group((m) => m > 1), "is-weak"],
    ["Resists", group((m) => m > 0 && m < 1), "is-resist"],
    ["Immune to", group((m) => m === 0), "is-immune"],
  ];
  return (
    <section className="psum-card" aria-label="Type matchups">
      <h3>Type matchups</h3>
      <dl className="psum-matchups">
        {rows
          .filter(([, list]) => list.length)
          .map(([label, list, cls]) => (
            <div key={label} className={cls}>
              <dt>{label}</dt>
              <dd>
                {list.map((t) => (
                  <span key={t} className="psum-matchup">
                    <TypeChips types={[t]} />
                    {w[t] !== 2 && w[t] !== 0.5 && w[t] !== 0 && <span className="psum-mult">×{w[t]}</span>}
                  </span>
                ))}
              </dd>
            </div>
          ))}
      </dl>
    </section>
  );
}
