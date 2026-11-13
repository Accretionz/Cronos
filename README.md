# Cronos

A modular daily planner. A small core, with every feature added as a plug-in module.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173) and sign in or create an
account. Cronos saves everything in your account in Supabase (nothing is kept on the device),
so you need a Supabase project first, set in `.env.local`: see
[`supabase/README.md`](supabase/README.md). The project is fixed when the app is built; it
can't be changed from inside the app.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Run the unit and integration tests once (`npm run test:watch` to re-run on save) |
| `npm run typecheck` | Check types |
| `npm run build` | Production build in `dist/` |

**How it's built and why, plus the full foundation review: see [ARCHITECTURE.md](ARCHITECTURE.md).**

## How it's organized

```
src/
  core/            the stable foundation, rarely changes
    types.ts       Item: the one shared data shape for everything
    bus.ts         EventBus: modules announce and react to events
    store.ts       ItemStore: create/update/query items, emits events
    storage.ts     StorageAdapter interface (+ memory, for tests)
    account/       accounts and data in Supabase: sign in/up, profile, the data adapter
    registry.ts    AppModule contract + ModuleRegistry (enable/disable)
    scheduler.ts   emits "day.started" once per day
    hooks.ts       React hooks: useItems, useModules, useBusEvent, useCore
    app.ts         createCore(): boots everything in the right order; runs data upgrades
    legacy.ts      removes data older versions kept on the device
    backup.ts      export / restore a versioned JSON backup
    links.ts       moduleHref(): link to any module's page
  modules/         features, one folder each
    tasks/         to-dos with dates and priorities
    calendar/      month view, events (timed/all-day/repeating), shows dated tasks
    budget/        income & expenses, monthly limits per category
    dailies/       recurring daily routines, streaks, earn XP when completed
    game/          Level & XP: XP ledger, levels, level-up toasts
    summon/        Pokémon gacha: summon a random Pokémon (data + sprites from PokéAPI)
    field/         a meadow where your Pokémon roam; engine/ is the 2D game engine
    progress/      done-today count + overall streak
    index.ts       the list of installed modules
  pokemon/         shared Pokémon library: species data, sprites, PokéAPI, owned Pokémon
  assets/fonts/    bundled fonts (Bricolage Grotesque, Instrument Sans; OFL)
  ui/              shared UI components any module can use (e.g. the "⋯" RowMenu)
  test/            test helpers (in-memory store)
  shell/           app frame: navigation, Today dashboard, Settings, notices
    Nav.tsx        sidebar / phone tab bar (+ "More" panel): drag (or Alt+arrows) to reorder
    DaySky.tsx     the Today header: a sky that follows the time of day
    AuthScreen.tsx the sign-in screen (and loading / error screens)
    Account.tsx    sign in / create account forms; Account page: profile, password, email, delete
    authLink.ts    finishes email links (confirm sign-up, reset password, new email)
    icons.tsx      the app's line icons
    navOrder.ts    the sidebar order, saved in your account
```

### The rules

1. **Everything is an `Item`.** Tasks, habits, events, notes and challenges all share one
   shape. Feature-specific fields go in `item.data`.
2. **Modules talk through events, not to each other.** The store emits `item.created`,
   `item.completed` and so on. The scheduler emits `day.started`. A module reacts to these
   in its `init()`.
3. **Modules import only from `src/core` and `src/ui`**, never from other modules
   or the shell. To show another module's data, query it by item type: the calendar shows
   tasks with `useItems({ type: "task" })` without importing anything from Tasks.
4. **Each module keeps its own CSS** next to its components (e.g. `calendar/calendar.css`),
   with prefixed class names. Shared pieces (buttons, form fields, cards) live in `src/styles.css`.
5. **In components, use `useToday()` for today's date**, never `todayKey()`, so screens
   left open overnight roll over at midnight.
6. **Changing what an item stores?** Add an `upgradeItem` to the module so older saved data
   (and old backups) are converted automatically.

## Adding a module

Example: a Habits module.

