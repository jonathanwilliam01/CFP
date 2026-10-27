import { contasDoMes, creditoBeneficios, mediaContas, porRecebimento, resumoMes, saldoBeneficio, statusOrcamentos } from './financas';
import { Beneficio, Cartao, Gasto, Pagamento, Recorrencia } from './models';

const cartao = (p: Partial<Cartao> = {}): Cartao => ({
  id: 'c1', nome: 'Nu', fechamento_dia: 1, vencimento_dia: 8, limite: null, cor: '#000', padrao: true, ativo: true, paga_mes_anterior: false, ...p,
});

const conta = (p: Partial<Recorrencia> = {}): Recorrencia => ({
  id: 'r1', tipo: 'conta', descricao: 'Luz', categoria_id: null, valor: 100, dia: 10, inicio: '2026-01-01', fim: null, ativo: true,
  cartao_id: null, variavel: false, paga_mes_anterior: false, beneficio_id: null, ...p,
});

const gasto = (p: Partial<Gasto> = {}): Gasto => ({
  id: 'g1', descricao: 'x', categoria_id: null, valor: 50, data: '2026-10-05', forma: 'debito', cartao_id: null, beneficio_id: null,
  fatura_mes: null, parcelamento_id: null, parcela: null, criado_por: null, ...p,
});

const pago = (p: Partial<Pagamento>): Pagamento => ({ id: 'p1', tipo: 'recorrencia', ref_id: 'r1', mes: '2026-10-01', valor: 0, pago_em: '2026-10-10', ...p });

describe('contasDoMes', () => {
  const mes = '2026-10-01';

  it('junta conta fixa e fatura com as fixas no cartão', () => {
    const l = contasDoMes(mes, [conta(), conta({ id: 'r2', descricao: 'Netflix', valor: 40, cartao_id: 'c1' })], [cartao()],
      [gasto({ forma: 'cartao', cartao_id: 'c1', fatura_mes: mes, valor: 200 })], [], new Map());
    expect(l.map((c) => [c.descricao, c.valor])).toEqual([['Fatura Nu', 240], ['Luz', 100]]);
  });

  it('cartão pago com salário do mês anterior traz a fatura do mês seguinte', () => {
    const l = contasDoMes(mes, [], [cartao({ paga_mes_anterior: true })],
      [gasto({ forma: 'cartao', cartao_id: 'c1', fatura_mes: '2026-11-01', valor: 80 })], [], new Map());
    expect(l).toHaveLength(1);
    expect(l[0].mes).toBe('2026-11-01');
    expect(l[0].vencimento).toBe('2026-11-08');
  });

  it('usa o valor pago quando há baixa', () => {
    const l = contasDoMes(mes, [conta()], [], [], [pago({ valor: 120 })], new Map());
    expect(l[0].valor).toBe(120);
    expect(l[0].pago?.valor).toBe(120);
  });

  it('respeita início e fim da conta fixa', () => {
    expect(contasDoMes(mes, [conta({ inicio: '2026-11-01' })], [], [], [], new Map())).toEqual([]);
    expect(contasDoMes(mes, [conta({ fim: '2026-09-01' })], [], [], [], new Map())).toEqual([]);
  });
});

describe('resumoMes', () => {
  it('conta paga com benefício sai das saídas e entra em benefícios', () => {
    const mes = '2026-10-01';
    const recs = [conta(), conta({ id: 'r2', valor: 300, beneficio_id: 'b1' }), conta({ id: 'r3', tipo: 'entrada', valor: 5000, dia: 5 })];
    const contas = contasDoMes(mes, recs, [], [], [], new Map());
    const r = resumoMes(mes, [gasto(), gasto({ id: 'g2', forma: 'beneficio', beneficio_id: 'b1', valor: 30 })], 200, recs, contas, []);
    expect(r.saidas).toBe(150);
    expect(r.beneficios).toBe(330);
    expect(r.entradas).toBe(5200);
    expect(r.saldo).toBe(5050);
    expect(r.aPagar).toBe(100);
  });
});

