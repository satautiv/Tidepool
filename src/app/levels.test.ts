import { describe, expect, it } from 'vitest';
import { buildCatalogue, loadLevels } from './levels';

const level = (area: string, index: number, extra: Record<string, unknown> = {}) => ({
  id: `${area}-${String(index).padStart(3, '0')}`,
  area,
  index,
  moves: 20,
  goals: [{ type: 'score', count: 500 }],
  stars: [3, 6],
  board: new Array(8).fill('........'),
  ...extra,
});

describe('level catalogue', () => {
  it('bundles every level file in src/levels, valid, with no code changes', () => {
    const { levels, errors } = loadLevels();
    expect(errors).toEqual([]);
    expect(levels.map((l) => l.id)).toContain('shallows-001');
  });

  it('orders by area (reef map order) and index; a new file just appears', () => {
    const { levels } = buildCatalogue({
      'coral-garden/021.json': level('coral-garden', 21),
      'shallows/002.json': level('shallows', 2),
      'shallows/001.json': level('shallows', 1),
      'new-area/001.json': level('new-area', 1),
    });
    expect(levels.map((l) => l.id)).toEqual([
      'shallows-001',
      'shallows-002',
      'coral-garden-021',
      'new-area-001',
    ]);
  });

  it('leaves out invalid files and duplicate ids, reporting why', () => {
    const { levels, errors } = buildCatalogue({
      'a.json': level('shallows', 1),
      'b.json': level('shallows', 1),
      'c.json': level('shallows', 2, { moves: 0 }),
    });
    expect(levels).toHaveLength(1);
    expect(errors.map((e) => e.file)).toEqual(['b.json', 'c.json']);
    expect(errors[0]!.errors[0]!.message).toMatch(/also used by a.json/);
  });
});