1. Create `src/modules/habits/index.tsx`:

   ```tsx
   import { useItems, type AppModule } from "../../core";

   function HabitsPage() {
     const habits = useItems({ type: "habit" });
     return <div className="page"><h1>Habits</h1>{/* ... */}</div>;
   }

   export const habitsModule: AppModule = {
     id: "habits",
     name: "Habits",
     icon: "↻",
     description: "Daily routines you want to keep.",
     itemTypes: ["habit"],
     page: HabitsPage,
     // slot: "main" (things to do), "side" (things to glance at) or "stat" (a number tile)
     widgets: [{ id: "habits-today", title: "Habits", component: HabitsWidget, order: 20, slot: "main",
                 link: { label: "All habits", href: moduleHref("habits") } }],
     init({ bus, store }) {
       // e.g. reset each habit's checkbox at the start of every day
       return bus.on("day.started", ({ date }) => { /* ... */ });
     },
   };
   ```

2. Add it to the list in `src/modules/index.ts`.

That's it. It appears in the sidebar, on the dashboard and in Settings.

### Adding your own events

A module can declare new events without editing the core:

```ts
declare module "../../core/bus" {
  interface EventMap {
    "challenge.completed": { challengeId: string; xp: number };
  }
}
```

## Module notes

**Calendar.** Events are `event` items. `scheduledFor` is `"YYYY-MM-DD"` for all-day events
or `"YYYY-MM-DDTHH:MM"` (local time) for timed ones; the end time is in `data.end`.
Repeats are stored in `recurrence` as a standard rule (`RRULE:FREQ=WEEKLY`) and expanded
on screen. Editing or deleting a repeating event changes the whole series.

**Budget.** Transactions are `transaction` items with `data.amountCents` (always positive,
stored in cents to avoid rounding errors), `data.kind` (`expense`/`income`) and
`data.category`. Monthly limits are `budget-limit` items, one per category, applying to
every month. When a new expense pushes a category over its limit, the module emits
`budget.overspent`, ready for a future challenges module to react to. Currency is set in
`budget/model.ts` (`CURRENCY`, default USD). The "Where it went" pie (`budget/SpendingPie.tsx`)
shows each category's share of the month's spending: up to 6 slices (the smallest fold into a
gray "N more categories" slice) and a legend that doubles as the data table.

Each category has one color (`budget/colors.ts`), used for transaction tags, the category list,
the pie and its legend. Defaults come from a color-blind-checked palette; new custom categories
get the first color not already used. Users change colors in Settings → Budget (12 swatches with
light/dark steps, or a custom color). Choices are saved in a `budget-settings` item.
Each transaction has a "⋯" menu to edit it inline or delete it (with a few seconds to Undo;
`store.restore()` puts the exact item back).

**Search and filters** (top of the Transactions card, `budget/TransactionFinder.tsx`, logic in
`budget/search.ts`):

- **Search** matches the description, category or amount, ignoring case and accents ("cafe"
  finds "Café"). Every word must match; use quotes for a phrase (`"whole foods"`). Amounts match
  the way you type them: `12` finds $12.00–$12.99, `12.5` finds $12.50–$12.59. Press `/` to jump
  to the search box and Esc to clear it.
- **Period**: the month on screen, the last 3 months, that year, all time, or custom dates.
- **Type** (all, expenses, income), **Categories** (pick several), **Amount** (presets or a
  min/max), and **Sort** (newest, oldest, largest, smallest; amount order shows the date on
  each row).
- Active filters show as chips you can remove one by one, or all at once with "Clear all".
- While filtering, a summary shows the count, total spent and earned, net, average expense and
  monthly average, spending by category (tap one to filter by it), and spending by month (tap a
  month to see just that month).
- Tapping a category in the Categories card, or a transaction's category tag, filters the list
  to that category.

**Jobs.** Job applications are `job-application` items: `title` is the role; `data` holds
`company`, `status` (`saved` → `applied` → `interviewing` → `offer`, or `rejected` /
`withdrawn`), `appliedOn`, and optional `location`, `url`, `salary`, `source`, `followUpOn`,
`notes`, plus a `history` of every status change (shown as a timeline when editing). Moving past
"saved" stamps the applied day; moving back clears it. **Each application sent earns 10 Gacha
Points** (`jobs/rewards.ts`, key `job:<id>`, so one award per application ever); moving it back to
Saved or deleting it takes them back (unless spent), and Undo restores them. The page shows totals
(applied, last 7 days, interviewing, offers, response rate), filters by status, search, and
follow-up reminders. Notes (line breaks kept, links clickable) and the job posting link show
under each application. **Settings → Jobs** turns this on or off and picks the parts (notes,
posting link, timeline); it's saved as a `jobs-settings` item, so it's part of your account. Long notes show three
lines with "Show more"; with details off, a Notes label opens the application. The Today card logs an application in two fields and lists follow-ups due.

