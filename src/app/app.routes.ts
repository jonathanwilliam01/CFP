import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { deslogadoGuard, logadoGuard, suspensaGuard } from './core/auth';
import { conviteGuardado } from './core/convite';
import { Store } from './core/store';
import { Shell } from './layout/shell';

const carteiraGuard: CanActivateFn = async (_, state) => {
  const s = inject(Store);
  const router = inject(Router);
  const ok = s.carteira() || (await s.iniciar());
  if (!ok) return router.parseUrl('/bem-vindo');
  // convite aberto por quem já tem carteira: vai para Configurações com o código preenchido
  return conviteGuardado() && !state.url.startsWith('/config') ? router.parseUrl('/config') : true;
};

export const routes: Routes = [
  { path: 'apresentacao', canActivate: [deslogadoGuard], loadComponent: () => import('./pages/landing'), title: 'Controle Financeiro Pessoal' },
  { path: 'login', canActivate: [deslogadoGuard], loadComponent: () => import('./pages/login'), title: 'Entrar · Controle Financeiro Pessoal' },
  { path: 'nova-senha', canActivate: [logadoGuard], loadComponent: () => import('./pages/nova-senha'), title: 'Nova senha · Controle Financeiro Pessoal' },
  { path: 'bem-vindo', canActivate: [logadoGuard], loadComponent: () => import('./pages/bem-vindo'), title: 'Bem-vindo · Controle Financeiro Pessoal' },
  { path: 'suspensa', canActivate: [logadoGuard], loadComponent: () => import('./pages/suspensa'), title: 'Conta suspensa · Controle Financeiro Pessoal' },
  {
    path: '',
    component: Shell,
    canActivate: [logadoGuard, suspensaGuard, carteiraGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/inicio'), title: 'Controle Financeiro Pessoal' },
      { path: 'gastos', loadComponent: () => import('./pages/gastos'), title: 'Gastos · Controle Financeiro Pessoal' },
      { path: 'contas', loadComponent: () => import('./pages/contas'), title: 'Contas · Controle Financeiro Pessoal' },
      { path: 'entradas', loadComponent: () => import('./pages/entradas'), title: 'Entradas · Controle Financeiro Pessoal' },
      { path: 'cartoes', loadComponent: () => import('./pages/cartoes'), title: 'Cartões · Controle Financeiro Pessoal' },
      { path: 'saldos', loadComponent: () => import('./pages/saldos'), title: 'Saldos bancários · Controle Financeiro Pessoal' },
      { path: 'beneficios', loadComponent: () => import('./pages/beneficios'), title: 'Benefícios · Controle Financeiro Pessoal' },
      { path: 'parcelamentos', loadComponent: () => import('./pages/parcelamentos'), title: 'Parcelamentos · Controle Financeiro Pessoal' },
      { path: 'cofrinhos', loadComponent: () => import('./pages/cofrinhos'), title: 'Cofrinhos · Controle Financeiro Pessoal' },
      { path: 'cofrinhos/:id', loadComponent: () => import('./pages/cofrinho'), title: 'Cofrinho · Controle Financeiro Pessoal' },
      { path: 'orcamentos', loadComponent: () => import('./pages/orcamentos'), title: 'Orçamentos · Controle Financeiro Pessoal' },
      { path: 'planejamento', loadComponent: () => import('./pages/planejamento'), title: 'Planejamento · Controle Financeiro Pessoal' },
      { path: 'registros', loadComponent: () => import('./pages/registros'), title: 'Registros · Controle Financeiro Pessoal' },
      { path: 'registros/:id', loadComponent: () => import('./pages/registro'), title: 'Registro · Controle Financeiro Pessoal' },
      { path: 'relatorios', loadComponent: () => import('./pages/relatorios'), title: 'Relatórios · Controle Financeiro Pessoal' },
      { path: 'resumo', loadComponent: () => import('./pages/resumo'), title: 'Resumo mensal · Controle Financeiro Pessoal' },
      { path: 'importar', loadComponent: () => import('./pages/importar'), title: 'Importar · Controle Financeiro Pessoal' },
      { path: 'chat', loadComponent: () => import('./pages/chat'), title: 'Chat · Controle Financeiro Pessoal' },
      { path: 'notificacoes', loadComponent: () => import('./pages/notificacoes'), title: 'Notificações · Controle Financeiro Pessoal' },
      { path: 'config', loadComponent: () => import('./pages/config'), title: 'Configurações · Controle Financeiro Pessoal' },
      { path: 'calendario', loadComponent: () => import('./pages/calendario'), title: 'Calendário · Controle Financeiro Pessoal' },
      { path: 'fechamento', loadComponent: () => import('./pages/fechamento'), title: 'Fechamento do mês · Controle Financeiro Pessoal' },
      { path: 'novidades', loadComponent: () => import('./pages/novidades'), title: 'Novidades · Controle Financeiro Pessoal' },
      { path: 'mais', loadComponent: () => import('./pages/mais'), title: 'Mais · Controle Financeiro Pessoal' },
      { path: 'receber', loadComponent: () => import('./pages/receber'), title: 'A receber · Controle Financeiro Pessoal' },
      { path: 'dividas', loadComponent: () => import('./pages/dividas'), title: 'Dívidas · Controle Financeiro Pessoal' },
      { path: 'assinaturas', loadComponent: () => import('./pages/assinaturas'), title: 'Assinaturas · Controle Financeiro Pessoal' },
      { path: 'desafios', loadComponent: () => import('./pages/desafios'), title: 'Desafios · Controle Financeiro Pessoal' },
      { path: 'calculadoras', loadComponent: () => import('./pages/calculadoras'), title: 'Calculadoras · Controle Financeiro Pessoal' },
      { path: 'retrospectiva', loadComponent: () => import('./pages/retrospectiva'), title: 'Retrospectiva · Controle Financeiro Pessoal' },
      { path: 'inflacao', loadComponent: () => import('./pages/inflacao'), title: 'Inflação do casal · Controle Financeiro Pessoal' },
      { path: 'desejos', loadComponent: () => import('./pages/desejos'), title: 'Lista de desejos · Controle Financeiro Pessoal' },
      { path: 'viagens', loadComponent: () => import('./pages/viagens'), title: 'Viagens · Controle Financeiro Pessoal' },
      { path: 'imposto', loadComponent: () => import('./pages/imposto'), title: 'Imposto de Renda · Controle Financeiro Pessoal' },
    ],
  },
  { path: '**', redirectTo: '' },
];
