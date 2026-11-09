// Confirms that a normal production build contains no test or debug hooks.
// Run after `npm run build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = ['__SORT_SHIFT_E2E__', '__SORT_SHIFT_DEBUG__', 'installE2EBridge', 'VITE_E2E', 'startFrameSampling', 'simulateTime'];

const EXPECTED_ART_FILES = 16;

function filesIn(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

const scripts = filesIn('dist').filter((file) => /\.(js|html)$/.test(file));
if (scripts.length === 0) {
  console.error('No build output found in dist/. Run `npm run build` first.');
  process.exit(1);
}

let failed = false;
for (const file of scripts) {
  const content = readFileSync(file, 'utf8');
  for (const term of FORBIDDEN) {
    if (content.includes(term)) {
      console.error(`FOUND "${term}" in ${file}`);
      failed = true;
    }
  }
}
const chunks = scripts.filter((file) => file.endsWith('.js'));
console.log(`Checked ${scripts.length} files (${chunks.length} script chunks) for ${FORBIDDEN.length} forbidden terms.`);

const art = filesIn(join('dist', 'assets', 'images', 'blender')).filter((file) => file.endsWith('.webp'));
const artBytes = art.reduce((sum, file) => sum + statSync(file).size, 0);
console.log(`Art pack in build: ${art.length} WebP files, ${(artBytes / 1024).toFixed(1)} KB.`);
if (art.length !== EXPECTED_ART_FILES) {
  console.error(`Expected ${EXPECTED_ART_FILES} art files in the build.`);
  failed = true;
}
if (failed) process.exit(1);
console.log('Production build is clean.');
