import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'ui/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['cli/**/*.ts'],
      exclude: ['cli/index.ts', 'cli/vite-plugin.ts'],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
