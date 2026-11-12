import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { FieldEngine, SpriteCache, generateField, type CreatureSpec, type TileMap, type WorldSnapshot } from "./engine";

/** The meadow's layout. Change the seed for a different map (Pokémon positions reset). */
export const FIELD_SEED = 20261021;

// Kept for the whole session, so coming back to the page is instant and looks the same.
const sprites = new SpriteCache();
let map: TileMap | null = null;
let lastSnapshot: WorldSnapshot | undefined;
const getMap = () => (map ??= generateField(FIELD_SEED));

/** What the page can ask the field to do. */
export interface FieldHandle {
  select(id: string | null, focus?: boolean): void;
  pet(id: string): void;
  zoomBy(factor: number): void;
  resetView(): void;
}

interface Props {
  roster: CreatureSpec[];
  onSelect: (id: string | null) => void;
  label: string;
  ref?: Ref<FieldHandle>;
}

/** The canvas. All the game logic lives in ./engine; this only connects it to React. */
export function FieldView({ roster, onSelect, label, ref }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FieldEngine | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const engine = new FieldEngine(canvasRef.current!, {
      map: getMap(),
      sprites,
      restore: lastSnapshot,
      onSelect: (id) => onSelectRef.current(id),
    });
    engineRef.current = engine;
    engine.start();
    // Handy for debugging in the browser console during development: window.cronosField.world
    if (import.meta.env.DEV) (window as unknown as { cronosField?: FieldEngine }).cronosField = engine;
    return () => {
      lastSnapshot = engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setRoster(roster);
  }, [roster]);

  useImperativeHandle(
    ref,
    () => ({
      select: (id, focus = false) => engineRef.current?.select(id, { focus }),
      pet: (id) => engineRef.current?.pet(id),
      zoomBy: (f) => engineRef.current?.zoomBy(f),
      resetView: () => engineRef.current?.resetView(),
    }),
    [],
  );

  return <canvas ref={canvasRef} className="field-canvas" tabIndex={0} aria-label={label} />;
}
