import { conciliar, parecido } from './conciliar';
import { fixasNaFatura, mesDoGasto } from './financas';
import { Cartao, Recorrencia } from './models';

const b = (descricao: string, valor: number, data = '2026-11-05', parcela: number | null = null) =>
  ({ data, titulo: descricao, descricao, valor, parcela, parcelas: parcela ? 5 : null });
const g = (id: string, descricao: string, valor: number, data = '2026-11-05', parcela: number | null = null) => ({ id, descricao, valor, data, parcela });

describe('conciliar', () => {
  it('separa o que bate, valor diferente, falta, sobra e conta fixa', () => {
    const r = conciliar(
      [b('Padaria Real', 12.5), b('Uber Trip', 30), b('Netflix.com', 59.9), b('IOF compra exterior', 1.2), b('Loja X', 100, '2026-10-31', 2)],
      [g('1', 'Padaria', 12.5), g('2', 'Uber', 28), g('3', 'Mercado', 50), g('4', 'Loja X', 100, '2026-10-31', 2)],
      [{ id: 'f1', descricao: 'Netflix', valor: 55.9, data: '2026-12-07' }],
    );
    expect(r.ok.map((x) => x.g.id).sort()).toEqual(['1', '4']);
    expect(r.valor.map((x) => x.g.id)).toEqual(['2']);
    expect(r.fixas).toMatchObject([{ f: { id: 'f1' }, diferente: true }]);
    expect(r.faltam.map((x) => x.descricao)).toEqual(['IOF compra exterior']);
    expect(r.sobram.map((x) => x.id)).toEqual(['3']);
  });

  it('valor igual prefere o nome parecido e a mesma parcela', () => {
    const r = conciliar([b('Loja X', 100, '2026-10-31', 3)], [g('a', 'Outra', 100, '2026-11-01'), g('b', 'Loja X', 100, '2026-10-31', 3)], []);
    expect(r.ok[0].g.id).toBe('b');
  });

  it('parcela diferente não casa', () => {
    const r = conciliar([b('Loja X', 100, '2026-10-31', 3)], [g('a', 'Loja X', 100, '2026-10-31', 2)], []);
    expect(r.ok).toHaveLength(0);
  });

  it('parecido ignora números e acentos', () => {
    expect(parecido('Dl*Uber Trip', 'uber')).toBe(true);
    expect(parecido('Farmácia 211', 'farmacia')).toBe(true);
    expect(parecido('Padaria', 'Mercado')).toBe(false);
  });
});

describe('mesDoGasto', () => {
  const nubank = { id: 'n', fechamento_dia: 1, vencimento_dia: 7, fecha_dias: 7 } as Cartao;
  const meio = { id: 'm', fechamento_dia: 15, vencimento_dia: 25, fecha_dias: null } as Cartao;

  it('cartão que fecha no fim do mês: compra do dia do fechamento conta no mês seguinte', () => {
    expect(mesDoGasto({ data: '2026-10-31', forma: 'cartao', cartao_id: 'n', fatura_mes: '2026-12-01' }, [nubank])).toBe('2026-11-01');
    expect(mesDoGasto({ data: '2026-10-30', forma: 'cartao', cartao_id: 'n', fatura_mes: '2026-11-01' }, [nubank])).toBe('2026-10-01');
  });

  it('fechamento no meio do mês e débito ficam pela data', () => {
    expect(mesDoGasto({ data: '2026-10-20', forma: 'cartao', cartao_id: 'm', fatura_mes: '2026-11-01' }, [meio])).toBe('2026-10-01');
    expect(mesDoGasto({ data: '2026-10-31', forma: 'debito', cartao_id: null, fatura_mes: null }, [nubank])).toBe('2026-10-01');
  });
});

describe('fixasNaFatura', () => {
  it('valor do mês (pagamento sem baixa) vale sobre o cadastro', () => {
    const c = { id: 'n', fechamento_dia: 1, vencimento_dia: 7, fecha_dias: 7 } as Cartao;
    const r = { id: 'r1', tipo: 'conta', cartao_id: 'n', descricao: 'Streaming', valor: 50, ativo: true, inicio: '2026-01-01', fim: null } as unknown as Recorrencia;
    const p = [{ tipo: 'recorrencia' as const, ref_id: 'r1', mes: '2026-12-01', valor: 52.3 }];
    expect(fixasNaFatura('2026-12-01', c, [r], p)[0]).toMatchObject({ valor: 52.3, informado: true });
    expect(fixasNaFatura('2026-11-01', c, [r], p)[0]).toMatchObject({ valor: 50, informado: false });
  });
});
