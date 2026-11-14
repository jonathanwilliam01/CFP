// Empacota core/texto.ts (sem Angular) para a Edge Function do WhatsApp usar o mesmo leitor do app.
// Roda no prebuild e no fn:deploy.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const caminho = (p) => fileURLToPath(new URL(p, import.meta.url));

await build({
  entryPoints: [caminho('../src/app/core/texto.ts')],
  outfile: caminho('../supabase/functions/whatsapp/texto.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  banner: { js: '// Gerado por scripts/gerar-texto-fn.mjs a partir de src/app/core/texto.ts. Não editar.' },
  logLevel: 'warning',
});
