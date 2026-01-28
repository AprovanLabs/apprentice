import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/cli.ts',
    'src/indexer-daemon.ts',
    'src/log-command.ts',
    'src/mcp-server.ts',
  ],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  dts: true,
  splitting: false,
  sourcemap: true,
  shims: true,
  external: ['typescript', 'sharp', 'keytar', 'esbuild'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
