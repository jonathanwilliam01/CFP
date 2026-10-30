import { signal } from '@angular/core';

/** Valor de campo lembrado entre visitas */
export function lembrado(chave: string, padrao: string) {
  const s = signal(localStorage.getItem(chave) ?? padrao);
  return Object.assign(s, {
    guardar: (v: string) => {
      s.set(v);
      localStorage.setItem(chave, v);
    },
  });
}

// compartilhados entre as calculadoras
export const cdi = lembrado('cfp.cdi', '14,9');
export const pctCdi = lembrado('cfp.pctcdi', '100');
export const ganho = lembrado('cfp.ganho', '');
export const taxas = {
  emprestimo: lembrado('cfp.tx.emprestimo', '5,5'),
  pix: lembrado('cfp.tx.pix', '6,5'),
  cheque: lembrado('cfp.tx.cheque', '8'),
  rotativo: lembrado('cfp.tx.rotativo', '15'),
};

export const pctTxt = (v: number, casas = 2) => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas }) + '%';

export const ESTILO = `
  .campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
  .veredito { display: flex; align-items: center; gap: 14px; background: var(--card-2); color: var(--ink); }
  .veredito.pos { background: var(--primary-soft); }
  .veredito.neg { background: var(--danger-soft); color: var(--ink); }
  .veredito app-icon { color: var(--primary); }
  .veredito.neg app-icon { color: var(--danger); }
  .veredito div { display: flex; flex-direction: column; gap: 2px; }
  .veredito b { font-size: 1.1rem; }
  .tab { display: flex; flex-direction: column; margin-top: 10px; max-height: 320px; overflow-y: auto; }
  .lin { display: grid; grid-template-columns: 56px 1fr 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 0.88rem; }
  .lin span:not(:first-child) { text-align: right; }
  .cab { font-weight: 700; color: var(--ink-3); font-size: 0.78rem; position: sticky; top: 0; background: var(--card); }
  .como summary { display: flex; justify-content: space-between; align-items: center; font-weight: 700; cursor: pointer; list-style: none; }
  .como p { margin-top: 10px; }
  .como[open] summary app-icon { transform: rotate(180deg); }
  .rapido { margin-top: -2px; }
  .rapido .chip { padding: 5px 10px; font-size: 0.8rem; }
`;
