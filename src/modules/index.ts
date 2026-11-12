import type { AppModule } from "../core";
import { budgetModule } from "./budget";
import { calendarModule } from "./calendar";
import { dailiesModule } from "./dailies";
import { fieldModule } from "./field";
import { gameModule } from "./game";
import { jobsModule } from "./jobs";
import { progressModule } from "./progress";
import { summonModule } from "./summon";
import { tasksModule } from "./tasks";

/**
 * The list of installed modules. To add a feature: create a folder under
 * src/modules, export an AppModule from it, and add it here. Nothing else changes.
 * This list sets the default sidebar order; users can drag to reorder (saved per browser).
 */
export const modules: AppModule[] = [tasksModule, dailiesModule, calendarModule, budgetModule, jobsModule, gameModule, summonModule, fieldModule, progressModule];
