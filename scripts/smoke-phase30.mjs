/** Phase 30: integration — runs phase 26–29 checks in one flow */
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const s of ['smoke-phase26.mjs', 'smoke-phase27.mjs', 'smoke-phase28.mjs', 'smoke-phase29.mjs']) {
  execSync(`node scripts/${s}`, { cwd: root, stdio: 'inherit' });
}
console.log('Phase 30 integration smoke OK');
