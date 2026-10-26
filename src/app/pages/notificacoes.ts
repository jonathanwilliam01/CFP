import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { mesAtual } from '../core/datas';
import { Insights } from '../core/insights';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';

@Component({
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Notificações</h1></div>

      @if (i.permissao() !== 'granted') {
        <section class="card perm">
          <div>
            <h3>Avisos no celular</h3>
            <p class="small muted">
              @if (i.permissao() === 'denied') {
                Notificações bloqueadas. Libere nas configurações do navegador para este site.
              } @else {
                Receba avisos de contas vencendo, orçamentos estourados e faturas fechando.
              }
            </p>
          </div>
          @if (i.permissao() !== 'denied') {
            <button class="btn sm" type="button" (click)="i.pedirPermissao()">Ativar</button>
          }
        </section>
      }

      @if (!noMesAtual()) {
        <div class="aviso info">
          <span class="i">ℹ️</span>
          <div><div class="t">Avisos só do mês atual</div><div class="s">Volte para o mês atual para ver os avisos.</div>
            <button class="btn ghost sm volta" type="button" (click)="s.mes.set(atual)">Ir para o mês atual</button></div>
        </div>
      }

      <div class="lista">
        @for (a of i.avisos(); track a.id) {
          @if (a.link) {
            <a class="aviso" [class]="a.nivel" [routerLink]="a.link">
              <app-icon class="i" [name]="a.icone" />
              <div><div class="t">{{ a.titulo }}</div><div class="s">{{ a.texto }}</div></div>
            </a>
          } @else {
            <div class="aviso" [class]="a.nivel">
              <app-icon class="i" [name]="a.icone" />
              <div><div class="t">{{ a.titulo }}</div><div class="s">{{ a.texto }}</div></div>
            </div>
          }
        } @empty {
          @if (noMesAtual()) {
            <div class="card empty"><app-icon class="big" name="task_alt" [size]="40" />Tudo em dia por aqui</div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .perm { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
    .lista { display: flex; flex-direction: column; gap: 8px; }
    .volta { margin-top: 8px; }
  `,
})
export default class Notificacoes {
  protected i = inject(Insights);
  protected s = inject(Store);
  protected atual = mesAtual();
  protected noMesAtual = computed(() => this.s.mes() === this.atual);

  constructor() {
    effect(() => {
      this.i.avisos();
      untracked(() => this.i.marcarLidas());
    });
  }
}
