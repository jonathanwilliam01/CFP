import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { deslogadoGuard, logadoGuard } from './core/auth';
import { Store } from './core/store';
import { Shell } from './layout/shell';

const carteiraGuard: CanActivateFn = async () => {
  const s = inject(Store);
  const router = inject(Router);
  if (s.carteira()) return true;
  return (await s.iniciar()) ? true : router.parseUrl('/bem-vindo');
};

export const routes: Routes = [
  { path: 'login', canActivate: [deslogadoGuard], loadComponent: () => import('./pages/login') },
  { path: 'bem-vindo', canActivate: [logadoGuard], loadComponent: () => import('./pages/bem-vindo') },
  {
    path: '',
    component: Shell,
    canActivate: [logadoGuard, carteiraGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/inicio'), title: 'CFP' },
      { path: 'gastos', loadComponent: () => import('./pages/gastos'), title: 'Gastos · CFP' },
      { path: 'contas', loadComponent: () => import('./pages/contas'), title: 'Contas · CFP' },
      { path: 'entradas', loadComponent: () => import('./pages/entradas'), title: 'Entradas · CFP' },
      { path: 'cartoes', loadComponent: () => import('./pages/cartoes'), title: 'Cartões · CFP' },
      { path: 'beneficios', loadComponent: () => import('./pages/beneficios'), title: 'Benefícios · CFP' },
      { path: 'parcelamentos', loadComponent: () => import('./pages/parcelamentos'), title: 'Parcelamentos · CFP' },
      { path: 'cofrinhos', loadComponent: () => import('./pages/cofrinhos'), title: 'Cofrinhos · CFP' },
      { path: 'cofrinhos/:id', loadComponent: () => import('./pages/cofrinho'), title: 'Cofrinho · CFP' },
      { path: 'orcamentos', loadComponent: () => import('./pages/orcamentos'), title: 'Orçamentos · CFP' },
      { path: 'planejamento', loadComponent: () => import('./pages/planejamento'), title: 'Planejamento · CFP' },
      { path: 'registros', loadComponent: () => import('./pages/registros'), title: 'Registros · CFP' },
      { path: 'registros/:id', loadComponent: () => import('./pages/registro'), title: 'Registro · CFP' },
      { path: 'relatorios', loadComponent: () => import('./pages/relatorios'), title: 'Relatórios · CFP' },
      { path: 'resumo', loadComponent: () => import('./pages/resumo'), title: 'Resumo mensal · CFP' },
      { path: 'notificacoes', loadComponent: () => import('./pages/notificacoes'), title: 'Notificações · CFP' },
      { path: 'config', loadComponent: () => import('./pages/config'), title: 'Configurações · CFP' },
      { path: 'novidades', loadComponent: () => import('./pages/novidades'), title: 'Novidades · CFP' },
      { path: 'mais', loadComponent: () => import('./pages/mais'), title: 'Mais · CFP' },
    ],
  },
  { path: '**', redirectTo: '' },
];
