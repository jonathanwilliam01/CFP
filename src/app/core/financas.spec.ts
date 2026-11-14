import { acertoMes, curvaFatura, dataEntrada, decimoTerceiro, avistaOuParcelado, emprestimo, inss, parcelaPrice, quitarDivida, rendimento, salarioLiquido, duplicados, taxaMensal, ajusteOrcamento, categoriasAcima, comprasRecorrentes, depositoNecessario, orcamentosNoMes, metaSobra, inflacaoCasal, precosRepetidos, deducoesIR, proximoRecebimento, simularDepositos, contasDoMes, creditoBeneficios, faturaProjetada, historicoReajustes, inicioFixa, mediaContas, mediasVariaveis, parcelasDoMes, porRecebimento, resumoMes, ritmoMes, saldoBeneficio, saldoDiario, statusOrcamentos, variacaoGastos, variaveisAcima, tempoDeTrabalho, aumentosRecorrentes, reajustesNoMes, previsaoFimMes, gastosIncomuns, categoriasNoRitmo } from './financas';
import { Beneficio, Cartao, Gasto, Pagamento, Recorrencia } from './models';

const cartao = (p: Partial<Cartao> = {}): Cartao => ({
  id: 'c1', nome: 'Nu', fechamento_dia: 1, vencimento_dia: 8, fecha_dias: null, limite: null, cor: '#000', padrao: true, ativo: true, paga_mes_anterior: false, ...p,
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

describe('parcela no boleto/débito', () => {
  const mes = '2026-12-01';
  const g = gasto({ id: 'p2', descricao: 'Emprestimo (2/2)', valor: 321.25, data: '2026-12-20', parcelamento_id: 'pp', parcela: 2 });
  it('vira conta do mês no vencimento e conta no a pagar sem dobrar as saídas', () => {
    const contas = contasDoMes(mes, [], [], [g], [], new Map());
    expect(contas).toHaveLength(1);
    expect(contas[0]).toMatchObject({ tipo: 'parcela', ref_id: 'p2', vencimento: '2026-12-20', valor: 321.25, pago: null });
    const r = resumoMes(mes, [g], 0, [], contas, []);
    expect(r.saidas).toBe(321.25);
    expect(r.aPagar).toBe(321.25);
    const pg = pago({ tipo: 'parcela', ref_id: 'p2', mes, valor: 321.25, pago_em: '2026-12-20' });
    const pagas = contasDoMes(mes, [], [], [g], [pg], new Map());
    expect(resumoMes(mes, [g], 0, [], pagas, [pg]).aPagar).toBe(0);
    expect(saldoDiario(mes, [g], [], [], contas, []).at(-1)!.saldo).toBe(-321.25);
  });
});

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

  it('fatura paga em parte leva o resto para a seguinte e estorno abate', () => {
    const l = contasDoMes(mes, [], [cartao()],
      [gasto({ forma: 'cartao', cartao_id: 'c1', fatura_mes: mes, valor: 200 }), gasto({ id: 'g2', forma: 'cartao', cartao_id: 'c1', fatura_mes: mes, valor: -50 })],
      [pago({ tipo: 'fatura', ref_id: 'c1', mes: '2026-09-01', valor: 300, resto: 120 })], new Map());
    expect(l[0].valor).toBe(270);
    expect(l[0].anterior).toBe(120);
  });

  it('usa o valor pago quando há baixa', () => {
    const l = contasDoMes(mes, [conta()], [], [], [pago({ valor: 120 })], new Map());
    expect(l[0].valor).toBe(120);
    expect(l[0].pago?.valor).toBe(120);
  });

  it('valor do mês informado conta sem marcar paga', () => {
    const l = contasDoMes(mes, [conta({ variavel: true })], [], [], [pago({ valor: 180, pago_em: null })], new Map());
    expect(l[0].valor).toBe(180);
    expect(l[0].pago).toBeNull();
    expect(l[0].media).toBe(false);
    expect(l[0].informado?.valor).toBe(180);
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

  it('reservas de orçamento entram no recebimento do vencimento (débito: pelos dias)', () => {
    const recs = [vale, salario];
    const reservas = [
      { dia: 31, vence: 8, valor: 180, orcamento_id: 'm', nome: 'Mercado · Nu' },
      { dia: 18, valor: 10, orcamento_id: 'f', nome: 'Feira · Pix/Débito' },
      { dia: 19, valor: 10, orcamento_id: 'f', nome: 'Feira · Pix/Débito' },
      { dia: 20, valor: 10, orcamento_id: 'f', nome: 'Feira · Pix/Débito' },
    ];
    const l = porRecebimento(mes, [], recs, [], reservas);
    expect(l.map((g) => [g.dia, g.reservado, g.sobra])).toEqual([[7, 200, 2800], [20, 10, 1990]]);
    expect(l[0].reservas).toEqual([{ orcamento_id: 'm', nome: 'Mercado · Nu', valor: 180 }, { orcamento_id: 'f', nome: 'Feira · Pix/Débito', valor: 20 }]);
  });

  it('salário no 5º dia útil do mês seguinte: data real e ordem pela data', () => {
    const sal = conta({ id: 'e2', tipo: 'entrada', descricao: 'Salário', valor: 3000, dia: 5, dia_util: true, paga_mes_anterior: true });
    const recs = [vale, sal, conta({ dia: 20 }), conta({ id: 'r2', dia: 7, valor: 200, paga_mes_anterior: true })];
    const nov = '2026-11-01';
    const l = porRecebimento(nov, contasDoMes(nov, recs, [], [], [], new Map()), recs, []);
    expect(l.map((g) => [g.data, g.mes, g.util, g.total])).toEqual([['2026-11-20', nov, false, 100], ['2026-12-05', nov, true, 200]]);
    expect(dataEntrada(sal, '2026-10-01')).toBe('2026-11-07');
  });

  it('com um só dia de recebimento não separa', () => {
    expect(porRecebimento(mes, [], [salario], [])).toEqual([]);
  });
});

describe('metaSobra', () => {
  it('compara a sobra prevista com a meta', () => {
    expect(metaSobra(5000, 600, 15)).toEqual({ meta: 15, alvo: 750, prevista: 12, falta: 150, ok: false, pct: 80 });
    expect(metaSobra(5000, 900, 15)).toMatchObject({ ok: true, falta: 0, pct: 100 });
    expect(metaSobra(5000, -100, 15)).toMatchObject({ prevista: -2, pct: 0 });
  });

  it('sem meta ou sem entradas: nada', () => {
    expect(metaSobra(5000, 600, null)).toBeNull();
    expect(metaSobra(0, 0, 10)).toBeNull();
  });
});

describe('proximoRecebimento', () => {
  const vale = conta({ id: 'e1', tipo: 'entrada', descricao: 'Vale', valor: 2000, dia: 20 });
  const salario = conta({ id: 'e2', tipo: 'entrada', descricao: 'Salário', valor: 3000, dia: 7 });
  const bonus = conta({ id: 'e3', tipo: 'entrada', descricao: 'Bônus', valor: 500, dia: 20 });

  it('pega o próximo dia do mês e junta as entradas do mesmo dia', () => {
    expect(proximoRecebimento('2026-10-10', [vale, salario, bonus, conta({ dia: 15 })], [])).toEqual({ data: '2026-10-20', dias: 10, nome: 'Vale + Bônus', valor: 2500 });
    expect(proximoRecebimento('2026-10-07', [vale, salario], [])?.dias).toBe(0);
  });

  it('já recebida fica de fora e, sem mais nenhuma no mês, vai para o seguinte', () => {
    expect(proximoRecebimento('2026-10-05', [vale, salario], [pago({ ref_id: 'e2' })])?.data).toBe('2026-10-20');
    expect(proximoRecebimento('2026-10-25', [vale, salario], [])).toEqual({ data: '2026-11-07', dias: 13, nome: 'Salário', valor: 3000 });
  });

  it('salário do mês anterior que cai neste ainda conta', () => {
    const sal = { ...salario, dia: 5, dia_util: true, paga_mes_anterior: true };
    expect(proximoRecebimento('2026-11-04', [vale, sal], [])).toMatchObject({ data: '2026-11-07', nome: 'Salário' });
    expect(proximoRecebimento('2026-11-04', [vale, sal], [pago({ ref_id: 'e2', mes: '2026-10-01' })])?.data).toBe('2026-11-20');
  });

  it('sem entrada fixa ativa: nada', () => {
    expect(proximoRecebimento('2026-10-10', [conta(), { ...salario, ativo: false }], [])).toBeNull();
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
      gastos, '2026-10-01', new Map());
    expect(st.map((s) => [s.orcamento.id, s.nivel])).toEqual([['o2', 'estourado'], ['o1', 'alerta'], ['o3', 'ok']]);
  });

  it('por forma de pagamento: cartão pela fatura do mês e reserva do que falta', () => {
    const gastos = [
      gasto({ categoria_id: 'm', valor: 120, forma: 'cartao', cartao_id: 'c1', fatura_mes: '2026-10-01' }),
      gasto({ id: 'g2', categoria_id: 'm', valor: 999, forma: 'cartao', cartao_id: 'c1', fatura_mes: '2026-11-01' }),
      gasto({ id: 'g3', categoria_id: 'm', valor: 50 }),
    ];
    const o = { id: 'o', categoria_id: 'm', valor: 300, alerta_pct: 80, forma: 'cartao' as const, cartao_id: 'c1', reserva: true };
    const [st] = statusOrcamentos([o], gastos, '2026-10-01', new Map(), [cartao()], '2026-10-01');
    expect([st.gasto, st.reservado, st.pagamento]).toEqual([120, 180, 'Nu']);
    expect(statusOrcamentos([o], gastos, '2026-10-01', new Map(), [cartao()], '2026-11-01')[0].reservado).toBe(0);
    const [deb] = statusOrcamentos([{ ...o, forma: 'debito', cartao_id: null }], gastos, '2026-10-01', new Map(), [cartao()]);
    expect([deb.gasto, deb.reservado]).toEqual([50, 250]);
  });
});

describe('creditoBeneficios', () => {
  it('soma os ativos que já começaram no mês', () => {
    const b = (p: Partial<Beneficio>): Beneficio => ({ id: 'b', nome: 'VR', valor_mensal: 500, dia_credito: 1, acumula: true, inicio: '2026-01-01', ativo: true, ...p });
    expect(creditoBeneficios([b({}), b({ valor_mensal: 300, inicio: '2026-11-01' }), b({ valor_mensal: 200, ativo: false })], '2026-10-01')).toBe(500);
  });
});

describe('reajuste', () => {
  // reajuste em novembro: a antiga termina em outubro e a nova começa em novembro
  const antiga = conta({ id: 'r1', valor: 100, fim: '2026-10-01' });
  const nova = conta({ id: 'r2', valor: 130, inicio: '2026-11-01', reajuste_de: 'r1' });
  const valor = (mes: string, l: Recorrencia[], cartoes: Cartao[] = []) =>
    contasDoMes(mes, l, cartoes, [], [], new Map()).map((c) => c.valor);

  it('meses antes do reajuste ficam com o valor antigo e depois com o novo', () => {
    expect(valor('2026-10-01', [antiga, nova])).toEqual([100]);
    expect(valor('2026-11-01', [antiga, nova])).toEqual([130]);
  });

  it('com salário do mês anterior vale pelo mês do vencimento', () => {
    const l = [{ ...antiga, paga_mes_anterior: true }, { ...nova, paga_mes_anterior: true }];
    expect(valor('2026-09-01', l)).toEqual([100]);
    expect(valor('2026-10-01', l)).toEqual([130]);
  });

  it('fixa no cartão troca a partir da fatura do reajuste', () => {
    const l = [{ ...antiga, cartao_id: 'c1' }, { ...nova, cartao_id: 'c1' }];
    expect(valor('2026-10-01', l, [cartao()])).toEqual([100]);
    expect(valor('2026-11-01', l, [cartao()])).toEqual([130]);
  });

  it('variável recomeça a média com os pagamentos movidos para a nova', () => {
    const vs = [
      { ref_id: 'r1', mes: '2026-08-01', valor: 90 }, { ref_id: 'r1', mes: '2026-09-01', valor: 110 }, { ref_id: 'r1', mes: '2026-10-01', valor: 100 },
      { ref_id: 'r2', mes: '2026-11-01', valor: 150 },
    ];
    const m = mediasVariaveis([{ ...antiga, variavel: true }, { ...nova, variavel: true }], vs);
    expect(m.get('r1')).toBe(100);
    expect(m.has('r2')).toBe(false);
  });

  it('histórico segue a cadeia em ordem a partir de qualquer elo', () => {
    const terceira = conta({ id: 'r3', valor: 160, inicio: '2027-03-01', reajuste_de: 'r2' });
    const l = [terceira, nova, antiga, conta({ id: 'x' })];
    expect(historicoReajustes(l, 'r2').map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(historicoReajustes(l, 'x').map((r) => r.id)).toEqual(['x']);
  });
});

describe('inicioFixa', () => {
  it('sem cartão usa o mês e o dia da data', () => {
    expect(inicioFixa('2026-10-15')).toEqual({ inicio: '2026-10-01', dia: 15 });
  });

  it('no cartão usa a fatura da data e o vencimento do cartão', () => {
    expect(inicioFixa('2026-10-15', cartao({ fechamento_dia: 1, vencimento_dia: 8 }))).toEqual({ inicio: '2026-11-01', dia: 8 });
    expect(inicioFixa('2026-10-15', cartao({ fechamento_dia: 20, vencimento_dia: 28 }))).toEqual({ inicio: '2026-10-01', dia: 28 });
  });
});

describe('variaveisAcima', () => {
  const luz = conta({ variavel: true });
  const vs = (ult: number, mes = '2026-10-01') => [
    { ref_id: 'r1', mes: '2026-07-01', valor: 100 }, { ref_id: 'r1', mes: '2026-08-01', valor: 100 }, { ref_id: 'r1', mes: '2026-09-01', valor: 100 },
    { ref_id: 'r1', mes, valor: ult },
  ];

  it('avisa conta do mês 30% acima da média das anteriores', () => {
    expect(variaveisAcima([luz], vs(135), '2026-10-01').map((v) => v.pct)).toEqual([35]);
  });

  it('não avisa abaixo do limite, conta antiga ou sem média', () => {
    expect(variaveisAcima([luz], vs(125), '2026-10-01')).toEqual([]);
    expect(variaveisAcima([luz], vs(200, '2026-09-15'), '2026-11-01')).toEqual([]);
    expect(variaveisAcima([luz], vs(200).slice(2), '2026-10-01')).toEqual([]);
  });
});

describe('variacaoGastos', () => {
  const gs = [gasto({ data: '2026-09-05', valor: 100 }), gasto({ data: '2026-09-25', valor: 300 }), gasto({ data: '2026-10-03', valor: 80 })];

  it('no mês corrente compara até o mesmo dia do mês anterior', () => {
    expect(variacaoGastos(gs, '2026-10-01', '2026-10-10')).toBe(-20);
  });

  it('mês fechado compara o mês inteiro; sem gasto anterior não compara', () => {
    expect(variacaoGastos(gs, '2026-10-01', '2026-11-02')).toBe(-80);
    expect(variacaoGastos(gs, '2026-09-01', '2026-10-10')).toBeNull();
  });
});

describe('saldoDiario', () => {
  const mes = '2026-10-01';
  it('acumula por dia e fecha no saldo do resumo', () => {
    const rec = [conta({ dia: 10 }), conta({ id: 'e1', tipo: 'entrada', descricao: 'Salário', valor: 1000, dia: 5 })];
    const gastos = [gasto({ data: '2026-10-03', valor: 30 }), gasto({ id: 'g2', forma: 'cartao', cartao_id: 'c1', fatura_mes: mes, valor: 200 })];
    const contas = contasDoMes(mes, rec, [cartao()], gastos, [], new Map());
    const l = saldoDiario(mes, gastos, [{ data: '2026-10-20', valor: 50 }], rec, contas, []);
    expect(l).toHaveLength(31);
    expect(l[2].saldo).toBe(-30);
    expect(l[4].saldo).toBe(970);
    expect(l[7].sai).toBe(200);
    expect(l[9].saldo).toBe(670);
    expect(l[30].saldo).toBe(resumoMes(mes, gastos, 50, rec, contas, []).saldo);
  });

  it('conta paga cai no dia do pagamento', () => {
    const contas = contasDoMes(mes, [conta()], [], [], [pago({ valor: 100, pago_em: '2026-10-02' })], new Map());
    const l = saldoDiario(mes, [], [], [conta()], contas, []);
    expect(l[1].sai).toBe(100);
  });
});

describe('parcelasDoMes', () => {
  it('cartão pela fatura das contas do mês e débito pela data', () => {
    const g = [
      gasto({ parcelamento_id: 'p', forma: 'cartao', cartao_id: 'c1', fatura_mes: '2026-10-01', valor: 100 }),
      gasto({ id: 'g2', parcelamento_id: 'p', forma: 'cartao', cartao_id: 'c1', fatura_mes: '2026-11-01', valor: 100 }),
      gasto({ id: 'g3', parcelamento_id: 'q', valor: 40 }),
      gasto({ id: 'g4', valor: 999 }),
    ];
    expect(parcelasDoMes('2026-10-01', g, [cartao()])).toEqual({ cartao: 100, debito: 40 });
  });
});

describe('ritmoMes', () => {
  it('só no mês corrente', () => {
    expect(ritmoMes('2026-10-01', '2026-10-15')).toBe(48);
    expect(ritmoMes('2026-09-01', '2026-10-15')).toBeNull();
  });
});

describe('categoriasAcima', () => {
  const cats = new Map([['m', { id: 'm', nome: 'Mercado', icone: 'x', cor: '#000', tipo: 'gasto' as const, ordem: 0 }]]);
  const ant = [
    { categoria_id: 'm', valor: 300, data: '2026-07-10' },
    { categoria_id: 'm', valor: 300, data: '2026-08-10' },
    { categoria_id: 'm', valor: 300, data: '2026-09-10' },
  ];
  it('avisa a partir de 50% acima da média', () => {
    const l = categoriasAcima([{ categoria_id: 'm', valor: 460 }], ant, cats);
    expect(l.map((c) => [c.nome, c.media, c.acima])).toEqual([['Mercado', 300, 53]]);
    expect(categoriasAcima([{ categoria_id: 'm', valor: 440 }], ant, cats)).toEqual([]);
  });
  it('precisa de 2 meses de histórico', () => {
    expect(categoriasAcima([{ categoria_id: 'm', valor: 900 }], ant.slice(0, 1), cats)).toEqual([]);
  });
});

describe('curvaFatura', () => {
  it('acumula o real até hoje e projeta até a véspera do fechamento', () => {
    const c = cartao({ fechamento_dia: 25, vencimento_dia: 5 });
    const g = [
      { cartao_id: 'c1', valor: 100, data: '2026-09-28', fatura_mes: '2026-11-01', parcelamento_id: null },
      { cartao_id: 'c1', valor: 50, data: '2026-10-01', fatura_mes: '2026-11-01', parcelamento_id: 'p' },
    ];
    const r = curvaFatura(c, g, [], '2026-10-04');
    expect(r.dias[0]).toBe('2026-09-25');
    expect(r.real[0]).toBe(50);
    expect(r.real[r.hoje]).toBe(150);
    expect(r.real[r.hoje + 1]).toBeNull();
    expect(r.prevista[r.hoje]).toBe(150);
    expect(r.prevista[r.dias.length - 1]).toBeCloseTo(r.projetada, 2);
  });
});

describe('faturaProjetada', () => {
  const c = cartao({ fechamento_dia: 25, vencimento_dia: 5 });
  it('projeta as compras avulsas pelo ritmo do ciclo', () => {
    // ciclo 25/09 a 24/10 (30 dias), fatura de novembro; hoje 04/10 = 10 dias passados
    const g = [
      { cartao_id: 'c1', valor: 100, data: '2026-09-28', fatura_mes: '2026-11-01', parcelamento_id: null },
      { cartao_id: 'c1', valor: 50, data: '2026-10-01', fatura_mes: '2026-11-01', parcelamento_id: 'p' },
    ];
    const r = faturaProjetada(c, g, [], '2026-10-04');
    expect(r.mes).toBe('2026-11-01');
    expect(r.fecha).toBe('2026-10-25');
    expect(r.atual).toBe(150);
    expect(r.projetada).toBe(350);
  });
});

describe('ajusteOrcamento', () => {
  const o = { id: 'o', categoria_id: null, valor: 500, alerta_pct: 80 };
  const v = (mes: string, ate: string | null, valor: number, criado_em = '2026-01-01') => ({ id: mes + ate, orcamento_id: 'o', mes, ate, valor, criado_em });
  const valores = [v('2026-10-01', null, 600), v('2026-12-01', '2026-12-01', 900), v('2027-01-01', '2027-02-01', 700)];
  it('vale o ajuste que começou por último e volta ao anterior quando acaba', () => {
    const lim = (mes: string) => orcamentosNoMes([o], valores, mes)[0].valor;
    expect(lim('2026-09-01')).toBe(500);
    expect(lim('2026-11-01')).toBe(600);
    expect(lim('2026-12-01')).toBe(900);
    expect(lim('2027-02-01')).toBe(700);
    expect(lim('2027-03-01')).toBe(600);
    expect(ajusteOrcamento(o, valores, '2026-09-01')).toBeUndefined();
  });

  it('sobra desconsiderada tira a reserva só naquele mês', () => {
    const r = { ...o, forma: 'debito' as const, reserva: true };
    const f = [{ id: 'x', orcamento_id: 'o', mes: '2026-10-01' }];
    expect(orcamentosNoMes([r], [], '2026-10-01', f)[0]).toMatchObject({ reserva: false, fechado_id: 'x' });
    expect(orcamentosNoMes([r], [], '2026-11-01', f)[0].reserva).toBe(true);
  });
});

describe('simularDepositos', () => {
  it('quantos depósitos e quando chega', () => {
    expect(simularDepositos(600, 50, 'mes', '2026-10-29', null)).toEqual({ depositos: 12, data: '2027-09-29', total: 600 });
    expect(simularDepositos(120, 50, 'semana', '2026-10-29', null)?.data).toBe('2026-11-12');
  });
  it('com prazo: quanto junta até ele e a folga', () => {
    const r = simularDepositos(600, 50, 'mes', '2026-10-29', '2027-03-31');
    expect(r?.ateOPrazo).toBe(300);
    expect(r?.folga).toBe(-182);
  });
  it('depósito necessário por período até o prazo', () => {
    expect(depositoNecessario(600, 'mes', '2026-10-29', '2027-03-31')).toBe(100);
    expect(depositoNecessario(100, 'semana', '2026-10-29', '2026-11-12')).toBe(33.34);
  });
});

describe('comprasRecorrentes', () => {
  const mensal = (data: string, valor = 39.9, p: Partial<Gasto> = {}) => gasto({ descricao: 'Netflix', data, valor, ...p });

  it('sugere gasto lançado uma vez em cada um dos 3 meses anteriores', () => {
    const l = comprasRecorrentes([mensal('2026-07-15'), mensal('2026-08-15'), mensal('2026-09-14', 44.9)], [], '2026-10-01');
    expect(l).toEqual([{ chave: 'netflix', descricao: 'Netflix', valor: 44.9, dia: 14, categoria_id: null, cartao_id: null, inicio: '2026-10-01' }]);
  });

  it('no cartão começa na fatura seguinte à do último lançamento', () => {
    const c = { forma: 'cartao' as const, cartao_id: 'c1' };
    const l = comprasRecorrentes(
      [mensal('2026-07-15', 39.9, { ...c, fatura_mes: '2026-08-01' }), mensal('2026-08-15', 39.9, { ...c, fatura_mes: '2026-09-01' }), mensal('2026-09-15', 39.9, { ...c, fatura_mes: '2026-10-01' })],
      [], '2026-10-01',
    );
    expect(l[0].inicio).toBe('2026-11-01');
    expect(l[0].cartao_id).toBe('c1');
  });

  it('ignora mês faltando, mais de um por mês, valor muito diferente, parcela e conta fixa de mesmo nome', () => {
    const base = [mensal('2026-07-15'), mensal('2026-08-15'), mensal('2026-09-15')];
    expect(comprasRecorrentes(base.slice(1), [], '2026-10-01')).toEqual([]);
    expect(comprasRecorrentes([...base, mensal('2026-09-20')], [], '2026-10-01')).toEqual([]);
    expect(comprasRecorrentes([...base.slice(0, 2), mensal('2026-09-15', 80)], [], '2026-10-01')).toEqual([]);
    expect(comprasRecorrentes(base.map((g) => ({ ...g, parcelamento_id: 'p' })), [], '2026-10-01')).toEqual([]);
    expect(comprasRecorrentes(base, [conta({ descricao: 'NETFLIX' })], '2026-10-01')).toEqual([]);
  });
});

describe('avistaOuParcelado', () => {
  it('parcelado sem juros compensa quando o dinheiro rende', () => {
    const r = avistaOuParcelado(1000, 100, 10, 0.01)!;
    expect(r.compensa).toBe('parcelado');
    expect(r.custoHoje).toBeCloseTo(947.13, 2);
    expect(r.juros).toBeNull();
    expect(r.meses).toHaveLength(10);
  });

  it('desconto grande no pix ganha do parcelado e mostra os juros embutidos', () => {
    const r = avistaOuParcelado(900, 100, 10, 0.008)!;
    expect(r.compensa).toBe('avista');
    expect(r.sobra).toBeLessThan(0);
    expect(r.juros!).toBeCloseTo(0.0196, 3);
  });

  it('IR regressivo pelo prazo', () => {
    expect(taxaMensal(12, 100, 6)).toBeCloseTo((Math.pow(1.12, 1 / 12) - 1) * 0.775, 8);
    expect(taxaMensal(12, 100, 30, false)).toBeCloseTo(Math.pow(1.12, 1 / 12) - 1, 8);
  });
});

describe('duplicados', () => {
  const g = (id: string, data: string, extra = {}) => ({ id, descricao: 'Mercado X', valor: 50, data, parcelamento_id: null, ...extra });

  it('aponta mesmo valor e descrição com até 1 dia', () => {
    expect(duplicados([g('a', '2026-10-01'), g('b', '2026-10-02'), g('c', '2026-10-05')]).map((p) => p.map((x) => x.id))).toEqual([['a', 'b']]);
  });

  it('ignora par confirmado e parcelas do mesmo parcelamento', () => {
    expect(duplicados([g('a', '2026-10-01', { nao_duplicado: true }), g('b', '2026-10-01', { nao_duplicado: true })])).toEqual([]);
    expect(duplicados([g('a', '2026-10-01', { parcelamento_id: 'p' }), g('b', '2026-10-01', { parcelamento_id: 'p' })])).toEqual([]);
    expect(duplicados([g('a', '2026-10-01', { nao_duplicado: true }), g('b', '2026-10-01')])).toHaveLength(1);
  });
});

describe('calculadoras de crédito e salário', () => {
  it('parcela Price e empréstimo com IOF', () => {
    expect(parcelaPrice(1000, 0, 10)).toBe(100);
    expect(parcelaPrice(1000, 0.05, 12)).toBeCloseTo(112.83, 2);
    const sem = emprestimo(1000, 0.05, 12)!;
    const com = emprestimo(1000, 0.05, 12, true)!;
    expect(sem.iof).toBe(0);
    expect(com.iof).toBeGreaterThan(10);
    expect(com.iof).toBeLessThan(30);
    expect(com.parcela).toBeGreaterThan(sem.parcela);
  });

  it('dívida: quita, nunca quita e teto do rotativo', () => {
    expect(quitarDivida(1000, 0.1, 100)!.meses).toBeNull();
    const r = quitarDivida(1000, 0.08, 200)!;
    expect(r.meses).toBe(7);
    expect(r.total).toBeCloseTo(1000 + r.juros, 2);
    const rot = quitarDivida(1000, 0.15, 100, 1000)!;
    expect(rot.juros).toBe(1000);
    expect(rot.meses).toBe(20);
  });

  it('salário líquido 2026', () => {
    expect(inss(1621)).toBeCloseTo(121.58, 1);
    expect(inss(20000)).toBe(inss(8475.55));
    expect(salarioLiquido(5000)!.ir).toBe(0);
    expect(salarioLiquido(7350)!.ir).toBeGreaterThan(0);
    const s10 = salarioLiquido(10000)!;
    expect(s10.inss).toBeCloseTo(988.09, 1);
    expect(s10.ir).toBeCloseTo((10000 - 988.09) * 0.275 - 908.73, 1);
  });

  it('13º: 1ª sem desconto, 2ª com INSS e IR do total', () => {
    const d = decimoTerceiro(10000)!;
    expect(d.total).toBe(10000);
    expect(d.primeira).toBe(5000);
    expect(d.inss).toBe(inss(10000));
    expect(d.ir).toBeCloseTo((10000 - d.inss) * 0.275 - 908.73, 1);
    expect(d.primeira + d.segunda).toBeCloseTo(d.liquido, 2);
    expect(decimoTerceiro(6000, 6)!.total).toBe(3000);
    expect(decimoTerceiro(4000)!.ir).toBe(0);
  });

  it('rendimento com IR por depósito', () => {
    const r = rendimento(1000, 0, 12, 0.01, false)!;
    expect(r.final).toBeCloseTo(1000 * Math.pow(1.01, 12), 2);
    const ir = rendimento(1000, 0, 12, 0.01)!;
    expect(ir.imposto).toBeCloseTo((r.final - 1000) * 0.2, 2);
    expect(rendimento(0, 100, 3, 0, false)!.final).toBe(300);
  });
});

describe('inflacaoCasal', () => {
  const luz = conta({ id: 'luz', categoria_id: 'casa', valor: 100 });
  const gastos = [
    gasto({ data: '2025-10-05', valor: 400, categoria_id: 'merc' }),
    gasto({ data: '2026-10-05', valor: 500, categoria_id: 'merc' }),
    gasto({ data: '2026-10-08', valor: 60, categoria_id: 'lazer' }),
  ];

  it('média mensal por categoria, com contas fixas pelo valor pago', () => {
    const r = inflacaoCasal(['2026-10-01'], ['2025-10-01'], gastos, [{ ...luz, inicio: '2025-01-01' }], [pago({ ref_id: 'luz', mes: '2026-10-01', valor: 120 })]);
    expect(r.antes).toBe(500);
    expect(r.agora).toBe(680);
    expect(r.pct).toBe(36);
    expect(r.cats.map((c) => [c.id, c.pct])).toEqual([['merc', 25], ['lazer', null], ['casa', 20]]);
  });
});

describe('deducoesIR', () => {
  it('gastos e fixas das categorias dedutíveis no ano', () => {
    const gastos = [
      gasto({ id: 'a', data: '2026-03-10', valor: 200, categoria_id: 'saude', criado_por: 'u1' }),
      gasto({ id: 'b', data: '2026-03-11', valor: 50, categoria_id: 'merc' }),
      gasto({ id: 'c', data: '2025-12-30', valor: 90, categoria_id: 'saude' }),
    ];
    const escola = conta({ id: 'esc', descricao: 'Escola', categoria_id: 'edu', valor: 800, dia: 5, inicio: '2026-02-01' });
    const plano = conta({ id: 'pl', descricao: 'Plano', categoria_id: 'saude', valor: 300, dia: 15, cartao_id: 'c1', inicio: '2026-09-01' });
    const pags = [pago({ ref_id: 'esc', mes: '2026-02-01', valor: 800, pago_em: '2026-02-05' }), pago({ ref_id: 'esc', mes: '2026-03-01', valor: 820, pago_em: null })];
    const l = deducoesIR(2026, gastos, [escola, plano], pags, new Set(['saude', 'edu']), '2026-10-01');
    expect(l.map((d) => [d.data, d.descricao, d.valor, d.pessoa])).toEqual([
      ['2026-02-05', 'Escola', 800, null],
      ['2026-03-10', 'x', 200, 'u1'],
      ['2026-09-15', 'Plano', 300, null],
      ['2026-10-15', 'Plano', 300, null],
    ]);
  });
});

describe('precosRepetidos', () => {
  const g = (descricao: string, data: string, valor: number, parcelamento_id: string | null = null) => ({ descricao, data, valor, parcelamento_id });

  it('compara as primeiras com as últimas compras da mesma descrição', () => {
    const l = precosRepetidos([
      g('Posto Shell', '2026-01-05', 200), g('posto shell', '2026-02-05', 200), g('Posto  Shell', '2026-05-05', 220), g('Posto Shell', '2026-06-05', 240),
      g('Padaria', '2026-06-01', 10), g('Padaria', '2026-06-02', 10), g('Padaria', '2026-06-03', 12), g('Padaria', '2026-06-04', 12),
      g('Loja (1/4)', '2026-01-01', 50, 'p1'), g('Loja (2/4)', '2026-02-01', 50, 'p1'), g('Loja (3/4)', '2026-03-01', 50, 'p1'), g('Loja (4/4)', '2026-04-01', 50, 'p1'),
    ]);
    expect(l.map((x) => [x.nome, x.vezes, x.antes, x.agora, x.pct])).toEqual([['Posto Shell', 4, 200, 230, 15]]);
  });
});

describe('acertoMes', () => {
  const g = (valor: number, pago_por: string) => ({ valor, data: '2026-11-05', forma: 'debito' as const, criado_por: pago_por, pago_por, dividido: true });
  it('por igual sem pesos', () => {
    const a = acertoMes([g(100, 'a')], ['a', 'b'], [], '2026-11-01');
    expect(a.parte).toBe(50);
    expect(a.partes).toBeNull();
    expect(a.transferencias).toEqual([{ de: 'b', para: 'a', valor: 50 }]);
  });
  it('pelos pesos quando todos têm', () => {
    const a = acertoMes([g(100, 'a')], ['a', 'b'], [], '2026-11-01', new Map([['a', 70], ['b', 30]]));
    expect(a.partes).toEqual([{ id: 'a', valor: 70, pct: 70 }, { id: 'b', valor: 30, pct: 30 }]);
    expect(a.transferencias).toEqual([{ de: 'b', para: 'a', valor: 30 }]);
  });
  it('peso faltando volta para igual', () => {
    expect(acertoMes([g(100, 'a')], ['a', 'b'], [], '2026-11-01', new Map([['a', 70]])).partes).toBeNull();
  });
});

describe('tempoDeTrabalho', () => {
  it('converte pelo ganho mensal em 220 h', () => {
    expect(tempoDeTrabalho(100, 4400)?.texto).toBe('5 h de trabalho');
    expect(tempoDeTrabalho(30, 4400)?.texto).toBe('1 h 30 min de trabalho');
    expect(tempoDeTrabalho(800, 4400)?.texto).toBe('4,5 dias de trabalho');
  });
  it('sem ganho não calcula', () => expect(tempoDeTrabalho(100, 0)).toBeNull());
});

describe('aumentosRecorrentes', () => {
  const g = (data: string, valor: number, descricao = 'Netflix') => gasto({ data, valor, descricao });
  it('acha a cobrança estável que subiu no mês', () => {
    const l = aumentosRecorrentes([g('2026-08-10', 39.9), g('2026-09-10', 39.9), g('2026-10-10', 44.9)], '2026-10-01');
    expect(l).toEqual([expect.objectContaining({ descricao: 'Netflix', antes: 39.9, agora: 44.9, pct: 13 })]);
  });
  it('ignora valor que já oscilava e compra única', () => {
    expect(aumentosRecorrentes([g('2026-08-10', 20), g('2026-09-10', 40), g('2026-10-10', 45)], '2026-10-01')).toEqual([]);
    expect(aumentosRecorrentes([g('2026-09-10', 40), g('2026-10-10', 45)], '2026-10-01')).toEqual([]);
  });
});

describe('reajustesNoMes', () => {
  it('só reajuste para cima que começa no mês', () => {
    const rs = [conta({ id: 'a', valor: 40, fim: '2026-09-01' }), conta({ id: 'b', valor: 45, inicio: '2026-10-01', reajuste_de: 'a' })];
    expect(reajustesNoMes(rs, '2026-10-01').map((x) => [x.r.id, x.antes, x.pct])).toEqual([['b', 40, 13]]);
    expect(reajustesNoMes(rs, '2026-11-01')).toEqual([]);
  });
});

describe('previsaoFimMes', () => {
  const mes = '2026-11-01';
  it('desconta o débito no ritmo e a projeção da fatura que vence no mês', () => {
    // débito: 100 em 10 dias = 10/dia, faltam 20 dias = 200
    const d = [gasto({ valor: 60, data: '2026-11-02' }), gasto({ id: 'g2', valor: 40, data: '2026-11-08' })];
    const p = previsaoFimMes(mes, '2026-11-10', 1000, 0, d, [], []);
    expect(p).toMatchObject({ sobra: 800, aSair: 200, ritmo: 10, resta: 20, porDia: 50 });
  });
  it('reserva de orçamento cobre parte, meta entra no por dia', () => {
    const d = [gasto({ valor: 100, data: '2026-11-05' })];
    expect(previsaoFimMes(mes, '2026-11-10', 1000, 150, d, [], [], 300)).toMatchObject({ aSair: 50, sobra: 950, porDia: 42.5 });
  });
  it('cartão: só a fatura que vence neste mês', () => {
    // fecha dia 25, vence 5: fatura aberta em 10/11 é a de dezembro, fora do mês
    const c = cartao({ fechamento_dia: 25, vencimento_dia: 5 });
    const g = [gasto({ forma: 'cartao', cartao_id: 'c1', valor: 300, data: '2026-11-05', fatura_mes: '2026-12-01' })];
    expect(previsaoFimMes(mes, '2026-11-10', 1000, 0, g, [c], [])!.aSair).toBe(0);
    const c2 = cartao({ fechamento_dia: 25, vencimento_dia: 30 });
    const g2 = [gasto({ forma: 'cartao', cartao_id: 'c1', valor: 160, data: '2026-11-05', fatura_mes: '2026-11-01' })];
    expect(previsaoFimMes(mes, '2026-11-10', 1000, 0, g2, [c2], [])!.aSair).toBeGreaterThan(0);
  });
  it('fora do mês corrente ou no começo: null', () => {
    expect(previsaoFimMes(mes, '2026-12-10', 1000, 0, [], [], [])).toBeNull();
    expect(previsaoFimMes(mes, '2026-11-02', 1000, 0, [], [], [])).toBeNull();
  });
});

describe('gastosIncomuns', () => {
  const ant = [25, 30, 20].map((v) => ({ descricao: 'Uber', valor: v, parcelamento_id: null }));
  it('o dobro da média e R$ 30 a mais, nos últimos 10 dias', () => {
    const r = gastosIncomuns([gasto({ descricao: 'uber', valor: 98, data: '2026-11-12' })], ant, '2026-11-14');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ media: 25, vezes: 3.92 });
  });
  it('pouco histórico, diferença pequena ou antigo: nada', () => {
    expect(gastosIncomuns([gasto({ descricao: 'Uber', valor: 52, data: '2026-11-12' })], ant, '2026-11-14')).toEqual([]);
    expect(gastosIncomuns([gasto({ descricao: 'Uber', valor: 98, data: '2026-11-01' })], ant, '2026-11-14')).toEqual([]);
    expect(gastosIncomuns([gasto({ descricao: 'Uber', valor: 98, data: '2026-11-12' })], ant.slice(0, 2), '2026-11-14')).toEqual([]);
  });
});

describe('categoriasNoRitmo', () => {
  const cats = new Map([['m', { id: 'm', nome: 'Mercado', tipo: 'gasto', icone: '', cor: '' } as never]]);
  const ant = [{ categoria_id: 'm', valor: 600, data: '2026-09-10' }, { categoria_id: 'm', valor: 600, data: '2026-10-10' }];
  it('avisa antes de passar: 80% da média gasta e projeção ≥ 1,5×', () => {
    // 500 em 10 dias → 1.500 no mês; média 600
    expect(categoriasNoRitmo([{ categoria_id: 'm', valor: 500 }], ant, cats, '2026-11-01', '2026-11-10')).toHaveLength(1);
    expect(categoriasNoRitmo([{ categoria_id: 'm', valor: 300 }], ant, cats, '2026-11-01', '2026-11-10')).toHaveLength(0);
    expect(categoriasNoRitmo([{ categoria_id: 'm', valor: 500 }], ant, cats, '2026-11-01', '2026-11-05')).toHaveLength(0);
  });
});
