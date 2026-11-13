# Cronos architecture & foundation review

_Last full review: October 2026. Covers every file in `src/` (~5,300 lines across core, shell
and six modules), the build setup and the repository._

This document is both the analysis of where the app stands and the guide to the conventions
that keep it able to grow. Read the **How it fits together** section before adding a feature.

---

## 1. Summary

The overall shape is sound and doesn't need rethinking:

- **One shared data shape (`Item`)** for every feature.
- **A small core** (store, event bus, module registry, scheduler).
- **Features as self-contained modules** that talk through events.

Six modules were added after the first version (Tasks, Dailies, Calendar, Budget, Level & XP,
Progress), and none of them needed a core redesign. That's the clearest evidence the design
scales.

The review found **three real bugs and several gaps in data safety**. All are now fixed, and
each was checked in a real browser before and after:

| # | Finding | Impact | Status |
|---|---|---|---|
| 1 | Screens didn't notice the date changing while the app was open | After midnight, Today kept showing yesterday; ticking a daily recorded it **on the wrong day** | ✅ Fixed (`useToday()`) |
| 2 | Two open tabs each kept their own copy of the data | A stale tab could **silently overwrite** a change made in the other (confirmed: a rename was lost) | ✅ Fixed (tab sync) |
| 3 | If the browser refused storage (private mode, full disk, blocked) | The whole app **failed to start** | ✅ Fixed (starts in memory with a clear warning) |
| 4 | No way to back up or move data | Clearing site data or switching browsers **lost everything** | ✅ Fixed (Export / Restore in Settings) |
| 5 | Data could be evicted by the browser under disk pressure | Silent data loss on low disk | ✅ Mitigated (asks for persistent storage; Settings shows the status) |
| 6 | No plan for changing stored data in future versions | Changing an item's fields later would break old data | ✅ Fixed (`upgradeItem` hook + DB/backup versions) |
| 7 | Failed saves were invisible to the user | A change could fail with no sign | ✅ Fixed (notice + nothing half-saved) |
| 8 | Unreadable stored items could crash screens | One corrupted record could break a page | ✅ Fixed (`normalizeItem` on load) |
| 9 | Every query scanned all items | Gets slower as XP and transaction history grow | ✅ Fixed (index by type) |
| 10 | No automated tests in the repository | Regressions only caught by hand | ✅ Fixed (`npm test`, 54 tests) |
| 11 | Shared UI (the "⋯" menu) lived inside Budget | Other modules couldn't reuse it without breaking the rules | ✅ Moved to `src/ui` |
| 12 | Debug handle `window.cronos` exposed in production | Minor; easy to misuse | ✅ Development builds only |
| 13 | `README.md` had unresolved Git merge markers | Broken docs on GitHub | ✅ Fixed |
| 14 | Mixed line endings (Windows CRLF vs LF) | Noisy diffs between machines | ✅ `.gitattributes` added |

Items still open are in **§5, Recommendations**. None are urgent.

---

## 2. How it fits together

```
src/
  core/      The foundation. No UI except React hooks. Everything else builds on it.
  ui/        Shared UI components any module may use (e.g. RowMenu).
  shell/     The app frame: sign-in screen, navigation, Today dashboard, Account, Settings, notices.
  pokemon/   Shared Pokémon library (species data, sprites, PokéAPI, owned Pokémon).
  modules/   Features. One folder each. Registered in modules/index.ts.
  test/      Test helpers.
```

**Dependency rule (enforced by convention):**

```
modules ──► core, ui, pokemon   (never another module, never shell)
pokemon ──► core, ui            (never a module: it's the shared base for game features)
ui      ──► core                (never modules or shell)
shell   ──► core, ui            (never a specific module)
core    ──► nothing above it
```

**Shared domain libraries** like `src/pokemon` hold what several game features need (species
facts, sprite URLs, the owned-Pokémon record). They're the answer when two modules need the
same code: move it down into a library rather than importing one module from another.

To use another module's data, query it by item type: the calendar shows tasks with
`useItems({ type: "task" })` and doesn't import anything from Tasks. To react to another
module, listen to an event. Tests are the one exception: integration tests may wire two
modules together.

### The data model

