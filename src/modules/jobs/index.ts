import { moduleHref, type AppModule } from "../../core";
import { JobsPage } from "./JobsPage";
import { JobsSettings } from "./JobsSettings";
import { JobsWidget } from "./JobsWidget";
import { JOB } from "./model";
import { JOB_SETTINGS } from "./settings";
import { watchApplications } from "./rewards";

export const jobsModule: AppModule = {
  id: "jobs",
  name: "Jobs",
  icon: "✉",
  description: "Track job applications: where each stands and when to follow up. Each application you send earns 10 Gacha Points.",
  itemTypes: [JOB, JOB_SETTINGS],
  page: JobsPage,
  settings: JobsSettings,
  widgets: [
    { id: "job-search", title: "Job search", component: JobsWidget, order: 18, slot: "side", link: { label: "All applications", href: moduleHref("jobs") } },
  ],
  init({ bus }) {
    return watchApplications(bus);
  },
};
