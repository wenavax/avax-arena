/**
 * Bundle the canonical TS engine (lib/cardgame/engine.ts) to a plain ESM module
 * the Node multiplayer server can import: ../server/cardgame-engine.mjs.
 *
 * The multiplayer server runs the live authoritative loop; the Next.js settle
 * route re-derives the result from the SAME engine.ts source. Bundling from one
 * source (rather than hand-maintaining a JS mirror) is what keeps the live loop
 * and the on-chain settlement bit-identical. Run the parity check after building.
 *
 *   node scripts/build-cardgame-engine.mjs
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const entry = resolve(here, '../lib/cardgame/engine.ts');
const out = resolve(here, '../../server/cardgame-engine.mjs');

await build({
  entryPoints: [entry],
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  banner: { js: '// AUTO-GENERATED from frontend/lib/cardgame/engine.ts — do not edit. Run scripts/build-cardgame-engine.mjs.' },
});
console.log('✓ built', out);
