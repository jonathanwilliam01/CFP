import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Icon } from '../../shared/icon';
import { NOTAS } from '../../core/versao';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside>
      <div class="logo">CFP Admin<small>{{ versao }}</small></div>
      <nav>
        @for (i of itens; track i.rota) {
          <a [routerLink]="i.rota" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: i.rota === '/admin' }" [title]="i.nome">
            <app-icon [name]="i.icone" [size]="20" /><span class="nome">{{ i.nome }}</span>
          </a>
        }
        <span class="lock" aria-disabled="true" title="Assinaturas (em breve)"><app-icon name="workspace_premium" [size]="20" /><span class="nome">Assinaturas</span><em class="nome">em breve</em></span>
      </nav>
      <a class="voltar" routerLink="/" title="Voltar ao app"><app-icon name="arrow_back" [size]="20" /><span class="nome">Voltar ao app</span></a>
    </aside>
    <main><router-outlet /></main>
  `,
  styles: `
    :host { display: flex; min-height: 100dvh; background: var(--bg); color: var(--ink); }
    aside { width: 230px; flex-shrink: 0; background: #141b2b; color: #c8d0de; padding: 18px 12px; display: flex; flex-direction: column; gap: 2px; position: sticky; top: 0; height: 100dvh; }
    .logo { color: #fff; font-weight: 700; font-size: 15px; padding: 4px 10px 18px; }
    .logo small { display: block; font-weight: 400; color: #8a94a8; font-size: 11px; }
    nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    a, .lock { display: flex; gap: 10px; align-items: center; padding: 9px 10px; border-radius: 10px; font-size: 14px; color: inherit; text-decoration: none; }
    a:hover { background: #ffffff14; }
    a.on { background: var(--primary); color: var(--primary-ink); }
    .lock { opacity: 0.45; cursor: not-allowed; }
    .lock em { margin-left: auto; font-style: normal; font-size: 10px; background: #ffffff22; padding: 2px 6px; border-radius: 6px; }
    main { flex: 1; min-width: 0; padding: 22px 26px; }
    @media (max-width: 900px) {
      aside { width: 60px; padding: 14px 8px; }
      .logo { display: none; }
      .nome { display: none; }
      a, .lock { justify-content: center; }
      main { padding: 16px; }
    }
  `,
})
export default class AdminLayout {
  protected versao = NOTAS[0].versao;
  protected itens = [
    { nome: 'Visão geral', icone: 'monitoring', rota: '/admin' },
    { nome: 'Usuários', icone: 'group', rota: '/admin/usuarios' },
    { nome: 'Funções', icone: 'toggle_on', rota: '/admin/funcoes' },
    { nome: 'Central de avisos', icone: 'campaign', rota: '/admin/avisos' },
    { nome: 'Erros e saúde', icone: 'bug_report', rota: '/admin/saude' },
    { nome: 'Notas de versão', icone: 'new_releases', rota: '/admin/versoes' },
    { nome: 'Auditoria', icone: 'history', rota: '/admin/auditoria' },
  ];
}
