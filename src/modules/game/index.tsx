import type { AppModule } from "../../core";
import { LevelCard, XpToasts } from "./components";
import { GamePage } from "./GamePage";
import { startLedger } from "./ledger";
import { XP_ENTRY } from "./model";
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
  widgets: [{ id: "level", title: "Level", component: LevelCardWidget, order: 3 }],
  overlay: XpToasts,
  init({ bus, store }) {
    return startLedger(bus, store);
  },
};

function LevelCardWidget() {
  return <LevelCard compact />;
}
