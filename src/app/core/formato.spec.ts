import { parseValor } from './formato';

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
