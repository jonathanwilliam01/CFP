import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapearFaltando, migracoesFaltando } from './migracoes';
import { supabase } from './supabase';

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

describe('migracoesFaltando', () => {
  afterEach(() => vi.restoreAllMocks());
  it('rejeita quando a rpc falha', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: { message: 'x' } } as never);
    await expect(migracoesFaltando()).rejects.toThrow('x');
  });
  it('lista o que falta', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: ['suspensos.user_id'], error: null } as never);
    expect(await migracoesFaltando()).toEqual([{ migracao: '039', itens: ['suspensos.user_id'] }]);
  });
});
