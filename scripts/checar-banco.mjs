// Antes do build: confere no Supabase se as migrations que o código usa já foram aplicadas.
// Falta alguma → o build para (o deploy não sobe código que quebra sem a tabela/coluna). Pular: CHECAR_BANCO=0.
import { existsSync, readFileSync } from 'node:fs';

if (existsSync('.env')) {
  for (const linha of readFileSync('.env', 'utf8').split('\n')) {
    const m = linha.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// migration → tabela.coluna (ou check:restrição:texto) que só existe depois dela (src/app/core/marcas-banco.json)
const MARCAS = JSON.parse(readFileSync(new URL('../src/app/core/marcas-banco.json', import.meta.url), 'utf8'));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (process.env.CHECAR_BANCO === '0') process.exit(0);
if (!url || !key) {
  console.warn('⚠ checar-banco: sem SUPABASE_URL/SUPABASE_ANON_KEY, pulando');
  process.exit(0);
}

const itens = Object.values(MARCAS).flat();
let faltam;
try {
  const r = await fetch(`${url}/rest/v1/rpc/colunas_faltando`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_itens: itens }),
  });
  const corpo = await r.json().catch(() => ({}));
  // a própria função vem na 037
  if (!r.ok && corpo.code === 'PGRST202') faltam = MARCAS['037'];
  else if (!r.ok) throw new Error(`${r.status} ${corpo.code ?? ''} ${corpo.message ?? ''}`);
  else faltam = corpo;
} catch (e) {
  console.warn('⚠ checar-banco: sem acesso ao Supabase, pulando:', e.message);
  process.exit(0);
}

const migs = Object.entries(MARCAS).filter(([, l]) => l.some((m) => faltam.includes(m))).map(([k]) => k);
if (migs.length) {
  console.error(`✘ Migrations não aplicadas no Supabase: ${migs.join(', ')}`);
  for (const f of faltam) console.error('   falta ' + f);
  console.error('  Rode "npm run db:push" antes do deploy (ou CHECAR_BANCO=0 para ignorar).');
  process.exit(1);
}
console.log('✔ checar-banco: migrations do código aplicadas');