describe('porRecebimento', () => {
  const mes = '2026-10-01';
  const vale = conta({ id: 'e1', tipo: 'entrada', descricao: 'Vale', valor: 2000, dia: 20 });
  const salario = conta({ id: 'e2', tipo: 'entrada', descricao: 'Salário', valor: 3000, dia: 7 });

  it('separa as contas pelo último recebimento até o vencimento', () => {
    const recs = [vale, salario, conta({ dia: 3 }), conta({ id: 'r2', dia: 10, valor: 200 }), conta({ id: 'r3', dia: 25, valor: 50 }),
      conta({ id: 'r4', dia: 12, valor: 90, beneficio_id: 'b1' })];
    const contas = contasDoMes(mes, recs, [], [], [pago({ ref_id: 'r2', valor: 200 })], new Map());
    const l = porRecebimento(mes, contas, recs, [pago({ ref_id: 'e2', valor: 3100 })]);
    expect(l.map((g) => [g.dia, g.recebe, g.total, g.aPagar, g.sobra])).toEqual([[7, 3100, 200, 0, 2900], [20, 2000, 150, 150, 1850]]);
  });

  it('com um só dia de recebimento não separa', () => {
    expect(porRecebimento(mes, [], [salario], [])).toEqual([]);
  });
});

describe('saldoBeneficio', () => {
  const b: Beneficio = { id: 'b1', nome: 'VR', valor_mensal: 500, dia_credito: 1, acumula: true, inicio: '2026-08-01', ativo: true };
  const uso = [
    { beneficio_id: 'b1', mes: '2026-08-01', total: 400 },
    { beneficio_id: 'b1', mes: '2026-10-01', total: 100 },
    { beneficio_id: 'b2', mes: '2026-10-01', total: 999 },
  ];

  it('acumula o saldo dos meses desde o início', () => {
    expect(saldoBeneficio(b, uso, '2026-10-01')).toEqual({ saldo: 1500 - 500, usadoMes: 100 });
  });

  it('sem acumular considera só o mês', () => {
    expect(saldoBeneficio({ ...b, acumula: false }, uso, '2026-10-01')).toEqual({ saldo: 400, usadoMes: 100 });
  });

  it('desconta cobranças de contas fixas pagas com o benefício', () => {
    const cob = [{ beneficio_id: 'b1', ref_id: 'r1', mes: '2026-10-01', valor: 50 }];
    expect(saldoBeneficio(b, uso, '2026-10-01', cob).saldo).toBe(950);
  });
});

describe('mediaContas', () => {
  it('só calcula com ao menos 3 contas e usa as 12 mais recentes', () => {
    expect(mediaContas([{ mes: '2026-01-01', valor: 10 }, { mes: '2026-02-01', valor: 20 }])).toBeNull();
    const l = Array.from({ length: 13 }, (_, i) => ({ mes: `2025-${String(i + 1).padStart(2, '0')}-01`.replace('2025-13', '2026-01'), valor: i === 0 ? 1000 : 100 }));
    expect(mediaContas(l)).toBe(100);
  });
});

describe('statusOrcamentos', () => {
  it('classifica em ok, alerta e estourado', () => {
    const gastos = [gasto({ categoria_id: 'a', valor: 85 }), gasto({ categoria_id: 'b', valor: 120 })];
    const st = statusOrcamentos(
      [{ id: 'o1', categoria_id: 'a', valor: 100, alerta_pct: 80 }, { id: 'o2', categoria_id: 'b', valor: 100, alerta_pct: 80 }, { id: 'o3', categoria_id: null, valor: 1000, alerta_pct: 80 }],
      gastos, new Map());
    expect(st.map((s) => [s.orcamento.id, s.nivel])).toEqual([['o2', 'estourado'], ['o1', 'alerta'], ['o3', 'ok']]);
  });
});

describe('creditoBeneficios', () => {
  it('soma os ativos que já começaram no mês', () => {
    const b = (p: Partial<Beneficio>): Beneficio => ({ id: 'b', nome: 'VR', valor_mensal: 500, dia_credito: 1, acumula: true, inicio: '2026-01-01', ativo: true, ...p });
    expect(creditoBeneficios([b({}), b({ valor_mensal: 300, inicio: '2026-11-01' }), b({ valor_mensal: 200, ativo: false })], '2026-10-01')).toBe(500);
  });
});
