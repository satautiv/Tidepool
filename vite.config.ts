import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { SDK_SCRIPTS } from './src/config/sdk';
import { targetConfig } from './src/config/targets';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/** The short commit SHA of this build, shown in Settings. */
function buildSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

/** Injects the portal SDK `<script>` for targets that have one (docs/PLAN.md §20). */
function portalSdk(mode: string): Plugin {
  const target = targetConfig(loadEnv(mode, process.cwd(), 'VITE_').VITE_TARGET);
  return {
    name: 'tidepool-portal-sdk',
    transformIndexHtml: () =>
      SDK_SCRIPTS[target.id]
        ? [{ tag: 'script', attrs: { src: SDK_SCRIPTS[target.id]! }, injectTo: 'head-prepend' }]
        : [],
  };
}

export default defineConfig(({ mode }) => ({
  // Relative asset paths: builds work from any sub-path or portal iframe.
  base: './',
  plugins: [portalSdk(mode)],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(buildSha()),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/testing.ts', 'src/main.ts'],
    },
  },
}));
