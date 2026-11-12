import { useEffect, useState } from "react";
import { getMove, getSpecies, peekMove, peekSpecies } from "./api";
import type { MoveData, SpeciesData } from "./types";

export interface Loaded<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
}

/** Species data for a Pokédex number, loading it (from cache or PokéAPI) if needed. */
export function useSpecies(dex: number | null | undefined): Loaded<SpeciesData> {
  const [state, setState] = useState<Loaded<SpeciesData>>(() => ({ data: dex ? peekSpecies(dex) : undefined, loading: false, error: null }));
  useEffect(() => {
    if (!dex) return;
    const ready = peekSpecies(dex);
    if (ready) {
      setState({ data: ready, loading: false, error: null });
      return;
    }
    let live = true;
    setState({ data: undefined, loading: true, error: null });
    getSpecies(dex).then(
      (data) => live && setState({ data, loading: false, error: null }),
      (err) => live && setState({ data: undefined, loading: false, error: errorText(err) }),
    );
    return () => {
      live = false;
    };
  }, [dex]);
  return state;
}

/** Details for several moves at once (in the same order). Missing ones are undefined while loading or if they failed. */
export function useMoves(slugs: string[]): { moves: (MoveData | undefined)[]; loading: boolean; error: string | null } {
  const key = slugs.join(",");
  const [state, setState] = useState(() => ({ moves: slugs.map((s) => peekMove(s)), loading: false, error: null as string | null }));
  useEffect(() => {
    const list = key ? key.split(",") : [];
    const now = list.map((s) => peekMove(s));
    if (now.every(Boolean)) {
      setState({ moves: now, loading: false, error: null });
      return;
    }
    let live = true;
    setState({ moves: now, loading: true, error: null });
    Promise.allSettled(list.map(getMove)).then((results) => {
      if (!live) return;
      const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      setState({
        moves: results.map((r) => (r.status === "fulfilled" ? r.value : undefined)),
        loading: false,
        error: failed ? errorText(failed.reason) : null,
      });
    });
    return () => {
      live = false;
    };
  }, [key]);
  return state;
}

function errorText(err: unknown): string {
  return err instanceof TypeError ? "Couldn't reach PokéAPI (offline?)" : err instanceof Error ? err.message : String(err);
}
