// Sem Angular: também vai para a Edge Function do WhatsApp (scripts/gerar-texto-fn.mjs)

/** Aceita "12,50", "1.234,56", "3.000" (milhar) ou "12.5" */
export function parseValor(s: string | number | null | undefined): number {
  if (typeof s === 'number') return s;
  if (!s) return 0;
  let t = s.replace(/[^\d,.-]/g, '');
  if (t.includes(',') || /^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
