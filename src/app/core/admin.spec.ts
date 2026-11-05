import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Admin, adminGuard } from './admin';
import { Auth, suspensaGuard } from './auth';
import { supabase } from './supabase';

function fakeAuth(u: unknown) {
  const user = signal(u as { id: string } | null);
  return { aguardar: () => Promise.resolve(), user, uid: computed(() => user()?.id ?? null) };
}

function rodar(user: unknown, eAdmin?: boolean) {
  const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: eAdmin, error: null } as never);
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: Auth, useValue: fakeAuth(user) }],
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

describe('Admin.eAdmin', () => {
  afterEach(() => vi.restoreAllMocks());

  it('não reinicia quando a sessão muda com o mesmo uid', async () => {
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: true, error: null } as never);
    const auth = fakeAuth({ id: 'u' });
    TestBed.configureTestingModule({ providers: [{ provide: Auth, useValue: auth }] });
    const admin = TestBed.inject(Admin);
    TestBed.tick();
    await vi.waitFor(() => expect(admin.eAdmin()).toBe(true));
    auth.user.set({ id: 'u' });
    TestBed.tick();
    expect(admin.eAdmin()).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('suspensaGuard', () => {
  afterEach(() => vi.restoreAllMocks());

  function rodarSus(suspenso: boolean | Error) {
    const fake = { aguardar: () => Promise.resolve(), suspenso: () => (suspenso instanceof Error ? Promise.reject(suspenso) : Promise.resolve(suspenso)) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: Auth, useValue: fake }] });
    return { r: TestBed.runInInjectionContext(() => suspensaGuard({} as never, {} as never)) as Promise<boolean | UrlTree>, router: TestBed.inject(Router) };
  }

  it('suspenso vai para /suspensa', async () => {
    const { r, router } = rodarSus(true);
    expect(router.serializeUrl((await r) as UrlTree)).toBe('/suspensa');
  });
  it('não suspenso passa', async () => {
    expect(await rodarSus(false).r).toBe(true);
  });
});
