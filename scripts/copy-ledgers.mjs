// Copy each system's conformance ledger (src/systems/<name>/conformance.json)
// next to its compiled plugin in dist/, so the /status page can read them at
// runtime. tsc only emits JSON it sees imported, and these are read from disk.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const src = 'src/systems';
let n = 0;
for (const name of readdirSync(src)) {
  const from = join(src, name, 'conformance.json');
  if (!existsSync(from)) continue;
  mkdirSync(join('dist/systems', name), { recursive: true });
  copyFileSync(from, join('dist/systems', name, 'conformance.json'));
  n++;
}
console.log(`copied ${n} conformance ledger(s) to dist/systems`);
