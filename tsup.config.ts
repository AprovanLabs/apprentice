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
  clean: true,
  dts: true,
  splitting: false,
  sourcemap: true,
  shims: true,
  noExternal: [],
  external: ['typescript'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
