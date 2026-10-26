import { addMeses, diaNoMes, mesFatura, mesesEntre } from './datas';

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
      expect(mesFatura('2026-10-05', 10, 20)).toBe('2026-10-01');
    });
    it('no dia do fechamento ou depois cai na seguinte', () => {
      expect(mesFatura('2026-10-10', 10, 20)).toBe('2026-11-01');
      expect(mesFatura('2026-10-25', 10, 20)).toBe('2026-11-01');
    });
    it('vencimento antes do fechamento empurra um mês', () => {
      expect(mesFatura('2026-10-05', 25, 5)).toBe('2026-11-01');
      expect(mesFatura('2026-10-26', 25, 5)).toBe('2026-12-01');
    });
  });
});
