import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Auth, traduz } from './auth';
import { Push } from './push';
import { supabase } from './supabase';

describe('Auth', () => {
  afterEach(() => vi.restoreAllMocks());

  it('traduz conta banida', () => {
    expect(traduz('User is banned')).toBe('Conta suspensa. Fale com o suporte.');
  });

  it('suspensão no meio da sessão: confere ao voltar para o app', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: { user: { id: 'u' } } }, error: null } as never);
    vi.spyOn(supabase.auth, 'onAuthStateChange').mockReturnValue({ data: { subscription: { unsubscribe() {} } } } as never);
    const rpc = vi
      .spyOn(supabase, 'rpc')
      .mockResolvedValueOnce({ data: false, error: null } as never)
      .mockResolvedValue({ data: true, error: null } as never);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: Push, useValue: {} }] });
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const auth = TestBed.inject(Auth);
    await auth.aguardar();
    TestBed.tick();
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(auth.suspensa()).toBe(false);

    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(auth.suspensa()).toBe(true));
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(nav).toHaveBeenCalledWith('/suspensa');
  });
});