Everything is an `Item` (`core/types.ts`): `id`, `type`, `title`, `status`, optional
`scheduledFor` / `recurrence`, `tags`, a free-form `data` object for feature-specific fields,
and timestamps. Dates are local `"YYYY-MM-DD"` strings (or `"YYYY-MM-DDTHH:MM"`), so "today"
never shifts with time zones. Money is stored in integer cents.

| Type | Owner | Notes |
|---|---|---|
| `task` | Tasks | `status` open/done |
| `daily` | Dailies | completions in `data.doneDays` |
| `event` | Calendar | repeats in `recurrence` (RRULE) |
| `transaction`, `budget-limit`, `budget-settings` | Budget | cents; one settings item (`budget/settings.ts`): category colors, `categoryOrder` and `defaultCategory` per kind (Settings → Budget → Categories; `budget/categories.ts`) |
| `xp` | Level & XP | ledger; total XP = sum |
| `pokemon-summon` | Summon | log: one per summon (dex, name, types, rarity, shiny) |
| `pokemon` | Field (defined in `src/pokemon/owned.ts`) | **one per Pokémon you own**: species fields + `home` (`field`/`storage`), optional `nickname`, `teamSlot` (0–5), `source`/`sourceId`, and its individual values: `growthRate`, `pid` (decides nature, gender, ability), `ivs`, `evs`. Created by Summon; backfilled from past summons with stable ids; older items get `pid`/`ivs` from their id (upgrade) and `growthRate` from PokéAPI (`fillSpeciesFacts`) |
| `pokemon-xp` | Field (`src/pokemon/levels.ts`) | ledger: one per (Pokémon, XP key); id `pxp:<pokemon>:<key>`; `exp` gained (player XP × 10). EXP = EXP at Lv. 5 on its curve + the sum |
| `nav-order` | Shell (`shell/navOrder.ts`) | one item (id `nav-order`), `data.order`: the sidebar order, so it's the same on every device. Saved quietly (no `item.*` events). An order an older version kept in the browser (`cronos.navOrder`) moves into the account the first time it has none |
| `gacha-points` | Summon (`src/pokemon/wallet.ts`) | ledger: + awards (id `gp:<key>`), − spending; balance = sum. Includes a one-time welcome gift |

### The store (`core/store.ts`)

- An in-memory copy of the signed-in account's items, **indexed by type**, gives fast
  synchronous queries. It writes through to a `StorageAdapter`.
- **Changes show at once, then save** (`persist`): the store updates what's on screen, then
  awaits the adapter. If the save fails, the change is undone on screen, `app.error` tells the
  user, and the error is rethrown. (Saving goes over the network, so waiting first would make
  every click feel slow.)
- **User actions** (`create`, `update`, `remove`, `restore`) announce `item.*` events, which
  modules react to.
- **Quiet writes** (`putQuietly`, `replaceAll`) don't announce events. They're used for data
  upgrades and backup restores, so modules never react twice.

### Storage: accounts in Supabase (`core/account/`, `supabase/`)

Cronos keeps **nothing on the device**. Every account's data lives in Supabase, in one
table (`items`, one row per item per account, protected by row-level security).

- **`main.tsx`** starts with an `AccountService`. Nobody signed in: the sign-in screen
  (`shell/AuthScreen.tsx`). Signed in: load the account's items through `SupabaseAdapter`
  into `createCore()`, then render the app. Signing in, signing out, deleting the account, or
  another tab doing so reloads the page; a session that can't be renewed does too (back to
  the sign-in screen).
- **`SupabaseClient`** (`account/supabase.ts`) talks plain HTTP to Supabase Auth and the REST
  API: `loadItems()` (paged, rows not marked deleted), `saveItems()` (upsert by
  `user_id,id`), `deleteItems()` (marks rows deleted; the app never hard-deletes),
  `replaceItems()` (backup restore), plus the account calls. It renews the session shortly
  before it expires, and once more after a 401 (shared across tabs with a Web Lock).
- **`SupabaseAdapter`** (`account/adapter.ts`) is the store's `StorageAdapter`.
  `MemoryAdapter` is for tests.
