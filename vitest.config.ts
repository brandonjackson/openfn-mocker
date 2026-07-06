import { defineConfig } from 'vitest/config';

export default defineConfig({
  // pnpm installs the `openfn-api-specs` git dependency under a virtual store
  // dir whose name contains a `#<commit>` fragment; Vite's resolver treats the
  // `#` as a URL fragment and truncates the path, so it can't find the module.
  // Keeping symlinks unresolved means Vite uses the `#`-free
  // node_modules/openfn-api-specs symlink path instead of its realpath.
  resolve: { preserveSymlinks: true },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
