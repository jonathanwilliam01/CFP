// Hash do código da Edge Function push. `gravar`: escreve versao.ts antes do deploy; `checar`: compara com o push publicado (só avisa).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const raiz = new URL('../supabase/functions/', import.meta.url);

function hash(fn) {
  const h = createHash('sha256');
  for (const f of readdirSync(new URL(fn + '/', raiz)).filter((f) => f !== 'versao.ts').sort()) h.update(f).update(readFileSync(new URL(`${fn}/${f}`, raiz)));
  return h.digest('hex').slice(0, 12);
}

const modo = process.argv[2];
if (modo === 'gravar') {
  writeFileSync(new URL('push/versao.ts', raiz), `// Gerado por scripts/versao-fn.mjs no fn:deploy. Não editar.\nexport const VERSAO = '${hash('push')}';\n`);
}

if (modo === 'checar') {
  if (existsSync('.env'))
    for (const linha of readFileSync('.env', 'utf8').split('\n')) {
      const m = linha.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  const url = process.env.SUPABASE_URL;
  if (!url || process.env.CHECAR_BANCO === '0') process.exit(0);
  try {
    const r = await fetch(`${url}/functions/v1/push`, { signal: AbortSignal.timeout(8000) });
    const { versao } = await r.json().catch(() => ({}));
    if (versao === hash('push')) console.log('✔ versao-fn: função push publicada é a do código');
    else console.warn(`⚠ versao-fn: a função push publicada (${versao ?? 'sem versão'}) não é a do código (${hash('push')}). Rode "npm run fn:deploy".`);
  } catch (e) {
    console.warn('⚠ versao-fn: sem acesso à função push, pulando:', e.message);
  }
}
