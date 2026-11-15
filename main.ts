// Harbor Line hands itself in from here (Node 22, standard library only).
//
// The game is this directory's game/ folder: plain static files the browser loads as ES modules,
// with three.js 0.187.0 reached through the import map in game/index.html. This program's whole
// job is to put the entry where the grader reads it:
//
//   /output/game/          the game, copied whole
//   /output/screenshots/   the maker's renders, the first by name being the cover
//   /output/dossier.json   the text and images the judge reads, written by the kit's own library
//
// Outside the grader's container MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Run it twice and both runs must write the same bytes, so nothing here reads a clock, a path
// outside the repository, or the environment beyond where the output goes.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotDir = join(here, 'screenshots');

mkdirSync(output, { recursive: true });

// The game, every file of it, byte for byte as it is committed.
cpSync(gameDir, join(output, 'game'), { recursive: true });

// The renders, if this checkout carries them; an entry without screenshots fails the gate's own
// screenshots row, so the copy is the entry's, never a placeholder made here.
if (existsSync(shotDir)) {
  cpSync(shotDir, join(output, 'screenshots'), { recursive: true });
}

// One dossier for one game. The caps are the scorer's own (reference/gate.json): the text cap is
// what shapes the bytes and the rest exist so this program refuses what the scorer refuses - more
// than four screenshots or one over 256 KiB, more than 993 files under game/ or 48 MiB of them.
const dossier = buildDossier(output, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});

writeFileSync(join(output, 'dossier.json'), dossier);