- The `items` table's `seq` column and newest-change-wins trigger come from an earlier
  version that synced device copies; they're harmless and nothing relies on them now.
- **`clearOldLocalData()`** (`core/legacy.ts`) removes the IndexedDB databases earlier
  versions used (`cronos`, `cronos-sync`, `cronos-account-*`). The Pokédex cache
  (`cronos-dex`, public PokéAPI data) stays.
- **The Supabase project is fixed at build time** (`.env.local`: `VITE_SUPABASE_URL` +
  `VITE_SUPABASE_PUBLISHABLE_KEY`/`_ANON_KEY`, or the `NEXT_PUBLIC_…` equivalents, which
  `vite.config.ts` passes through with `envPrefix`). There's no way to switch databases from
  the app; a build without settings shows "Cronos isn't available", and any project an older
  version saved on the device (`cronos.cloud.config`) is ignored and removed.
- Not done: live updates from other devices (changes appear on reload), and working offline.

### Accounts (`account/service.ts`, `shell/Account.tsx`, `shell/authLink.ts`)

- `AccountService` (`useAccount()`, `useAccountInfo()` from `AccountContext`, provided by
  `main.tsx` so the sign-in screen can use it before any data loads): `signUp(email,
  password, name)`, `signIn`, `requestPasswordReset`, `updateName`, `changeEmail`,
  `changePassword`, `deleteAccount`, `signOut`.
- **Deleting an account** calls `rpc/delete_my_account` (migration
  `20261111000000_account.sql`): a security-definer function that removes `auth.uid()`'s rows
  and sign-in, and nothing else (refused when signed out). Tested on PostgreSQL 16 with
  Supabase's roles stubbed: a user deletes only themselves; `anon` can't call it. A 404 from
  the API (script not run) shows "Deleting accounts isn't set up yet".
- The name lives in the Supabase user's metadata (`user_metadata.name`) and shows in the
  Today greeting and the avatar's initials.
- **Email links** (confirm sign-up, reset password, confirm a new email) return with the
  session in the URL fragment. `takeAuthLink()` reads and strips it before the router sees it;
  `completeAuthLink()` signs in. A recovery link sets `cronos.cloud.newPassword` so the
  Account page asks for a new password after the reload.
- The sidebar's account button and the phone's More panel lead to the Account page; Settings
  shows a summary.

### Events (`core/bus.ts`)

- **Core events:** `item.*`, `day.started`, `app.ready`, `app.error`, `app.notify`,
  `xp.award` / `xp.revoke`, `points.award` / `points.revoke`.
- **Module events:** modules add their own with TypeScript declaration merging
  (`budget.overspent`, `game.xpGained`, `game.xpRevoked`, `game.levelUp`, `pokemon.levelUp`).
- **Notifications:** modules never draw their own pop-ups. They emit `app.notify` and the shell
  shows one stack (celebrations marked `big` stay up longest).
- A handler that throws is logged and can't break other handlers.

### The module contract (`core/registry.ts`)

| Field | Purpose |
|---|---|
| `id`, `name`, `icon`, `description` | Identity; shown in the sidebar and Settings |
| `itemTypes` | Item types this module owns |
| `page` | Full page at `#/m/<id>` (appears in the sidebar) |
| `widgets` | What it shows on the Today page. `slot`: `"stat"` (a number tile in the top row; render `<StatTile>` from `ui`), `"main"` (wide column: things to do) or `"side"` (narrow column: things to glance at). `link` puts an "All tasks →"-style link in the card header |
| `settings` | The module's section on the Settings page |
| `overlay` | Always-on UI (e.g. XP toasts) |
| `init(ctx)` | Subscribe to events; return a cleanup |
| `upgradeItem(item)` | Bring older stored items up to date (startup and after restore) |
| `required` | Can't be switched off |

### Time (`core/date.ts`, `core/scheduler.ts`, `useToday()`)

- The scheduler emits `day.started` once per calendar day: at launch, past midnight (checked
  every minute) and when the tab becomes visible.
- **Components must use `useToday()`, never `todayKey()`.** `todayKey()` is for non-UI code,
  such as stamping the date on an award at the moment it happens.

### Data safety

