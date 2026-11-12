import { describe, expect, it } from "vitest";
import { Camera } from "./camera";
import { darknessAt, timeOfDayLabel } from "./daylight";
import { movementFor, type CreatureSpec } from "./creature";
import { dist, seededRng } from "./math";
import { clearLine, findPath, toWaypoints } from "./pathfinding";
import { TILE, Tile, TileMap, generateField, mapToText } from "./tilemap";
import { World } from "./world";

const SEED = 7;
const spec = (id: string, types = ["normal"]): CreatureSpec => ({ id, dex: 25, name: id, types, shiny: false, rarity: "common" });

/** Build a map from text: . grass  ~ water  T tree  o rock  " tall grass */
function mapFrom(text: string): TileMap {
  const lines = text.trim().split("\n").map((l) => l.trim());
  const codes: Record<string, number> = { ".": Tile.Grass, "~": Tile.Water, T: Tile.Tree, o: Tile.Rock, '"': Tile.TallGrass };
  const tiles = new Uint8Array(lines.length * lines[0].length);
  lines.forEach((l, r) => [...l].forEach((ch, c) => (tiles[r * l.length + c] = codes[ch])));
  return new TileMap(lines[0].length, lines.length, tiles, [], { col: 1, row: 1 });
}

describe("field generation", () => {
  it("is the same every time for a seed", () => {
    expect(mapToText(generateField(SEED))).toBe(mapToText(generateField(SEED)));
    expect(mapToText(generateField(SEED))).not.toBe(mapToText(generateField(SEED + 1)));
  });

  it("is ringed by trees and has a pond, a path and open land", () => {
    for (const seed of [1, 2, 3, 42, 2026]) {
      const map = generateField(seed);
      for (let c = 0; c < map.cols; c++) expect([map.get(c, 0), map.get(c, map.rows - 1)]).toEqual([Tile.Tree, Tile.Tree]);
      for (let r = 0; r < map.rows; r++) expect([map.get(0, r), map.get(map.cols - 1, r)]).toEqual([Tile.Tree, Tile.Tree]);
      const counts = new Map<number, number>();
      map.tiles.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
      expect(counts.get(Tile.Water) ?? 0).toBeGreaterThan(10);
      expect(counts.get(Tile.Path) ?? 0).toBeGreaterThan(20);
      // most of the land is one connected area Pokémon can roam
      expect(map.reachable("walk").length).toBeGreaterThan(map.cols * map.rows * 0.45);
    }
  });

  it("swimmers and flyers can reach the water, walkers can't", () => {
    const map = generateField(SEED);
    const water = (list: number[]) => list.filter((i) => map.tiles[i] === Tile.Water).length;
    expect(water(map.reachable("walk"))).toBe(0);
    expect(water(map.reachable("swim"))).toBeGreaterThan(0);
    expect(water(map.reachable("fly"))).toBeGreaterThan(0);
  });

  it("has a prop for every tree and rock", () => {
    const map = generateField(SEED);
    const blocked = [...map.tiles].filter((t) => t === Tile.Tree || t === Tile.Rock).length;
    expect(map.props.length).toBe(blocked);
  });
});

describe("pathfinding", () => {
  const map = mapFrom(`
    TTTTTTTT
    T......T
    T.TTTT.T
    T.~~~~.T
    T......T
    TTTTTTTT`);

  it("goes around obstacles", () => {
    const path = findPath(map, { col: 1, row: 1 }, { col: 6, row: 4 }, "walk")!;
    expect(path[0]).toEqual({ col: 1, row: 1 });
    expect(path[path.length - 1]).toEqual({ col: 6, row: 4 });
    for (const c of path) expect(map.passable(c.col, c.row, "walk")).toBe(true);
  });

  it("never cuts a blocked corner", () => {
    const path = findPath(map, { col: 1, row: 1 }, { col: 1, row: 4 }, "walk")!;
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1], path[i]];
      if (a.col !== b.col && a.row !== b.row) {
        expect(map.passable(b.col, a.row, "walk") && map.passable(a.col, b.row, "walk")).toBe(true);
      }
    }
  });

  it("swimmers cross water, walkers can't stand in it", () => {
    expect(findPath(map, { col: 1, row: 1 }, { col: 3, row: 3 }, "walk")).toBeNull();
    expect(findPath(map, { col: 1, row: 1 }, { col: 3, row: 3 }, "swim")).not.toBeNull();
  });

  it("smooths straight runs into few waypoints", () => {
    const open = mapFrom(`
      TTTTTTTTTT
      T........T
      T........T
      TTTTTTTTTT`);
    const cells = findPath(open, { col: 1, row: 1 }, { col: 8, row: 2 }, "walk")!;
    const pts = toWaypoints(open, open.center({ col: 1, row: 1 }), cells, "walk");
    expect(pts.length).toBe(1);
    expect(clearLine(map, map.center({ col: 1, row: 1 }), map.center({ col: 6, row: 4 }), "walk")).toBe(false);
  });
});

