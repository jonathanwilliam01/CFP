import { lerCodigo } from './boleto';

describe('lerCodigo', () => {
  it('boleto bancário: valor e vencimento pelo fator novo (após 22/02/2025)', () => {
    const linha = '0'.repeat(33) + '1500' + '0000012345';
    expect(lerCodigo(linha, '2026-11-07')).toEqual({ tipo: 'boleto', valor: 123.45, vencimento: '2026-07-07' });
  });

  it('código de barras de 44 dígitos', () => {
    const barras = '0019' + '0' + '1500' + '0000012345' + '0'.repeat(25);
    expect(lerCodigo(barras, '2026-11-07')?.valor).toBe(123.45);
  });

  it('convênio com valor em reais, ignorando os DVs da linha', () => {
    const barras = '8260' + '00000015099' + '0'.repeat(29);
    const linha = [0, 11, 22, 33].map((i) => barras.slice(i, i + 11) + '9').join(' ');
    expect(lerCodigo(linha, '2026-11-07')).toEqual({ tipo: 'convenio', valor: 150.99, vencimento: null });
  });

  it('Pix copia e cola com valor', () => {
    expect(lerCodigo('000201010212530398654051' + '0.505802BR6304ABCD', '2026-11-07')?.valor).toBe(10.5);
  });

  it('texto qualquer não é código', () => {
    expect(lerCodigo('chave@pix.com', '2026-11-07')).toBeNull();
  });
});
