/**
 * ScreenFrame admin passcode setup.
 * Run: node setup-admin.js
 *
 * Prompts for a 6-character passcode, hashes it with SHA-256,
 * and writes VITE_ADMIN_HASH to .env.local — the raw passcode is
 * never written anywhere. After running, rebuild with: npm run build
 */
import { createHash } from 'crypto';
import { createInterface } from 'readline';
import { writeFileSync, existsSync } from 'fs';

const rl = createInterface({ input: process.stdin, output: process.stdout });

if (existsSync('.env.local')) {
  console.log('⚠  .env.local already exists — running this will overwrite the current hash.\n');
}

rl.question('Enter your 6-character admin passcode: ', (answer) => {
  rl.close();
  const code = answer.trim();

  if (code.length !== 6) {
    console.error('\n✗  Passcode must be exactly 6 characters.');
    process.exit(1);
  }

  const hash = createHash('sha256').update(code, 'utf8').digest('hex');
  writeFileSync('.env.local', `VITE_ADMIN_HASH=${hash}\n`, 'utf8');

  console.log('\n✓  Hash written to .env.local');
  console.log('   Your passcode is NOT stored — only its SHA-256 hash.');
  console.log('   Next step: npm run build  (bakes the hash into the bundle)\n');
  console.log('   To change passcode: run this script again, then rebuild.');
  console.log('   To disable admin access: delete .env.local, then rebuild.\n');
});