describe("world", () => {
  it("adds, updates and removes Pokémon to match the roster", () => {
    const world = new World(generateField(SEED), seededRng(1));
    world.sync([spec("a"), spec("b")]);
    expect([...world.creatures.keys()]).toEqual(["a", "b"]);
    world.sync([{ ...spec("a"), name: "Sparky" }, spec("c")], { animate: true });
    expect([...world.creatures.keys()].sort()).toEqual(["a", "c"]);
    expect(world.creatures.get("a")!.spec.name).toBe("Sparky");
    expect(world.creatures.get("c")!.activity.kind).toBe("arrive");
  });

  it("keeps everyone on tiles they can stand on, for a long time", () => {
    const map = generateField(SEED);
    const world = new World(map, seededRng(2));
    world.sync([spec("walker"), spec("swimmer", ["water"]), spec("flyer", ["normal", "flying"]), ...Array.from({ length: 12 }, (_, i) => spec(`p${i}`))]);
    const visitedWater = new Set<string>();
    for (let i = 0; i < 60 * 240; i++) {
      world.update(1 / 60);
      for (const c of world.creatures.values()) {
        expect(map.passableAt(c.pos, c.movement)).toBe(true);
        if (map.kindAt(c.pos) === Tile.Water) visitedWater.add(c.id);
      }
    }
    expect(visitedWater.has("walker")).toBe(false);
    expect(visitedWater.has("swimmer")).toBe(true);
  });

  it("they actually roam", () => {
    const world = new World(generateField(SEED), seededRng(3));
    world.sync(Array.from({ length: 6 }, (_, i) => spec(`p${i}`)));
    const start = new Map([...world.creatures.values()].map((c) => [c.id, { ...c.pos }]));
    for (let i = 0; i < 60 * 60; i++) world.update(1 / 60);
    const moved = [...world.creatures.values()].filter((c) => dist(c.pos, start.get(c.id)!) > TILE).length;
    expect(moved).toBeGreaterThanOrEqual(4);
  });

  it("goes where it's sent, stopping at the shore if it can't swim", () => {
    const map = generateField(SEED);
    const world = new World(map, seededRng(4));
    world.sync([spec("a")]);
    const land = map.center(map.cellOf(map.reachable("walk")[map.reachable("walk").length - 1]));
    const dest = world.command("a", land)!;
    expect(dest).toEqual(land);
    for (let i = 0; i < 60 * 40 && world.creatures.get("a")!.activity.kind === "walk"; i++) world.update(1 / 60);
    expect(dist(world.creatures.get("a")!.pos, land)).toBeLessThan(TILE);

    const waterIdx = map.reachable("swim").find((i) => map.tiles[i] === Tile.Water)!;
    const waterPoint = map.center(map.cellOf(waterIdx));
    const shore = world.command("a", waterPoint);
    expect(shore === null || map.kindAt(shore) !== Tile.Water).toBe(true);
  });

  it("tapping makes it react; the snapshot restores positions", () => {
    const world = new World(generateField(SEED), seededRng(5));
    world.sync([spec("a"), spec("b")]);
    world.poke("a");
    expect(world.creatures.get("a")!.activity.kind).toBe("react");
    expect(world.creatures.get("a")!.emote?.kind).toBe("heart");
    const snap = world.snapshot();
    const again = new World(world.map, seededRng(6));
    again.sync([spec("a"), spec("b")], { restore: snap });
    expect(again.creatures.get("b")!.pos).toEqual({ x: snap.b.x, y: snap.b.y });
  });

  it("picks the Pokémon under a point", () => {
    const world = new World(generateField(SEED), seededRng(8));
    world.sync([spec("a")]);
    const a = world.creatures.get("a")!;
    const size = () => ({ w: 30, h: 30 });
    expect(world.pick({ x: a.pos.x, y: a.pos.y - 10 }, size)?.id).toBe("a");
    expect(world.pick({ x: a.pos.x + 80, y: a.pos.y }, size)).toBeNull();
  });

  it("movement comes from type", () => {
    expect([movementFor(["water", "flying"]), movementFor(["water"]), movementFor(["fire"])]).toEqual(["fly", "swim", "walk"]);
  });
});

describe("camera", () => {
  it("screen and world conversions are inverse", () => {
    const cam = new Camera(1024, 640);
    cam.resize(800, 500, true);
    const p = { x: 123, y: 456 };
    const back = cam.screenToWorld(cam.worldToScreen(p));
    expect([Math.round(back.x), Math.round(back.y)]).toEqual([123, 456]);
  });

  it("zooms around the cursor and never shows past the map", () => {
    const cam = new Camera(1024, 640);
    cam.resize(800, 500, true);
    const screen = { x: 300, y: 200 };
    const before = cam.screenToWorld(screen);
    cam.zoomAt(screen, 1.5);
    const after = cam.screenToWorld(screen);
    expect(Math.abs(before.x - after.x) + Math.abs(before.y - after.y)).toBeLessThan(0.001);
    cam.zoomAt(screen, 0.01);
    expect(cam.zoom).toBe(cam.minZoom);
    cam.panBy(-99999, -99999);
    const v = cam.view;
    expect(v.left + v.width).toBeLessThanOrEqual(1024 + 1e-6);
    expect(v.top + v.height).toBeLessThanOrEqual(640 + 1e-6);
  });

  it("glides to a point and stops at the edge", () => {
    const cam = new Camera(1024, 640);
    cam.resize(400, 300, true);
    cam.glideTo({ x: 5000, y: 5000 });
    for (let i = 0; i < 300 && cam.gliding; i++) cam.update(1 / 60);
    expect(cam.gliding).toBe(false);
    expect(Math.round(cam.view.left + cam.view.width)).toBe(1024);
  });
});

describe("day and night", () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m);
  it("is dark at night, light by day, and fades between", () => {
    expect([darknessAt(at(12)), darknessAt(at(23)), darknessAt(at(3))]).toEqual([0, 1, 1]);
    expect(darknessAt(at(19, 15))).toBe(0.5);
    expect(darknessAt(at(6))).toBe(0.5);
    expect([timeOfDayLabel(0, at(12)), timeOfDayLabel(0.5, at(19)), timeOfDayLabel(0.5, at(6)), timeOfDayLabel(1, at(23))]).toEqual(["Day", "Dusk", "Dawn", "Night"]);
  });
});
