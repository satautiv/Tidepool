/**
 * The Voyage level catalogue (T4.01): every JSON file under src/levels is bundled through
 * `import.meta.glob`, validated, and ordered by area and index. Adding a level is adding a
 * file; no code changes.
 */
import { isLevel, parseLevel, type Level, type ValidationError } from '../core/level';

/** Area order on the reef map (PLAN §14.5); unknown areas come after, alphabetically. */
export const AREA_ORDER = ['shallows', 'coral-garden', 'kelp-forest', 'sunken-ship'];

export interface LevelCatalogue {
  readonly levels: readonly Level[];
  /** Problems per file (bad JSON never reaches the game: those levels are left out). */
  readonly errors: readonly { file: string; errors: readonly ValidationError[] }[];
}

/** Builds the catalogue from `{ path: json }` (the glob result, or a test double). */
export function buildCatalogue(files: Record<string, unknown>): LevelCatalogue {
  const levels: Level[] = [];
  const errors: { file: string; errors: ValidationError[] }[] = [];
  const ids = new Map<string, string>();
  for (const [file, json] of Object.entries(files)) {
    const result = parseLevel(json);
    if (!isLevel(result)) {
      errors.push({ file, errors: result });
      continue;
    }
    const clash = ids.get(result.id);
    if (clash) {
      errors.push({
        file,
        errors: [{ path: 'id', message: `id "${result.id}" is also used by ${clash}` }],
      });
      continue;
    }
    ids.set(result.id, file);
    levels.push(result);
  }
  const areaRank = (area: string) => {
    const i = AREA_ORDER.indexOf(area);
    return i >= 0 ? i : AREA_ORDER.length;
  };
  levels.sort(
    (a, b) =>
      areaRank(a.area) - areaRank(b.area) || a.area.localeCompare(b.area) || a.index - b.index,
  );
  return { levels, errors };
}

/** Every level file in src/levels. */
export function loadLevels(): LevelCatalogue {
  const files = import.meta.glob(['../levels/**/*.json', '!../levels/level.schema.json'], {
    eager: true,
    import: 'default',
  });
  return buildCatalogue(files);
}
