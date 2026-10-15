import type { AppModule } from "../../core";
import { DailiesPage } from "./DailiesPage";
import { DailiesWidget } from "./DailiesWidget";
import { watchCompletions } from "./logic";
import { DAILY } from "./model";

export const dailiesModule: AppModule = {
  id: "dailies",
  name: "Dailies",
  icon: "↻",
  description: "Recurring daily routines that earn XP when completed.",
  itemTypes: [DAILY],
  page: DailiesPage,
  widgets: [{ id: "dailies-today", title: "Dailies", component: DailiesWidget, order: 8 }],
  init({ bus, store }) {
    return watchCompletions(bus, store);
  },
};