**Dailies.** Recurring routines are `daily` items. The schedule is stored in `recurrence`
(`RRULE:FREQ=DAILY`, or `RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR` for specific days). Each
completion is a date in `data.doneDays`, so streaks and history come straight from the item.
Difficulty sets the XP (`XP_BY_DIFFICULTY` in `dailies/model.ts`: easy 10, medium 25,
hard 50), plus `PERFECT_DAY_XP` (25) when every daily due that day is done.

**Level & XP (the game layer).** Any module can award XP by emitting a core event:

```ts
bus.emit("xp.award", { key: "tasks:<id>", amount: 15, reason: "Finished report", source: "tasks" });
bus.emit("xp.revoke", { key: "tasks:<id>" }); // e.g. when un-checked
```

The `key` must be unique per achievement: the same key never pays twice, and it's what
`xp.revoke` removes. The game module records awards as `xp` ledger items (total XP = sum),
works out the level (level 1→2 costs 100 XP, each level after costs 50 more), and emits
`game.xpGained` and `game.levelUp`. It doesn't import any other module, so it can be switched
off: dailies keep working and simply don't record XP while it's off.

Modules can also add an `overlay` (always-on UI over every page). Pop-up messages ("+25 XP",
level-ups, "+20 GP") go through the core `app.notify` event, which the app shows in one stack. A
module's `settings` component appears as its own section on the Settings page while the module is
on (Budget uses it for category colors).

**Gacha Points.** Dailies also pay Gacha Points (easy 10, medium 20, hard 40, perfect day +30),
the currency for summons, and **half of every income** you record in Budget becomes points (1 GP
per dollar: a $2,500 paycheck pays 1,250 GP; editing or deleting it adjusts that). New players start with a 150 GP welcome gift. Un-checking a daily takes
its points back unless they've already been spent. The balance shows on Today and on Summon.

**Summon (Pokémon gacha).** Pick a machine and spend points to meet a Pokémon from the full
National Pokédex (1–1025):

| Machine | Cost | Legendary | Mythical | Shiny |
|---|---|---|---|---|
| Poké Ball | 50 GP | 1% | 0.3% | 1 in 256 |
| Great Ball | 120 GP | 3% | 1% | 1 in 128 |
| Ultra Ball | 250 GP | 8% | 3% | 1 in 64 |
| Master Ball | 800 GP | 80% | 20% | 1 in 64 (Legendary/Mythical only) |
| Luxury Ball | 500 GP | 1% | 0.3% | Always |

Costs and odds live in `summon/machines.ts`. Names, types and sprites come from
[PokéAPI](https://pokeapi.co) live, so summoning needs an internet connection (if it fails, the
points are refunded). The summon plays out on a capsule machine themed for each ball: the crank
turns, a capsule drops, rolls up, wobbles and bursts open. The capsule hints at what's inside
(Ultra for a Legendary, Master for a Mythical). Tap to skip. Timings are in `TIMING` in
`GachaMachine.tsx`.

**Field.** Every Pokémon you summon becomes one of *your* Pokémon (a `pokemon` item) and joins
the Field, a meadow where they roam: they wander, rest, greet each other, fall asleep at night
(the field follows your local time), swim if they're Water types and fly if they're Flying
types. Tap one to see its card (pet, rename, send to storage), then tap the ground to send it
there. Drag to look around; pinch or Ctrl/⌘ + scroll to zoom. Up to 24 can be out at once; the
rest wait in storage below the field.

**Team and levels.** Choose up to 6 Pokémon for your team (tap one, then "Add to team"). Every
Pokémon starts at Lv. 5 and levels on its species' real EXP curve (Fast, Medium Fast, Medium
Slow, Slow, Erratic or Fluctuating, from PokéAPI). Team members get 10 EXP for every XP you earn
(`EXP_PER_XP` in `src/pokemon/levels.ts`), with toasts when they grow and when they learn a move.
Un-checking a daily takes it back.