- **Backups:** Settings → Your data → *Export backup* writes a versioned JSON file
  (`format: 1`) with every item plus the app's saved preferences (`cronos.*` keys).
- **Restore:** *Restore from backup…* validates the file and explains exactly what will
  happen. It **downloads a copy of the current data first**, replaces everything, then
  reloads.
- Data lives in the account in Supabase, so it survives clearing the browser or changing
  devices; a backup file is an extra copy you control.

---

## 3. Conventions for adding features

1. **New feature → new module folder.** Export an `AppModule` and add it to
   `src/modules/index.ts`.
2. **New kind of record → new item type.** Put feature fields in `data`. Prefix types if a
   name could collide (`budget-limit`, not `limit`).
3. **Changing an existing item's fields?** Add an `upgradeItem` to the owning module that
   converts the old shape. It must be safe to run more than once. Never write a one-off
   script.
4. **Reacting to another feature → listen to an event.** Never import the other module.
5. **Awarding XP or Gacha Points → emit `xp.award` / `points.award`** with a key unique to the
   achievement, and the matching `…revoke` to undo it. To react to XP that was *actually*
   recorded (not just requested), listen to `game.xpGained` / `game.xpRevoked`, which carry the
   key and arrive in order.
6. **Dates in components → `useToday()`.** Store dates as local day keys and money as cents.
7. **Reusable UI → `src/ui`.** Feature-specific UI stays in the module.
8. **CSS:** each module keeps its own stylesheet. Prefix class names with the module or
   component (`txn-`, `cal-`, `daily-`, `pie-`, `row-menu-`). Use the color tokens in
   `styles.css` (`--surface`, `--text`, `--accent`, …) so dark mode works automatically.
9. **Write a test** for any non-trivial logic: a `*.test.ts` next to the code, run by
   `npm test`. Use `makeStore()` from `src/test/helpers.ts` for an in-memory store.

---


### Look and feel

- **Type:** Bricolage Grotesque (`--font-display`) for page titles, card titles and big numbers;
  Instrument Sans (`--font`) for everything else. Both are bundled in `src/assets/fonts`
  (Latin subset, WOFF, SIL Open Font License), so they load offline and on phones.
- **Color:** cool paper in light mode, midnight in dark mode. `--accent` (periwinkle) is for
  actions, selection and progress. `--gold` / `--gold-soft` belong to the game layer only: XP,
  Gacha Points, levels and rewards. Don't use gold for ordinary UI, or accent for rewards.
- **Shape:** cards `--radius` (16px), the Today sky `--radius-lg` (22px), controls
  `--radius-sm` (10px), pills fully round. Cards have a border and, in light mode only, a
  hairline shadow (`--shadow-card`); `--shadow-pop` is for things floating above the page.
- **Card titles** are sentence case in the display face (no uppercase eyebrow labels).
- **Icons:** line icons in `shell/icons.tsx` (`<Icon id />`, 24px grid, 1.7 stroke, current
  color), keyed by module id. A module without one falls back to its text `icon`.
- **The Today header** (`shell/DaySky.tsx`) is the one bold moment: a sky band whose colors
  follow the hour (dawn 5–8, day 8–16, dusk 16–19, night) with the sun (6:00–18:00) or moon on
  an arc. Its trail drawing in on load is the only automatic animation on the page (off with
  reduced motion). The stat tiles sit in one joined bar overlapping its bottom edge.
- **Phones:** the bottom bar shows Today plus the first `PHONE_SLOTS` (3) pages in the saved
  order, and "More" opens a panel with the rest and Settings.

### UI controls

- Inputs, selects, textareas and buttons get their look from one place: the "Controls"
  section at the end of `src/styles.css`. Use plain elements plus `btn-primary`, `btn-ghost`,
  `btn-danger-solid`, `link-btn` or `segmented`; don't restyle borders, focus or hover per module.
- Dropdowns use `<Select>` from `ui` (ui/Select.tsx), never a native `<select>`: the system list
  can't be styled (square corners, a white border in dark mode). `<Select>` matches the other
  fields when closed and opens a themed, rounded list; options can carry a color dot, a hint and
  a divider. It works like a native one from the keyboard (↑/↓, Home/End, Enter, Esc, type a
  letter to jump), keeps focus on its button (so it works inside dialogs), and opens upward when
  there's no room below. Dropdown-style buttons use `<span className="chevron" />`.
