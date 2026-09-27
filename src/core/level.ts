/**
 * Voyage levels as data (README §4.2, docs/PLAN.md §14.1). `parseLevel` validates a level's
 * JSON strictly, with messages meant for level authors; `levelBoard` turns it into a core
 * Board. Hand-written (no schema library), so the bundle stays small; the JSON Schema in
 * src/levels/level.schema.json only documents the format for editors.
 */
import type { Board, Cell } from './board';
import { BOARD_SIZE, COLOR_COUNT } from './config';
import { createRng, RngCursor } from './rng';
import { TILE_KINDS, type TileKind } from './tiles';

export const GOAL_TYPES = ['pearls', 'coral', 'bubbles', 'score'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export interface Goal {
  readonly type: GoalType;
  readonly count: number;
}

export interface GeneratorOverrides {
  readonly families: readonly string[] | null;
  readonly weights: Readonly<Record<string, number>> | null;
}

export interface Level {
  readonly id: string;
  readonly area: string;
  readonly index: number;
  readonly moves: number;
  readonly goals: readonly Goal[];
  /** Moves left needed for 2★ and 3★ (1★ is completing the goals). */
  readonly stars: readonly [twoStar: number, threeStar: number];
  /** 8 rows of 8 legend characters, row 0 at the top. */
  readonly board: readonly string[];
  /** Optional 8×8 grid of `1`–`6` (or `.`) pinning glass colours. */
  readonly colors: readonly string[] | null;
  readonly generator: GeneratorOverrides | null;
  /** The tile this level introduces, if any. */
  readonly tutorial: TileKind | null;
}

export interface ValidationError {
  /** Where: `board[3]`, `goals[0].count`, … */
  readonly path: string;
  readonly message: string;
}

/**
 * Legend (PLAN §14.1): `.` empty, `#` glass (seeded colour), `1`–`6` glass of that colour,
 * `P` glass with a pearl, `C` coral (2 hp), `c` cracked coral (1 hp), `B` bubble over an empty
 * cell, `U` urchin, `F` frozen glass.
 */
export const LEGEND = '.#123456PCcBUF';

/** Characters that count as filled for line completion. */
const FILLED = new Set('#123456PCcUF');

const KEYS = [
  'id',
  'area',
  'index',
  'moves',
  'goals',
  'stars',
  'board',
  'colors',
  'generator',
  'tutorial',
];

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Validates and normalises a level. Returns the level, or every problem found. */
export function parseLevel(json: unknown): Level | ValidationError[] {
  const errors: ValidationError[] = [];
  const fail = (path: string, message: string) => void errors.push({ path, message });
  if (!isObject(json)) return [{ path: '', message: 'a level must be a JSON object' }];

  for (const key of Object.keys(json)) {
    if (!KEYS.includes(key) && key !== '$schema') fail(key, `unknown field "${key}"`);
  }

  const { id, area, index, moves, goals, stars, board, colors, generator, tutorial } = json;

  if (typeof area !== 'string' || !/^[a-z]+(-[a-z]+)*$/.test(area)) {
    fail('area', 'area must be lowercase words joined by "-", e.g. "coral-garden"');
  }
  if (!isInt(index) || index < 1 || index > 999)
    fail('index', 'index must be a whole number 1–999');
  if (typeof id !== 'string' || !/^[a-z]+(-[a-z]+)*-\d{3}$/.test(id)) {
    fail('id', 'id must look like "<area>-NNN", e.g. "shallows-003"');
  } else if (typeof area === 'string' && isInt(index)) {
    const expected = `${area}-${String(index).padStart(3, '0')}`;
    if (id !== expected)
      fail('id', `id "${id}" doesn't match area and index (expected "${expected}")`);
  }
  if (!isInt(moves) || moves < 1 || moves > 200)
    fail('moves', 'moves must be a whole number 1–200');

  // Board: exactly 8×8 known characters.
  const rows: string[] = [];
  if (!Array.isArray(board)) {
    fail('board', 'board must be an array of 8 strings');
  } else {
    if (board.length !== BOARD_SIZE)
      fail('board', `board has ${board.length} rows, needs ${BOARD_SIZE}`);
    board.forEach((row, r) => {
      if (typeof row !== 'string') return fail(`board[${r}]`, `row ${r} must be a string`);
      if (row.length !== BOARD_SIZE) {
        fail(`board[${r}]`, `row ${r} has ${row.length} chars, needs ${BOARD_SIZE}`);
      }
      for (const [c, ch] of [...row].entries()) {
        if (!LEGEND.includes(ch)) {
          fail(
            `board[${r}]`,
            `row ${r}, column ${c}: unknown character "${ch}" (legend: ${LEGEND})`,
          );
        }
      }
      rows.push(row);
    });
  }
  const boardOk = rows.length === BOARD_SIZE && rows.every((r) => r.length === BOARD_SIZE);
  const count = (chars: string) =>
    rows.reduce((n, row) => n + [...row].filter((ch) => chars.includes(ch)).length, 0);

  // Nothing may start already cleared.
  if (boardOk) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      if ([...rows[r]!].every((ch) => FILLED.has(ch)))
        fail(`board[${r}]`, `row ${r} is already full`);
    }
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (rows.every((row) => FILLED.has(row[c]!))) fail('board', `column ${c} is already full`);
    }
  }

  // Goals: known types, positive counts, achievable with the tiles on the board.
  const tilesFor: Record<Exclude<GoalType, 'score'>, [string, string]> = {
    pearls: ['P', 'pearls'],
    coral: ['Cc', 'coral tiles'],
    bubbles: ['B', 'bubbles'],
  };
  if (!Array.isArray(goals) || goals.length === 0) {
    fail('goals', 'goals must be a non-empty array');
  } else {
    const seen = new Set<string>();
    goals.forEach((goal: unknown, i) => {
      const path = `goals[${i}]`;
      if (!isObject(goal))
        return fail(path, 'a goal must be an object like {"type": "pearls", "count": 3}');
      const { type, count: n } = goal;
      if (typeof type !== 'string' || !(GOAL_TYPES as readonly string[]).includes(type)) {
        return fail(
          `${path}.type`,
          `unknown goal type "${String(type)}" (use ${GOAL_TYPES.join(', ')})`,
        );
      }
      if (seen.has(type)) fail(`${path}.type`, `goal "${type}" appears twice`);
      seen.add(type);
      if (!isInt(n) || n < 1) return fail(`${path}.count`, 'count must be a whole number ≥ 1');
      if (type !== 'score' && boardOk) {
        const [chars, label] = tilesFor[type as Exclude<GoalType, 'score'>];
        const have = count(chars);
        if (n > have) fail(`${path}.count`, `goal ${type}=${n} but the board has ${have} ${label}`);
      }
    });
  }

  // Stars: [twoStar, threeStar], ascending, and below the move limit.
  if (!Array.isArray(stars) || stars.length !== 2 || !stars.every(isInt)) {
    fail('stars', 'stars must be [movesLeftFor2Stars, movesLeftFor3Stars]');
  } else {
    const [two, three] = stars as [number, number];
    if (two < 1) fail('stars', 'the 2★ threshold must be at least 1 move left');
    if (three <= two) fail('stars', `stars must be ascending (got [${two}, ${three}])`);
    if (isInt(moves) && three >= moves)
      fail('stars', `the 3★ threshold (${three}) must be below moves (${moves})`);
  }

  // Colours: optional pins on glass cells.
  let colorRows: string[] | null = null;
  if (colors !== undefined && colors !== null) {
    if (!Array.isArray(colors) || colors.length !== BOARD_SIZE) {
      fail('colors', `colors must be null or ${BOARD_SIZE} strings`);
    } else {
      colorRows = [];
      colors.forEach((row: unknown, r) => {
        if (typeof row !== 'string' || row.length !== BOARD_SIZE || !/^[.1-6]+$/.test(row)) {
          return fail(
            `colors[${r}]`,
            `colors row ${r} must be ${BOARD_SIZE} chars of "1"–"6" or "."`,
          );
        }
        colorRows!.push(row);
        if (!boardOk) return;
        for (const [c, ch] of [...row].entries()) {
          const cell = rows[r]![c]!;
          if (ch !== '.' && !'#P'.includes(cell)) {
            fail(
              `colors[${r}]`,
              `row ${r}, column ${c}: a colour pin needs a "#" or "P" cell, not "${cell}"`,
            );
          }
        }
      });
    }
  }

  let overrides: GeneratorOverrides | null = null;
  if (generator !== undefined && generator !== null) {
    if (!isObject(generator)) {
      fail('generator', 'generator must be null or {"families": …, "weights": …}');
    } else {
      const { families, weights } = generator;
      const famOk =
        families === undefined ||
        families === null ||
        (Array.isArray(families) && families.every((f) => typeof f === 'string'));
      if (!famOk) fail('generator.families', 'families must be null or a list of family names');
      const wOk =
        weights === undefined ||
        weights === null ||
        (isObject(weights) && Object.values(weights).every((w) => typeof w === 'number' && w >= 0));
      if (!wOk) fail('generator.weights', 'weights must be null or {"family": weight ≥ 0}');
      overrides = {
        families: famOk && Array.isArray(families) ? (families as string[]) : null,
        weights: wOk && isObject(weights) ? (weights as Record<string, number>) : null,
      };
    }
  }

  if (
    tutorial !== undefined &&
    tutorial !== null &&
    !(TILE_KINDS as readonly unknown[]).includes(tutorial)
  ) {
    fail('tutorial', `tutorial must be null or a tile: ${TILE_KINDS.join(', ')}`);
  }

  if (errors.length) return errors;
  return {
    id: id as string,
    area: area as string,
    index: index as number,
    moves: moves as number,
    goals: (goals as Goal[]).map(({ type, count: n }) => ({ type, count: n })),
    stars: [(stars as number[])[0]!, (stars as number[])[1]!],
    board: rows,
    colors: colorRows,
    generator: overrides,
    tutorial: (tutorial as TileKind | null | undefined) ?? null,
  };
}

