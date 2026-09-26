// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Layer boundaries (docs/PLAN.md §3.2).
 * Each entry forbids importing the listed top-level src/ folders, via the `@/` alias
 * or a relative `../` path. `typesOnly: true` still allows `import type`.
 * @param {...{ layers: string[]; typesOnly?: boolean }} groups
 */
function restrictLayers(...groups) {
  return [
    'error',
    {
      patterns: groups.map(({ layers, typesOnly = false }) => ({
        regex: `^(@/|(\\.\\./)+)(${layers.join('|')})(/|\\.ts$|$)`,
        allowTypeImports: typesOnly,
        message: `Layer boundary: may not import ${typesOnly ? 'runtime code from ' : ''}${layers.join(', ')} (see docs/PLAN.md §3.2).`,
      })),
    },
  ];
}

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'android/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['*.config.{js,ts}', 'tools/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },

  // core/: pure, deterministic game logic. No other layers, no browser APIs, no ambient randomness or time.
  {
    files: ['src/core/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      '@typescript-eslint/no-restricted-imports': restrictLayers({
        layers: ['app', 'render', 'input', 'ui', 'services', 'levels', 'main'],
      }),
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'navigator',
          'localStorage',
          'sessionStorage',
          'performance',
          'requestAnimationFrame',
          'setTimeout',
          'setInterval',
          'fetch',
        ].map((name) => ({ name, message: 'core/ must stay pure: no browser APIs or timers.' })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in core/rng.ts.' },
        { object: 'Date', property: 'now', message: 'Pass time into core/ as a parameter.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Pass time into core/ as a parameter.',
        },
      ],
    },
  },

  // render/, input/, ui/ and services/ may use core/ but not each other; app/ wires them together.
  {
    files: ['src/render/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrictLayers(
        { layers: ['app', 'ui', 'services', 'main'] },
        { layers: ['input'], typesOnly: true }, // drag state types for drawing the dragged piece
      ),
    },
  },
  {
    files: ['src/input/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrictLayers({
        layers: ['app', 'render', 'ui', 'services', 'main'],
      }),
    },
  },
  {
    files: ['src/ui/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrictLayers(
        { layers: ['app', 'render', 'input', 'main'] },
        { layers: ['services'], typesOnly: true }, // services are injected by app/
      ),
    },
  },
  {
    files: ['src/services/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': restrictLayers({
        layers: ['app', 'render', 'input', 'ui', 'main'],
      }),
    },
  },

  prettier,
);
