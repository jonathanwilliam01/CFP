import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) {
  for (const linha of readFileSync('.env', 'utf8').split('\n')) {
    const m = linha.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_ANON_KEY ?? '';
if (!url || !key) console.warn('⚠ SUPABASE_URL / SUPABASE_ANON_KEY não definidos');

writeFileSync(
  'src/environments/environment.ts',
  `export const environment = ${JSON.stringify({ supabaseUrl: url, supabaseKey: key }, null, 2)};\n`,
);