**Battles.** "Wild battle" on the Field page sends your team against a wild Pokémon near their
level. Pick a move (type, PP and power shown), switch Pokémon, or run. Damage, critical hits,
type matchups, stat changes and statuses (burn, paralysis, poison, sleep, freeze, confusion)
follow the main-series rules, with move effects from PokéAPI. Winning gives EXP (real formula)
and effort values to the Pokémon that fought; losing costs nothing, and everyone starts the next
battle at full health. The rules are a separate, pure engine in `src/pokemon/battle/` (see
ARCHITECTURE §4c), ready for trainers, catching and more.

**Summary.** "Summary" on a Pokémon's card shows everything the games track: EXP, stats worked out
with the games' formula from base stats, IVs, EVs, nature and level; nature, ability and gender
(decided by its personality value, as in the games); its moves with type, category, power,
accuracy and PP; what it learns next; and its type matchups. Game data comes from PokéAPI and is
cached in the browser, so it loads once. The data layer for this (and for battles later) is in
`src/pokemon/dex/`, described in ARCHITECTURE.md §4b. The engine (map, pathfinding, behaviors, camera,
renderer) is in `modules/field/engine/` and is described in ARCHITECTURE.md §4a.

## Your data

Cronos saves everything in **your account**, in your own free Supabase project. Nothing is
kept on the device: the app opens to a sign-in screen, and once you're in it loads your data
and saves every change straight to your account. Sign in on any device to see the same data.
Each account has its own data; a new account starts empty.

- Changes show at once and save in the background. If a save fails (no connection, server
  problem), the change is undone on screen and an error explains why.
- Changes made on another device show up when you reopen or reload the app.
- **Account** (bottom of the sidebar; on a phone, **More**): your name, email, password,
  sign out, delete account. **Forgot password?** is on the sign-in screen.
- **Settings → Your data**: **Export backup** / **Restore from backup…** (a JSON file).
  Restoring replaces your account's data, and downloads a copy of the current data first.

Setup takes about five minutes: see [`supabase/README.md`](supabase/README.md).

### Deploying (Vercel, Netlify, …)

`.env.local` stays on your computer (it isn't committed), so a hosted build needs the same
two values in the host's settings. They're built into the app, so **redeploy after adding or
changing them**.

1. **Vercel:** Project → **Settings → Environment Variables**: add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` (the `NEXT_PUBLIC_…` names work too) for Production (and
   Preview), then **Deployments → ⋯ → Redeploy**. Vercel detects Vite: build `npm run build`,
   output `dist`.
2. **Supabase → Authentication → URL Configuration:** set **Site URL** to the hosted address
   (e.g. `https://cronos.vercel.app`) and add `https://cronos.vercel.app/**` to **Redirect
   URLs**, keeping `http://localhost:5173/**` for development. Otherwise confirmation and
   password-reset emails link back to localhost.

A build without the values shows "Cronos isn't available: Not connected to a database".

Turning Cronos into a phone app is planned in [`docs/MOBILE.md`](docs/MOBILE.md).

## Debugging

In development (`npm run dev`), `window.cronos` in the browser console exposes the core:

```js
cronos.store.query({ type: "task" })
cronos.store.create({ type: "task", title: "From the console" })
```

## Roadmap

1. ✅ Core + Tasks + Today dashboard
2. ✅ Calendar and Budget modules
   - Calendar ideas: week view, editing one occurrence of a repeating event, reminders
   - Budget: ✅ search and filters. Ideas: recurring bills, CSV import from your bank, saved filters
3. ✅ Dailies + game layer foundation (XP, levels, toasts)
   - Next game ideas: XP for regular tasks, streak bonuses, daily challenges,
     achievements/badges, rewards you unlock at certain levels
4. Customization: ✅ reorder the sidebar. ✅ Today page with number tiles and two columns. Next: reorder or hide Today cards, custom tags/views
5. ✅ Foundation review (see ARCHITECTURE.md): backups, midnight rollover,
   storage fallback, data upgrades, tests
6. Next foundation steps: installable app (PWA), lint + CI, browser tests in the repo
7. ✅ Accounts in Supabase: every account's data lives there. Next: the phone app (docs/MOBILE.md)
