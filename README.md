<<<<<<< HEAD
# Cronos
=======
# Cronos

A modular daily planner. A small core, with every feature added as a plug-in module.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173). Data is saved in your
browser (IndexedDB), so it survives reloads and works offline.

Other commands: `npm run typecheck`, `npm run build` (production build in `dist/`).

## How it's organized

```
src/
  core/            the stable foundation, rarely changes
    types.ts       Item: the one shared data shape for everything
    bus.ts         EventBus: modules announce and react to events
    store.ts       ItemStore: create/update/query items, emits events
    storage.ts     StorageAdapter: IndexedDB now, swap in cloud sync later
    registry.ts    AppModule contract + ModuleRegistry (enable/disable)
    scheduler.ts   emits "day.started" once per day
    hooks.ts       React hooks: useItems, useModules, useBusEvent, useCore
    app.ts         createCore(): boots everything in the right order
    links.ts       moduleHref(): link to any module's page
  modules/         features, one folder each
    tasks/         to-dos with dates and priorities
    calendar/      month view, events (timed/all-day/repeating), shows dated tasks
    budget/        income & expenses, monthly limits per category
    dailies/       recurring daily routines, streaks, earn XP when completed
    game/          Level & XP: XP ledger, levels, level-up toasts
    progress/      done-today count + overall streak
    index.ts       the list of installed modules
  shell/           app frame: navigation, Today dashboard, Settings
    Nav.tsx        sidebar / phone tab bar: drag (or Alt+arrows) to reorder, Today pinned first
    navOrder.ts    the saved sidebar order (per browser)
```

### The rules

1. **Everything is an `Item`.** Tasks, habits, events, notes and challenges all share one
   shape. Feature-specific fields go in `item.data`.
2. **Modules talk through events, not to each other.** The store emits `item.created`,
   `item.completed` and so on. The scheduler emits `day.started`. A module reacts to these
   in its `init()`.
3. **Modules import only from `src/core`** (via `../../core`), never from other modules
   or the shell. To show another module's data, query it by item type: the calendar shows
   tasks with `useItems({ type: "task" })` without importing anything from Tasks.
4. **Each module keeps its own CSS** next to its components (e.g. `calendar/calendar.css`).
   Shared pieces (buttons, form fields, cards) live in `src/styles.css`.

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
     widgets: [{ id: "habits-today", title: "Habits", component: HabitsPage, order: 20 }],
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
light/dark steps, or a custom color). Choices are saved in a `budget-settings` item. Each transaction has a "⋯" menu to edit it inline or delete it
(with a few seconds to Undo; `store.restore()` puts the exact item back).

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

Modules can also add an `overlay` (always-on UI over every page); the game uses it for the
"+25 XP" and level-up toasts. A module's `settings` component appears as its own section on the
Settings page while the module is on (Budget uses it for category colors).

## Debugging

In the browser console, `window.cronos` exposes the core:

```js
cronos.store.query({ type: "task" })
cronos.store.create({ type: "task", title: "From the console" })
```

## Roadmap

1. ✅ Core + Tasks + Today dashboard
2. ✅ Calendar and Budget modules
   - Calendar ideas: week view, editing one occurrence of a repeating event, reminders
   - Budget ideas: recurring bills, CSV import from your bank, month-over-month trend chart
3. ✅ Dailies + game layer foundation (XP, levels, toasts)
   - Next game ideas: XP for regular tasks, streak bonuses, daily challenges,
     achievements/badges, rewards you unlock at certain levels
4. Customization: ✅ reorder the sidebar. Next: reorder dashboard widgets, custom tags/views
5. Optional cloud sync: a new `StorageAdapter` (e.g. Supabase)
>>>>>>> main
