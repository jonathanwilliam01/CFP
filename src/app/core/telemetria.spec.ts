import { describe, expect, it, vi } from 'vitest';
import { ErroGlobal, aparelho, deveRegistrar, deveReportar, resumoErro } from './telemetria';
import { supabase } from './supabase';

describe('telemetria', () => {
  it('aparelho', () => {
    expect(aparelho('Mozilla/5.0 (iPhone; CPU iPhone OS 17)', true)).toBe('celular · app');
    expect(aparelho('Mozilla/5.0 (X11; Linux x86_64)', false)).toBe('desktop · navegador');
  });

  it('deveRegistrar', () => {
    expect(deveRegistrar('u:2026-11-05', 'u', '2026-11-05')).toBe(false);
    expect(deveRegistrar(null, 'u', '2026-11-05')).toBe(true);
  });

  it('resumoErro limita tamanho', () => {
    expect(resumoErro(new Error('x'.repeat(900))).mensagem.length).toBe(500);
    expect(resumoErro('texto').mensagem).toBe('texto');
  });

  it('deveReportar: sem repetir e até 10 por sessão', () => {
    const s = new Set<string>();
    expect(deveReportar(s, 'a')).toBe(true);
    expect(deveReportar(s, 'a')).toBe(false);
    for (let i = 0; i < 9; i++) expect(deveReportar(s, 'm' + i)).toBe(true);
    expect(deveReportar(s, 'outra')).toBe(false);
  });

  it('handleError envia a mesma mensagem uma vez só', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: null } as never);
    const h = new ErroGlobal();
    h.handleError(new Error('igual'));
    h.handleError(new Error('igual'));
    expect(rpc).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('handleError não lança com rpc rejeitada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(supabase, 'rpc').mockRejectedValue(new Error('x'));
    expect(() => new ErroGlobal().handleError(new Error('boom'))).not.toThrow();
    await Promise.resolve();
  });
});
