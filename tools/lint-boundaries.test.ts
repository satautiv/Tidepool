import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Guards the layer rules in eslint.config.js (docs/PLAN.md §3.2) against silent regressions.
const eslint = new ESLint();

async function ruleIds(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

describe('layer boundaries', () => {
  describe('core/', () => {
    const file = 'src/core/example.ts';

    it('allows imports within core', async () => {
      expect(await ruleIds(file, "import { a } from './board';\nexport const b = a;\n")).toEqual(
        [],
      );
    });

    it.each([
      "import { a } from '../render/boardView';",
      "import { a } from '@/services/storage/SaveStore';",
      "import { a } from '../ui/dom';",
      "import { a } from '../app/App';",
    ])('forbids other layers: %s', async (imp) => {
      expect(await ruleIds(file, `${imp}\nexport const b = a;\n`)).toContain(
        '@typescript-eslint/no-restricted-imports',
      );
    });

    it('forbids type-only imports from other layers too', async () => {
      const code = "import type { A } from '../render/x';\nexport type B = A;\n";
      expect(await ruleIds(file, code)).toContain('@typescript-eslint/no-restricted-imports');
    });

    it.each([
      ['Math.random()', 'no-restricted-properties'],
      ['Date.now()', 'no-restricted-properties'],
      ['new Date()', 'no-restricted-syntax'],
      ['window.innerWidth', 'no-restricted-globals'],
      ['document.body', 'no-restricted-globals'],
      ['setTimeout(() => 0, 1)', 'no-restricted-globals'],
    ])('forbids %s', async (expr, rule) => {
      expect(await ruleIds(file, `export const x = ${expr};\n`)).toContain(rule);
    });
  });

  describe('render/', () => {
    it('allows type-only imports from input', async () => {
      const code =
        "import type { DragState } from '../input/DragController';\nexport type D = DragState;\n";
      expect(await ruleIds('src/render/dragView.ts', code)).toEqual([]);
    });

    it('forbids runtime imports from input', async () => {
      const code = "import { drag } from '../input/DragController';\nexport const d = drag;\n";
      expect(await ruleIds('src/render/dragView.ts', code)).toContain(
        '@typescript-eslint/no-restricted-imports',
      );
    });

    it('allows core imports', async () => {
      const code = "import { BOARD_SIZE } from '../core/config';\nexport const s = BOARD_SIZE;\n";
      expect(await ruleIds('src/render/boardView.ts', code)).toEqual([]);
    });
  });

  describe('ui/', () => {
    it('allows service types but not implementations', async () => {
      const typeOnly =
        "import type { AdService } from '../../services/ads/AdService';\nexport type A = AdService;\n";
      const runtime =
        "import { NoAdsService } from '../../services/ads/NoAdsService';\nexport const n = NoAdsService;\n";
      expect(await ruleIds('src/ui/screens/GameOver.ts', typeOnly)).toEqual([]);
      expect(await ruleIds('src/ui/screens/GameOver.ts', runtime)).toContain(
        '@typescript-eslint/no-restricted-imports',
      );
    });
  });

  describe('services/', () => {
    it('forbids importing ui', async () => {
      const code = "import { h } from '../../ui/dom';\nexport const x = h;\n";
      expect(await ruleIds('src/services/ads/AdManager.ts', code)).toContain(
        '@typescript-eslint/no-restricted-imports',
      );
    });
  });

  describe('app/', () => {
    it('may import every layer', async () => {
      const code =
        "import { a } from '../render/x';\nimport { b } from '../ui/y';\nimport { c } from '../services/z';\nexport const all = [a, b, c];\n";
      expect(await ruleIds('src/app/App.ts', code)).toEqual([]);
    });
  });
});
