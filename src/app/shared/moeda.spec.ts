import { mascaraMoeda } from './moeda';

describe('mascaraMoeda', () => {
  it('dígitos entram pelos centavos', () => {
    expect(mascaraMoeda('3450')).toBe('34,50');
    expect(mascaraMoeda('56789')).toBe('567,89');
    expect(mascaraMoeda('5')).toBe('0,05');
    expect(mascaraMoeda('123456789')).toBe('1.234.567,89');
  });

  it('ignora o que não é número e zeros à esquerda', () => {
    expect(mascaraMoeda('0,05')).toBe('0,05');
    expect(mascaraMoeda('R$ 1.234,567')).toBe('12.345,67');
    expect(mascaraMoeda('')).toBe('');
    expect(mascaraMoeda('000')).toBe('');
  });

  it('sinal de menos deixa negativo', () => {
    expect(mascaraMoeda('-1990')).toBe('-19,90');
    expect(mascaraMoeda('-')).toBe('-');
  });
});
