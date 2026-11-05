import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { Admin } from './admin';
import { Auth } from './auth';
import { FuncaoStatus } from './models';
import { funcaoGuard, Funcoes } from './funcoes';

@Component({ template: '' })
class Vazio {}

function montar(eAdmin: boolean) {
  const status = signal<Record<string, FuncaoStatus>>({ importar: { chave: 'importar', ativa: false, mensagem: null, desde: null } });
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: '',
          canActivateChild: [funcaoGuard],
          children: [
            { path: 'importar', component: Vazio },
            { path: 'manutencao/:chave', component: Vazio },
            { path: 'gastos', component: Vazio },
          ],
        },
      ]),
      { provide: Funcoes, useValue: { aguardar: () => Promise.resolve(), status } },
      { provide: Admin, useValue: { eAdmin: signal(eAdmin), aguardar: () => Promise.resolve(eAdmin) } },
      { provide: Auth, useValue: {} },
    ],
  });
  return TestBed.inject(Router);
}

describe('funcaoGuard no router', () => {
  it('função desligada leva não-admin para manutenção', async () => {
    const router = montar(false);
    await router.navigateByUrl('/importar');
    expect(router.url).toBe('/manutencao/importar');
  });

  it('admin passa pela função desligada', async () => {
    const router = montar(true);
    await router.navigateByUrl('/importar');
    expect(router.url).toBe('/importar');
  });

  it('rota sem função sempre passa', async () => {
    const router = montar(false);
    expect(await router.navigateByUrl('/gastos')).toBe(true);
    expect(router.url).toBe('/gastos');
  });
});
