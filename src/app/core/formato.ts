import { Pipe, PipeTransform } from '@angular/core';
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

export const pct = (v: number, total: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

@Pipe({ name: 'brl' })
export class BrlPipe implements PipeTransform {
  transform(v: number | null | undefined) {
    return moeda(v);
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
