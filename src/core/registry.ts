import type { ComponentType } from "react";
import type { EventBus } from "./bus";
import type { ItemStore } from "./store";

/** What a module receives when it starts up. */
export interface ModuleContext {
  bus: EventBus;
  store: ItemStore;
}

export interface ModuleWidget {
  id: string;
  title: string;
  component: ComponentType;
  /** Lower numbers appear first on the dashboard. Default 100. */
  order?: number;
}

/**
 * The contract every feature fills in. The shell builds navigation, the
 * dashboard and settings from whatever modules are registered and enabled.
 */
export interface AppModule {
  /** Stable, unique id, e.g. "tasks". Used in URLs and settings. */
  id: string;
  name: string;
  /** A single emoji or short symbol shown in navigation. */
  icon?: string;
  description?: string;
  /** Item types this module owns. Documentation for now; useful for exports and cleanup later. */
  itemTypes?: string[];
  /** Full page, reachable from the sidebar at #/m/<id>. */
  page?: ComponentType;
  /** Tiles shown on the Today dashboard. */
  widgets?: ModuleWidget[];
  /** The module's own section on the Settings page (shown while the module is on). */
  settings?: ComponentType;
  /** Always-mounted UI layered over every page, e.g. toasts or celebrations. */
  overlay?: ComponentType;
  /** Core modules can't be switched off in Settings. */
  required?: boolean;
  /**
   * Runs when the module is switched on. Subscribe to events here.
   * Return a cleanup function to undo it when the module is switched off.
   */
  init?(ctx: ModuleContext): void | (() => void);
}

const SETTINGS_KEY = "cronos.disabledModules";

function loadDisabled(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveDisabled(ids: Set<string>) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify([...ids]));
  } catch {
    /* storage unavailable: setting lasts for this session only */
  }
}

export class ModuleRegistry {
  private modules: AppModule[] = [];
  private disabled = loadDisabled();
  private cleanups = new Map<string, () => void>();
  private ctx: ModuleContext | null = null;
  private listeners = new Set<() => void>();
  private snapshot: AppModule[] = [];

  register(mod: AppModule): void {
    if (this.modules.some((m) => m.id === mod.id)) {
      throw new Error(`Module "${mod.id}" is already registered`);
    }
    this.modules.push(mod);
    if (this.ctx && this.isEnabled(mod.id)) this.activate(mod);
    this.changed();
  }

  /** Start all enabled modules. Called once by the app at boot. */
  start(ctx: ModuleContext): void {
    this.ctx = ctx;
    this.modules.filter((m) => this.isEnabled(m.id)).forEach((m) => this.activate(m));
  }

  all(): AppModule[] {
    return [...this.modules];
  }

  /** Enabled modules. Returns the same array until something changes (safe for React). */
  enabled(): AppModule[] {
    return this.snapshot;
  }

  isEnabled(id: string): boolean {
    const mod = this.modules.find((m) => m.id === id);
    return Boolean(mod) && (mod!.required || !this.disabled.has(id));
  }

  setEnabled(id: string, on: boolean): void {
    const mod = this.modules.find((m) => m.id === id);
    if (!mod || mod.required || this.isEnabled(id) === on) return;
    if (on) {
      this.disabled.delete(id);
      this.activate(mod);
    } else {
      this.disabled.add(id);
      this.cleanups.get(id)?.();
      this.cleanups.delete(id);
    }
    saveDisabled(this.disabled);
    this.changed();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private activate(mod: AppModule) {
    if (!this.ctx || this.cleanups.has(mod.id)) return;
    try {
      const cleanup = mod.init?.(this.ctx);
      this.cleanups.set(mod.id, cleanup ?? (() => {}));
    } catch (err) {
      console.error(`[registry] module "${mod.id}" failed to start`, err);
    }
  }

  private changed() {
    this.snapshot = this.modules.filter((m) => this.isEnabled(m.id));
    this.listeners.forEach((fn) => fn());
  }
}
