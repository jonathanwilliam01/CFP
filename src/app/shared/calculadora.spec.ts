import { calcular } from './calculadora';

describe('calcular', () => {
  it('respeita × e ÷ antes de + e −', () => {
    expect(calcular('2+3×4')).toBe(14);
    expect(calcular('10−6÷3')).toBe(8);
    expect(calcular('12,5×2')).toBe(25);
  });

  it('porcentagem soma sobre o total ou vira fração', () => {
    expect(calcular('200+10%')).toBe(220);
    expect(calcular('100−10%')).toBe(90);
    expect(calcular('200×10%')).toBe(20);
    expect(calcular('50%')).toBe(0.5);
  });

  it('vazio, operador no fim e divisão por zero', () => {
    expect(calcular('')).toBeNull();
    expect(calcular('5+')).toBe(5);
    expect(calcular('−5+3')).toBe(-2);
    expect(calcular('1÷0')).toBeNull();
  });
});
