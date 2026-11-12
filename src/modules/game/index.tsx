import { moduleHref, type AppModule } from "../../core";
import { StatTile } from "../../ui";
import { useLevel } from "./components";
import { GamePage } from "./GamePage";
import { startLedger } from "./ledger";
import { XP_ENTRY, levelTitle } from "./model";
import "./game.css";

/**
 * The game layer. It doesn't know about dailies or tasks: any module emits
 * "xp.award" / "xp.revoke" and this module turns that into XP and levels.
 */
export const gameModule: AppModule = {
  id: "game",
  name: "Level",
  icon: "✦",
  description: "Earn XP for completing dailies and level up.",
  itemTypes: [XP_ENTRY],
  page: GamePage,
  widgets: [{ id: "level", title: "Level", component: LevelStat, order: 3, slot: "stat" }],
  init({ bus, store }) {
    return startLedger(bus, store);
  },
};

/** Today page tile: level, progress to the next one, XP earned today. */
function LevelStat() {
  const { info, today } = useLevel();
  return (
    <StatTile
      label="Level"
      icon="✦"
      value={info.level}
      unit={levelTitle(info.level)}
      progress={{ value: info.into, max: info.needed, label: `Progress to level ${info.level + 1}` }}
      detail={`${info.into.toLocaleString()} / ${info.needed.toLocaleString()} XP${today > 0 ? ` · +${today.toLocaleString()} today` : ""}`}
      href={moduleHref("game")}
    />
  );
}
