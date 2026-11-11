import { semanasDoAno, squarify } from './graficos';

describe('squarify', () => {
  const itens = [6, 6, 4, 3, 2, 2, 1].map((valor, i) => ({ nome: String(i), valor }));

  it('cobre a área toda, sem sobrepor e com área proporcional ao valor', () => {
    const r = squarify(itens, 6, 4);
    expect(r.length).toBe(7);
    const area = r.reduce((a, x) => a + x.w * x.h, 0);
    expect(area).toBeCloseTo(24, 6);
    for (const x of r) {
      expect(x.w * x.h).toBeCloseTo(x.item.valor, 6);
      expect(x.x + x.w).toBeLessThanOrEqual(6 + 1e-9);
      expect(x.y + x.h).toBeLessThanOrEqual(4 + 1e-9);
    }
    for (const a of r)
      for (const b of r) {
        if (a === b) continue;
        const sobrepoe = a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
        expect(sobrepoe).toBe(false);
      }
  });

  it('ignora zero e negativo; vazio sem área', () => {
    expect(squarify([{ valor: 0 }, { valor: -2 }, { valor: 5 }], 3, 2)).toEqual([{ item: { valor: 5 }, x: 0, y: 0, w: 3, h: 2 }]);
    expect(squarify([], 3, 2)).toEqual([]);
  });

  it('blocos não ficam finos demais', () => {
    const r = squarify(itens, 6, 4);
    for (const x of r) expect(Math.max(x.w / x.h, x.h / x.w)).toBeLessThan(4);
  });
});

describe('semanasDoAno', () => {
  it('2026 começa numa quinta e tem 53 semanas', () => {
    const { colunas, meses } = semanasDoAno(2026);
    expect(colunas.length).toBe(53);
    expect(colunas[0]).toEqual([null, null, null, null, '2026-01-01', '2026-01-02', '2026-01-03']);
    expect(colunas.flat().filter(Boolean).length).toBe(365);
    expect(colunas.at(-1)![4]).toBe('2026-12-31');
    expect(meses.length).toBe(12);
    expect(meses[0]).toEqual({ col: 0, mes: '2026-01-01' });
    expect(meses[1]).toEqual({ col: 5, mes: '2026-02-01' });
  });

  it('ano bissexto começando no sábado ocupa 54 colunas', () => {
    expect(semanasDoAno(2028).colunas.length).toBe(54);
  });
});
