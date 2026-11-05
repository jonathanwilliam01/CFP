import { describe, expect, it } from 'vitest';
import { mapearFaltando } from './migracoes';

describe('mapearFaltando', () => {
  const marcas = { '039': ['a', 'b'], '040': ['c'], '041': ['d'] };
  it('mapeia itens faltando para a migration', () => {
    expect(mapearFaltando(marcas, new Set(['b', 'd']))).toEqual([
      { migracao: '039', itens: ['b'] },
      { migracao: '041', itens: ['d'] },
    ]);
  });
  it('nada faltando', () => expect(mapearFaltando(marcas, new Set())).toEqual([]));
});
