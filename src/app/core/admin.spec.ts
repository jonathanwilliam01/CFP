import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminGuard } from './admin';
import { Auth } from './auth';
import { supabase } from './supabase';

function rodar(user: unknown, eAdmin?: boolean) {
  const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: eAdmin, error: null } as never);
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: Auth, useValue: { aguardar: () => Promise.resolve(), user: signal(user) } }],
  });
  const r = TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never)) as Promise<boolean | UrlTree>;
  return { r, rpc, router: TestBed.inject(Router) };
}

describe('adminGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sem usuário vai para /', async () => {
    const { r, router, rpc } = rodar(null);
    expect(router.serializeUrl((await r) as UrlTree)).toBe('/');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('não admin vai para /', async () => {
    const { r, router } = rodar({ id: 'u' }, false);
    expect(router.serializeUrl((await r) as UrlTree)).toBe('/');
  });
  it('admin passa', async () => {
    const { r } = rodar({ id: 'u' }, true);
    expect(await r).toBe(true);
  });
});
