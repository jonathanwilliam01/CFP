import { computed, signal } from '@angular/core';
import { Taxas, taxasBcb } from '../../core/bcb';

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

const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Taxa que segue o Banco Central até o usuário digitar outra; `legado` = padrão antigo gravado sem o usuário mexer */
function doBanco(chave: string, padrao: string, campo: keyof Omit<Taxas, 'data' | 'buscado'>, legado?: string) {
  if (legado && localStorage.getItem(chave) === legado) localStorage.removeItem(chave);
  const manual = signal(localStorage.getItem(chave));
  const valor = computed(() => {
    const t = taxasBcb();
    return manual() ?? (t ? num(t[campo]) : padrao);
  });
  return Object.assign(valor, {
    manual,
    guardar: (v: string) => {
      manual.set(v);
      localStorage.setItem(chave, v);
    },
    voltar: () => {
      manual.set(null);
      localStorage.removeItem(chave);
    },
  });
}

// compartilhados entre as calculadoras
export const cdi = doBanco('cfp.cdi', '14,9', 'cdi', '14,9');
export const pctCdi = lembrado('cfp.pctcdi', '100');
export const poupanca = doBanco('cfp.poupanca', '0,67', 'poupanca');
export const ganho = lembrado('cfp.ganho', '');
export const taxas = {
  emprestimo: doBanco('cfp.tx.emprestimo', '5,5', 'emprestimo'),
  pix: lembrado('cfp.tx.pix', '6,5'),
  cheque: doBanco('cfp.tx.cheque', '8', 'cheque'),
  rotativo: doBanco('cfp.tx.rotativo', '15', 'rotativo'),
};
/** taxas do Banco Central que o usuário trocou à mão */
export const doBancoTrocadas = computed(() => [cdi, poupanca, taxas.emprestimo, taxas.cheque, taxas.rotativo].filter((t) => t.manual() !== null));
export const voltarAoBanco = () => [cdi, poupanca, taxas.emprestimo, taxas.cheque, taxas.rotativo].forEach((t) => t.voltar());

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