/** Narrows a `parseLevel` result. */
export function isLevel(result: Level | ValidationError[]): result is Level {
  return !Array.isArray(result);
}

/**
 * The level's starting board. Glass without a pinned colour gets one seeded from the level
 * id, so a level always looks the same.
 */
export function levelBoard(level: Level): Board {
  const rng = new RngCursor(createRng(`level:${level.id}`));
  const cells: Cell[] = [];
  level.board.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const pin = level.colors?.[r]?.[c];
      const glass = () =>
        pin && pin !== '.'
          ? Number(pin) - 1
          : '123456'.includes(ch)
            ? Number(ch) - 1
            : rng.int(COLOR_COUNT);
      switch (ch) {
        case '.':
          cells.push({ color: null });
          break;
        case 'P':
          cells.push({ color: glass(), tile: { kind: 'pearl' } });
          break;
        case 'C':
          cells.push({ color: null, tile: { kind: 'coral', hp: 2 } });
          break;
        case 'c':
          cells.push({ color: null, tile: { kind: 'coral', hp: 1 } });
          break;
        case 'B':
          cells.push({ color: null, tile: { kind: 'bubble' } });
          break;
        case 'U':
          cells.push({ color: null, tile: { kind: 'urchin' } });
          break;
        case 'F':
          cells.push({ color: glass(), tile: { kind: 'frozen' } });
          break;
        default:
          cells.push({ color: glass() });
      }
    });
  });
  return { cells };
}
