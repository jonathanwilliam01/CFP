import { describe, expect, it } from 'vitest';
import { bloqueio, destinoManutencao, FUNCOES, funcaoDaRota } from './funcoes';
import { FuncaoStatus } from './models';

const off: Record<string, FuncaoStatus> = { importar: { chave: 'importar', ativa: false, mensagem: 'm', desde: null } };

describe('funcoes', () => {
  it('funcaoDaRota ignora query e subrota', () => {
    expect(funcaoDaRota('/cofrinhos/abc?x=1')?.chave).toBe('cofrinhos');
    expect(funcaoDaRota('/cofrinhos#a')?.chave).toBe('cofrinhos');
  });
  it('rota sem função', () => {
    expect(funcaoDaRota('/gastos')).toBeNull();
    expect(funcaoDaRota('/cofrinhosx')).toBeNull();
  });
  it('bloqueio', () => {
    expect(bloqueio('/importar', off, false)?.mensagem).toBe('m');
    expect(bloqueio('/importar', off, true)).toBeNull();
    expect(bloqueio('/importar', {}, false)).toBeNull();
    expect(bloqueio('/gastos', off, false)).toBeNull();
  });

  it('destinoManutencao', () => {
    const fn = FUNCOES.find((x) => x.chave === 'importar');
    const on = { chave: 'importar', ativa: true, mensagem: null, desde: null };
    expect(destinoManutencao(undefined, off['importar'], false)).toBe('/');
    expect(destinoManutencao(fn, off['importar'], false)).toBeNull();
    expect(destinoManutencao(fn, off['importar'], null)).toBeNull();
    expect(destinoManutencao(fn, off['importar'], true)).toBe('/importar');
    expect(destinoManutencao(fn, on, false)).toBe('/importar');
    expect(destinoManutencao(fn, undefined, false)).toBe('/importar');
  });
});
