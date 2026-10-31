import { addDias, addMeses, diaNoMes, fechamentoFatura, inicioFatura, mesFatura, mesesEntre } from './datas';

const fixo = (fechamento_dia: number, vencimento_dia: number) => ({ fechamento_dia, vencimento_dia, fecha_dias: null });
const dias = (vencimento_dia: number, fecha_dias: number) => ({ fechamento_dia: 1, vencimento_dia, fecha_dias });

describe('datas', () => {
  it('addMeses ajusta o dia em mês curto', () => {
    expect(addMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMeses('2026-03-15', -3)).toBe('2025-12-15');
  });

  it('diaNoMes limita ao último dia', () => {
    expect(diaNoMes('2026-02-01', 31)).toBe('2026-02-28');
    expect(diaNoMes('2026-04-01', 10)).toBe('2026-04-10');
  });

  it('mesesEntre conta virada de ano', () => {
    expect(mesesEntre('2025-11-01', '2026-02-01')).toBe(3);
  });

  describe('mesFatura (mesma regra de calc_fatura)', () => {
    it('antes do fechamento cai na fatura que vence no mês', () => {
      expect(mesFatura('2026-10-05', fixo(10, 20))).toBe('2026-10-01');
    });
    it('no dia do fechamento ou depois cai na seguinte', () => {
      expect(mesFatura('2026-10-10', fixo(10, 20))).toBe('2026-11-01');
      expect(mesFatura('2026-10-25', fixo(10, 20))).toBe('2026-11-01');
    });
    it('vencimento antes do fechamento empurra um mês', () => {
      expect(mesFatura('2026-10-05', fixo(25, 5))).toBe('2026-11-01');
      expect(mesFatura('2026-10-26', fixo(25, 5))).toBe('2026-12-01');
    });
  });

  it('inicioFatura é o primeiro dia que cai na fatura', () => {
    for (const [fech, venc] of [[1, 7], [10, 20], [25, 5], [30, 7], [31, 7]]) {
      const ini = inicioFatura('2026-11-01', fixo(fech, venc));
      expect(mesFatura(ini, fixo(fech, venc))).toBe('2026-11-01');
      expect(mesFatura(addDias(ini, -1), fixo(fech, venc))).toBe('2026-10-01');
    }
    expect(inicioFatura('2026-11-01', fixo(1, 7))).toBe('2026-10-01');
  });

  describe('fechamento em dias antes do vencimento (Nubank)', () => {
    const nu = dias(7, 7);
    it('o dia do fechamento muda conforme o mês', () => {
      expect(fechamentoFatura('2026-11-01', nu)).toBe('2026-10-31');
      expect(fechamentoFatura('2026-12-01', nu)).toBe('2026-11-30');
      expect(fechamentoFatura('2027-03-01', nu)).toBe('2027-02-28');
    });
    it('compra no dia do fechamento vai para a fatura seguinte', () => {
      expect(mesFatura('2026-10-30', nu)).toBe('2026-11-01');
      expect(mesFatura('2026-10-31', nu)).toBe('2026-12-01');
      expect(mesFatura('2026-11-29', nu)).toBe('2026-12-01');
      expect(mesFatura('2026-11-30', nu)).toBe('2027-01-01');
    });
    it('vencimento no meio do mês', () => {
      expect(mesFatura('2026-10-19', dias(27, 7))).toBe('2026-10-01');
      expect(mesFatura('2026-10-20', dias(27, 7))).toBe('2026-11-01');
    });
    it('inicioFatura é o primeiro dia que cai na fatura', () => {
      for (const c of [nu, dias(1, 8), dias(10, 7), dias(31, 10)])
        for (const mes of ['2026-02-01', '2026-03-01', '2026-11-01']) {
          const ini = inicioFatura(mes, c);
          expect(mesFatura(ini, c)).toBe(mes);
          expect(mesFatura(addDias(ini, -1), c)).toBe(addMeses(mes, -1));
        }
    });
  });
});
