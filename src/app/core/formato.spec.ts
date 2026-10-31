import { parseValor, bateValor } from './formato';

describe('parseValor', () => {
  it('entende vírgula decimal e ponto de milhar', () => {
    expect(parseValor('12,50')).toBe(12.5);
    expect(parseValor('1.234,56')).toBe(1234.56);
    expect(parseValor('3.000')).toBe(3000);
    expect(parseValor('1.250.000')).toBe(1250000);
    expect(parseValor('12.5')).toBe(12.5);
    expect(parseValor('12.50')).toBe(12.5);
    expect(parseValor('R$ 99')).toBe(99);
  });
});

describe('bateValor', () => {
  it('com centavos bate exato, só reais bate pela parte inteira', () => {
    expect(bateValor(49.9, '49,90')).toBe(true);
    expect(bateValor(49.9, 'R$ 49,9')).toBe(true);
    expect(bateValor(49.95, '49,90')).toBe(false);
    expect(bateValor(49.95, '49')).toBe(true);
    expect(bateValor(490, '49')).toBe(false);
    expect(bateValor(1200, '1.200')).toBe(true);
    expect(bateValor(-80, '80')).toBe(true);
    expect(bateValor(10, 'mercado')).toBe(false);
  });
});
