import { describe, expect, it } from 'vitest';
import { Cofrinho, CofrinhoMov } from './models';
import { rendimentosPendentes, taxaAno, taxaMensal } from './rendimento';

const cof = (x: Partial<Cofrinho> = {}): Cofrinho => ({ id: 'c', nome: 'Reserva', meta: 0, prazo: null, icone: '', cor: '', rende: 'fixo', rende_pct: 12, rende_desde: '2026-08-01', ...x });
const mov = (data: string, valor: number, x: Partial<CofrinhoMov> = {}): CofrinhoMov => ({ id: data + valor, cofrinho_id: 'c', valor, data, descricao: null, ...x });

describe('rendimento', () => {
  it('taxa do mês: fixa composta e % do CDI', () => {
    expect(taxaAno(taxaMensal({ rende: 'fixo', rende_pct: 12 }, null))).toBeCloseTo(12, 6);
    expect(taxaAno(taxaMensal({ rende: 'cdi', rende_pct: 100 }, 14))).toBeCloseTo(14, 6);
    expect(taxaMensal({ rende: 'cdi', rende_pct: 100 }, null)).toBe(0);
    expect(taxaMensal({ rende: null, rende_pct: 100 }, 14)).toBe(0);
  });

  it('meses fechados desde rende_desde, compostos e proporcionais ao dia do depósito', () => {
    const l = rendimentosPendentes(cof(), [mov('2026-07-10', 1000), mov('2026-09-16', 300)], 0.01, '2026-10-20');
    expect(l.map((r) => r.rendimento_mes)).toEqual(['2026-08-01', '2026-09-01']);
    expect(l[0]).toMatchObject({ valor: 10, data: '2026-08-31', descricao: 'Rendimento de agosto 2026' });
    // setembro: (1000 + 10) + 300 × 15/30
    expect(l[1].valor).toBeCloseTo(11.6, 2);
  });

  it('continua do último lançado e não repete', () => {
    const movs = [mov('2026-07-10', 1000), mov('2026-08-31', 10, { rendimento_mes: '2026-08-01' })];
    const l = rendimentosPendentes(cof(), movs, 0.01, '2026-10-01');
    expect(l.map((r) => r.rendimento_mes)).toEqual(['2026-09-01']);
    expect(l[0].valor).toBeCloseTo(10.1, 2);
    expect(rendimentosPendentes(cof(), movs, 0.01, '2026-09-05')).toEqual([]);
  });

  it('sem taxa, sem início ou saldo zerado não lança', () => {
    expect(rendimentosPendentes(cof(), [mov('2026-07-10', 1000)], 0, '2026-10-01')).toEqual([]);
    expect(rendimentosPendentes(cof({ rende_desde: null }), [mov('2026-07-10', 1000)], 0.01, '2026-10-01')).toEqual([]);
    expect(rendimentosPendentes(cof(), [mov('2026-07-10', 100), mov('2026-07-20', -100)], 0.01, '2026-10-01')).toEqual([]);
  });
});
