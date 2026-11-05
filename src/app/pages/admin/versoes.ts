import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Admin } from '../../core/admin';
import { parse } from '../../core/datas';
import { NOTAS, VERSAO } from '../../core/versao';
import { Icon } from '../../shared/icon';

@Component({
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Notas de versão</h2>
    @for (n of notas; track n.versao) {
      <div class="c">
        <div class="head">
          <h3>{{ n.versao }}</h3>
          @if (n.versao === atual) { <span class="badge ok">Atual</span> }
          <span class="usu">{{ usuarios()[n.versao] ?? 0 }} usuário(s) nesta versão</span>
        </div>
        <p class="note">{{ data(n.data) }}</p>
        <ul>
          @for (i of n.itens; track i) {
            <li>{{ i }}</li>
          }
        </ul>
        <a class="btn" routerLink="/admin/avisos" [queryParams]="{ novo: 'versao', v: n.versao }"><app-icon name="add" [size]="16" />Criar aviso desta versão</a>
      </div>
    }
  `,
  styles: `
    h2 { margin: 0 0 18px; font-size: 20px; }
    .c { background: var(--card); border-radius: var(--radius); padding: 14px; box-shadow: var(--shadow); margin-bottom: 12px; }
    .head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    h3 { margin: 0; font-size: 16px; }
    .usu { margin-left: auto; font-size: 12px; color: var(--ink-2); }
    .note { font-size: 12px; color: var(--ink-3); margin: 4px 0 0; }
    ul { margin: 10px 0 12px; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  `,
})
export default class AdminVersoes {
  private admin = inject(Admin);
  protected notas = NOTAS;
  protected atual = VERSAO;
  protected usuarios = signal<Record<string, number>>({});

  constructor() {
    this.admin.metricas(7).then(
      (m) => this.usuarios.set(Object.fromEntries(m.versoes.map((v) => [v.versao, v.n]))),
      () => undefined,
    );
  }

  protected data(d: string) {
    return parse(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  }
}
