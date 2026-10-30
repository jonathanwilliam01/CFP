import { ChangeDetectionStrategy, Component, computed, effect, inject, output, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { mesAtual } from '../core/datas';
import { Insights } from '../core/insights';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';

const MAX = 6;

/** Avisos abertos pelo sino do topo: os primeiros e o link para a tela completa */
@Component({
  selector: 'app-avisos',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cab">
      <h2>Notificações</h2>
      <a routerLink="/notificacoes" class="small" (click)="fechar.emit()">Ver todas</a>
    </div>
    @if (s.mes() !== atual) {
      <p class="small muted">Avisos só do mês atual. <button type="button" class="lk" (click)="s.mes.set(atual)">Ir para o mês atual</button></p>
    }
    @for (a of lista(); track a.id) {
      @if (a.link) {
        <a class="aviso" [class]="a.nivel" [routerLink]="a.link" (click)="fechar.emit()">
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
      @if (s.mes() === atual) {
        <div class="empty"><app-icon class="big" name="task_alt" [size]="36" />Tudo em dia por aqui</div>
      }
    }
    @if (resto(); as n) {
      <a routerLink="/notificacoes" class="btn ghost sm" (click)="fechar.emit()">Mais {{ n }} aviso(s)</a>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; }
    .cab { display: flex; justify-content: space-between; align-items: center; padding: 2px 4px; }
    .cab h2 { font-size: 1rem; }
    .lk { border: 0; background: none; padding: 0; font: inherit; color: var(--primary); font-weight: 700; cursor: pointer; }
    .empty { padding: 16px; }
  `,
})
export class Avisos {
  protected i = inject(Insights);
  protected s = inject(Store);
  readonly fechar = output();
  protected atual = mesAtual();
  protected lista = computed(() => this.i.avisos().slice(0, MAX));
  protected resto = computed(() => Math.max(this.i.avisos().length - MAX, 0));

  constructor() {
    effect(() => {
      this.i.avisos();
      untracked(() => this.i.marcarLidas());
    });
  }
}
