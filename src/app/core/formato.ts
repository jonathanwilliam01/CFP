import { Pipe, PipeTransform, signal } from '@angular/core';
import { nomeMes, rotuloDia } from './datas';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const moeda = (v: number | null | undefined) => brl.format(v ?? 0);

/** Aceita "12,50", "1.234,56" ou "12.5" */
export function parseValor(s: string | number | null | undefined): number {
  if (typeof s === 'number') return s;
  if (!s) return 0;
  let t = s.replace(/[^\d,.-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export const soma = <T>(l: T[], f: (x: T) => number) => l.reduce((a, x) => a + f(x), 0);

/** Baixa CSV com `;` e BOM (abre certo no Excel); campos já escapados com `csvTexto` quando texto */
export function baixarCsv(nome: string, cabecalho: string, linhas: string[]) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + [cabecalho, ...linhas].join('\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const csvTexto = (v: string) => `"${v.replace(/"/g, '""')}"`;
export const csvValor = (v: number) => v.toFixed(2).replace('.', ',');
export const csvData = (d: string) => d.split('-').reverse().join('/');

export const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

/** Valores escondidos na tela (R$ •••), escolha do aparelho */
export const privado = signal(globalThis.localStorage?.getItem('cfp.privado') === '1');

export function alternarPrivado() {
  privado.update((v) => !v);
  localStorage.setItem('cfp.privado', privado() ? '1' : '0');
}

// impuro: troca na hora quando esconde/mostra os valores
@Pipe({ name: 'brl', pure: false })
export class BrlPipe implements PipeTransform {
  transform(v: number | null | undefined) {
    return privado() ? 'R$ •••' : moeda(v);
  }
}

@Pipe({ name: 'mes' })
export class MesPipe implements PipeTransform {
  transform(v: string, curto = false) {
    return nomeMes(v, curto);
  }
}

@Pipe({ name: 'dia' })
export class DiaPipe implements PipeTransform {
  transform(v: string) {
    return rotuloDia(v);
  }
}