- Dates use `<DatePicker>` from `ui` (ui/DatePicker.tsx), never `<input type="date">`: the
  browser's calendar can't be themed. Closed it looks like a `<Select>` with a calendar icon and a
  friendly date ("Today", "Mon, Nov 16"); open it's a themed month grid (Sunday first, today
  ringed, the chosen day in `--accent`) with Today and, if `clearable`, Clear. `value` is a day key
  or `""`; `min`/`max` grey out days, months and years. Click the month title for a grid of months,
  and the year there for a page of 12 years. Moving the mouse only highlights: the page shown
  changes only with the ‹ › arrows, the title or the keyboard. Like `<Select>` it keeps focus on
  its button (works in dialogs) and opens upward when there's no room. Keys: ←/→ day, ↑/↓ week,
  Home/End, PgUp/PgDn month (Shift: year), M months, Y years, T today, Enter pick, Delete clear,
  Esc back a level / close. The date math is in `ui/calendarGrid.ts` (tested).
- Checklists on the Today page (Dailies, Today's tasks): a checked row leaves the list at once
  and the next one moves up into its place, so you can tick a list off by clicking one spot.
  Spread `useDoubleClickGuard()` from `ui` on the list (it ignores a second check within 250 ms,
  so a double-click can't also tick the row that slid up), and put finished rows in
  `<CompletedGroup count id>`: the folded "✓ N completed" line whose tick pops on each check.
- Sizes and colors come from tokens: `--control-h` (38px) / `--control-h-sm` (34px),
  `--radius-sm`, `--border-strong` (hover), `--ring` (focus), `--shadow-pop`.
- Focus is an accent border plus a soft ring inside the control's box, so nothing pokes out of
  its container. Keyboard focus on everything else is a 2px accent outline.
- In a CSS grid, give columns `minmax(0, 1fr)` rather than the default `auto` when they hold
  form rows, so wide content can't push the page sideways on a phone.
- A check run during development: every page at phone and desktop widths, light and
  dark, has no sideways scroll, no native-styled dropdowns, and no control that turns white on
  hover in dark mode.

## 4. Layer-by-layer notes

**Core:**

- Small, typed and dependency-free apart from React hooks.
- The store's public API is stable.
- `update()` replaces `data` wholesale. Callers spread the old data (`{ ...item.data, x }`).
  That's intentional (explicit), but easy to forget, so watch for it in reviews.

**Shell:**

- Navigation is the most complex shell component (drag-to-reorder with mouse, touch and
  keyboard, animated). It's self-contained, and its saved order lives in `navOrder.ts`.
- Settings is composed from module `settings` slots plus the shell's own sections.

**Modules:**

- **Tasks:** simple and solid.
- **Calendar:** repeat expansion is well tested (month ends, leap days, daylight saving).
  Editing a single occurrence isn't supported yet.
- **Budget:** the largest module (cents, monthly limits, pie, colors, edit/undo).
  `components.tsx` (~420 lines) is the biggest file. Split it when it next grows.
- **Dailies:** completions are stored per day on the item, so streaks need no extra records.
  XP flows only through events.
- **Level & XP:**
  - The ledger is append-only. Awards are idempotent by key and serialized through a queue,
    so fast check-and-uncheck can't race.
  - The "highest level reached" value lives in a browser preference and is included in
    backups.
- **Progress:** reads other modules' data by type only.
- **Summon:** five machines (`machines.ts`: cost, Legendary/Mythical odds, shiny odds) and their
  looks (`MACHINE_THEMES` in `GachaMachine.tsx`). A pull rolls the tier, then a Pokémon from that
  pool (`src/pokemon/rarity.ts`, a bundled list of Legendary/Mythical dex numbers), then shiny.
  Points are spent before the show and refunded if PokéAPI can't be reached. Each summon writes
  a log entry *and* an owned `pokemon`. The module runs the wallet. Development builds accept
  `window.cronosNextSummon = [{ dex, shiny, tier }]` to force results in tests.
- **Budget:** `rewards.ts` turns income into Gacha Points (half the amount, 1 GP per dollar), keyed
  by transaction and amount so edits adjust and deletes take back. Incomes recorded before this
  existed don't pay out.
- **Team and Pokémon levels:** `src/pokemon/team.ts` (six slots; team members always stay in the
  field) and `levels.ts` (the games' EXP curves; training gives 10 EXP per XP, `EXP_PER_XP`). `modules/field/training.ts`
  gives every team member the XP the player actually earned, keyed like the player's award, so
  duplicates, un-checks and quick check-uncheck sequences stay in step.
- **Field:** see **§4a**.

### 4b. The Pokédex data layer (`src/pokemon/dex/`)

The foundation for stats, moves and (later) battles. Pure, tested files plus a cached API client:

| File | What it holds |
|---|---|
| `types.ts` | The app's own shapes: `SpeciesData` (base stats, EV yield, abilities, growth rate, gender rate, catch rate, height/weight, Pokédex text, evolution chain id, learnset), `MoveData`, `Stats`, `StatId` |
| `growth.ts` | The six EXP curves, exactly as in the games (checked against PokéAPI's tables): `expAtLevel`, `levelFromExp` |
| `stats.ts` | Natures (in PID order) and the stat formula: `calcStat`, `calcStats` (checked against Bulbapedia's worked example) |
| `individual.ts` | PID, IVs, EVs; `natureOf`, `genderOf`, `abilityOf` derived from the PID as in Gen III+ |
| `moves.ts` | Default moveset (last four level-up moves), moves learned between levels, upcoming moves |
| `typechart.ts` | Type effectiveness (Gen VI+): `effectiveness(attackType, defenderTypes)`, `weaknesses` |
| `parse.ts` | PokéAPI JSON → the shapes above. Learnset from the newest game that has one |
| `api.ts` + `cache.ts` | `getSpecies(dex)`, `getMove(slug)`: IndexedDB cache (database `cronos-dex`, not in backups, 30-day refresh, `CACHE_VERSION` to invalidate), one request per thing at a time, `peekSpecies`/`peekMove` for synchronous use |
| `hooks.ts` | `useSpecies(dex)`, `useMoves(slugs)` |

`src/pokemon/summary/PokemonSummary.tsx` puts it together (level/EXP, stats with nature, ability,
gender, moves, type matchups); `src/ui/Modal.tsx` is the shared dialog it opens in.

**Adding battles later:** a battler is an owned Pokémon + `getSpecies` + `individualOf` →
`calcStats` at its level, its moves from `defaultMoveset` (or a saved moveset), damage from
`MoveData` and `effectiveness`. EXP from battles goes in `pokemon-xp` entries (with `exp`), EVs
into the Pokémon's `evs`.

### 4c. The battle system (`src/pokemon/battle/`)

Pure TypeScript: no React, no network, no store. A battle is plain JSON (`BattleState`), and
every step is a function from a state to a new state plus the events that happened:

```ts
let s = createBattle({ id, kind: "wild", player, foe, seed });
({ state: s, events } = resolveTurn(s, { kind: "move", index: 0 }));   // or switch / run
if (s.needsSwitch) ({ state: s, events } = sendIn(s, 2));
```

- **Deterministic.** Randomness comes from a seeded RNG whose state lives in the battle, so
  the same start and choices replay identically (tests, replays, a future server or
  multiplayer). Inputs are never mutated.
- **Events drive the UI.** Each event has `text` for the log plus data for drawing (damage
  with remaining HP, effectiveness and crits; status; stat stages; switches; faints; end).
  The screen plays them one by one; nothing in the engine knows about timing.
- **Mechanics** (`mechanics.ts`), main-series Gen V+: the damage formula (critical ×1.5,
  85–100% random, STAB, type chart, burn), stat stages, accuracy/evasion, critical-hit stages,
  turn order (switches, then priority, then Speed with paralysis halving it; ties random),
  multi-hit, drain/recoil, healing, fixed-damage and one-hit-KO moves, Struggle, escaping.
- **Statuses:** burn, paralysis, poison, bad poison, sleep (1–3 turns), freeze (20% thaw),
  confusion (2–5 turns, hits itself 1/3), flinch; type immunities.
- **Move effects come from PokéAPI's move `meta`** (parsed into `MoveData.meta`: ailment and
  chance, flinch, crit stages, drain, healing, hit counts, stat changes and chance). The dex
  cache version went to 2 so moves cached before this refetch.
- **AI** (`ai.ts`): wild Pokémon pick a random usable move (as in the games); trainers score
  moves by damage (KOs first) or usefulness and usually take the best.
- **Rewards** (`rewards.ts`): each opponent that faints gives ⌊base EXP × level / 7⌋ (×1.5 for
  trainers) and its EV yield to every player Pokémon that fought it and is still standing; EVs
  respect 252/510.
- **Loading** (`load.ts`, the only async part): your Pokémon at their current level (real EXP),
  IVs, EVs and nature with their latest four level-up moves; wild Pokémon near the team's
  average level.
- **Not yet:** abilities, held items, weather/terrain, two-turn and other special moves (they
  act as plain damage, or "nothing happens"), doubles, catching, persistent HP between battles,
  learning new moves on level-up by choice. Each slots into `useMove()` / `BattleState`.

The Field's **Wild battle** button (`modules/field/battle/`) is the first user of it: it draws
the battle, plays the events, and saves rewards as `pokemon-xp` entries keyed
`battle:<battle id>` (so they count once and sync) plus EVs on each Pokémon, with the same
level-up toasts as training.

### 4a. The Field engine (`modules/field/engine/`)

A small 2D game engine, kept separate from React so it can grow into the rest of the game.
Plain TypeScript; only `renderer`, `art`, `sprites`, `loop`, `input` and `index` touch the DOM.

| File | Job | Extend it by… |
|---|---|---|
| `tilemap.ts` | Tile grid (`Tile` kinds), walkability per `Movement` (walk / swim / fly), connected-area cache, `generateField(seed)` | New tile kinds; new generators (beach, cave, town) or loading a hand-made map. Anything returning a `TileMap` works |
| `pathfinding.ts` | A* (8-way, no corner cutting) and path smoothing | Weighted tiles (e.g. tall grass costs more) |
| `creature.ts` | One Pokémon's state: position, `Activity`, emote, personality (stable per id) | New `Activity` kinds (eat, play, train, follow) |
| `world.ts` | The simulation: roster sync, behaviors (idle, wander, sleep, greet, react, commanded walk), separation, picking. Tunables in `BEHAVIOR` | New behaviors in `decide()` / `think()`; items or objects in the world |
| `camera.ts` | Pan, zoom around a point, glide, never shows past the map | Follow mode |
| `renderer.ts` + `art.ts` | Draws terrain (baked once), depth-sorted props and Pokémon, water, tall-grass tufts, emotes, labels, day/night | New art, weather, effects |
| `sprites.ts` | Loads and trims sprites (pixel sprite → artwork → placeholder) | Animated sprites (PokéAPI has Gen V animated GIFs) |
| `loop.ts` | Fixed 60 Hz simulation, render per frame, pauses when hidden or off screen | |
| `input.ts` | Drag to pan, pinch / Ctrl + scroll to zoom, tap, keys | |
| `index.ts` | `FieldEngine`: puts it all together; the only thing React talks to | New player actions (methods) |

Rules of thumb:

- The **simulation is deterministic** given a random source, so behavior is unit-tested by
  stepping `World.update(1/60)` (see `engine.test.ts`).
- The **world never writes to the store.** It's a view of `pokemon` items. Lasting changes
  (nickname, field/storage) go through the store; positions are kept in memory for the
  session only. If positions should survive reloads later, save `world.snapshot()`
  occasionally, not every frame.
- Performance with a full field (24): about 0.5 ms to draw and 0.04 ms to simulate a frame.
  The capacity (`FIELD_CAPACITY`) is a design choice, not a limit.

**Accessibility:** keyboard paths exist for drag-reorder, menus, color pickers and dialogs.
Notices use `role="alert"` and `role="status"`. Animations respect "reduce motion". Colors
come from a palette validated for color-blindness, with text labels alongside.

**Performance:** fine for personal use at tens of thousands of items. Everything loads into
memory at startup (simple and fast), and queries use the type index.

---

## 5. Recommendations (not done yet)

These are in rough priority order. None block current use.

1. **Installable app (PWA).** A web manifest and a service worker (`vite-plugin-pwa`) would
   make Cronos installable on a phone's home screen. Data lives in Supabase, so it needs a
   connection; working offline would need a local copy again.
2. **Lint + CI.** Add ESLint (`typescript-eslint`, `eslint-plugin-react-hooks`) and a GitHub
   Action that runs `npm run typecheck && npm test && npm run build` on every push.
3. **Browser tests in the repo.** The Playwright suites used during development (drag,
   menus, backup, two tabs, midnight) could live in `e2e/`. They need
   `npx playwright install` once per machine.
4. **Preferences in the store.** Sidebar order, switched-off modules and best level live in
   `localStorage`. Backups already include them, but moving them into a `preference` item
   type would also sync them across tabs and, later, devices.
5. **Sync follow-ups.** Preferences (sidebar order, switched-off modules) still live in
   `localStorage` per device; moving them into items would sync them too. Supabase Realtime
   could replace the 30-second check. The budget-settings item should get a fixed id so two
   devices that each create one before syncing don't end up with two.
6. **Consistency between modules:**
   - Use the shared ⋯ menu (edit/delete with Undo) for tasks, events and dailies too.
   - Add `useToday()`-style hooks for "this month" when month-based screens are left open
     across months.
7. **Split large files** when they next change: `budget/components.tsx` (form / list / meter
   / limits) and `shell/Nav.tsx` (drag logic into a hook).
8. **Settings for hard-coded values:** currency (`budget/model.ts`), XP per difficulty and
   week start day are code constants today.
9. **Phone "More" panel order:** pages can only be reordered from the sidebar (or in the bar
   for the visible ones). Dragging inside the More panel would let phones choose the bar.
10. **Field next steps:** walking animations (PokéAPI's animated sprites), Pokémon reacting to
    your dailies (e.g. a happy dance when you finish one), feeding/playing activities, more
    maps, and a friendship value stored on each `pokemon` item.

---

## 6. Verification

- `npm run typecheck`: clean with strict TypeScript.
- `npm test`: 187 unit and integration tests (core store, backups, upgrades, dates, calendar
  repeats, budget math and colors, dailies and XP, levels, summons, owned Pokémon, and the
  field engine: map generation, pathfinding, behaviors, camera, day and night; the wallet,
  machines and odds, team rules, Pokémon levels and team training; income → points; EXP
  curves, stats, natures, gender, abilities, movesets, type matchups and PokéAPI parsing; accounts
  (sign up/in/out, separate data per account, reset-password flag) and the Supabase client
  (auth, paged loading, saving, deleting, restoring, session renewal) against a mocked server; the battle
  engine, including the damage formula against Bulbapedia's worked example).
- The database migration was run on PostgreSQL 16 with Supabase's roles stubbed: newest-wins,
  tombstones, seq ordering under concurrent writers, and row-level security between accounts.
- Browser suites run during development, all passing:
  - Tasks, Calendar, Budget
  - Dailies and XP
  - Sidebar drag (mouse, touch, keyboard)
  - Compact Dailies card
  - Pie chart
  - Transaction menu and edit/undo
  - Category colors
  - Backup/restore
  - Save-failure notice
  - Midnight rollover
  - Budget search and filters (desktop, phone, dark mode)
  - App-wide controls check (every page, 4 screen/theme combinations)
  - Today layout: even gaps and no holes between cards, equal-height tiles, at 4 widths
  - Jobs: add, save for later, status changes, GP awards and take-backs, follow-ups, Today card, phone
  - Wild battles: start, moves, switching panel, HP changes, win with EXP and EVs saved, battle again, run, phone
  - Accounts only, against a fake Supabase: opens to the sign-in screen with nothing on the device (old local databases removed), create account (starts empty), changes saved straight to the account, daily checks instant, a failed save undone and explained, another device sees exactly the account's data, wrong password, sign out back to the sign-in screen with no data left, forgot password → reset link → new password, a second person's separate account, delete account, phone
