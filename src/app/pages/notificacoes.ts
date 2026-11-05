import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Comunicados } from '../core/comunicados';
import { mesAtual } from '../core/datas';
import { PrivPipe } from '../core/formato';
import { Insights } from '../core/insights';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';

@Component({
  imports: [RouterLink, Icon, PrivPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Notificações</h1></div>
      <nav class="seg">
        <button type="button" [class.on]="tab() === 'voce'" (click)="tab.set('voce')">Para você @if (i.naoLidas().length; as n) { <span class="n">{{ n }}</span> }</button>
        <button type="button" [class.on]="tab() === 'app'" (click)="tab.set('app')">Avisos do app @if (c.naoLidos().length; as n) { <span class="n">{{ n }}</span> }</button>
      </nav>

      @if (tab() === 'app') {
        <div class="lista">
          @for (a of c.lista(); track a.id) {
            <div class="card com">
              @if (a.tag; as t) { <span class="tag" [style.color]="t.cor" [style.background]="'color-mix(in srgb, ' + t.cor + ' 15%, transparent)'">{{ t.nome }}</span> }
              <div class="t">{{ a.titulo }}</div>
              <div class="small muted">{{ a.inicio | date: 'dd/MM' }}</div>
              <div class="s">{{ a.texto }}</div>
              @if (a.link) {
                @if (externo(a.link)) { <a class="small lk" [href]="a.link" target="_blank" rel="noopener">Abrir</a> }
                @else { <a class="small lk" [routerLink]="a.link">Abrir</a> }
              }
            </div>
          } @empty {
            <div class="card empty"><app-icon class="big" name="campaign" [size]="40" />Nenhum aviso do app</div>
          }
        </div>
      } @else {

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
              <div><div class="t">{{ a.titulo }}</div><div class="s">{{ a.texto | priv }}</div></div>
            </a>
          } @else {
            <div class="aviso" [class]="a.nivel">
              <app-icon class="i" [name]="a.icone" />
              <div><div class="t">{{ a.titulo }}</div><div class="s">{{ a.texto | priv }}</div></div>
            </div>
          }
        } @empty {
          @if (noMesAtual()) {
            <div class="card empty"><app-icon class="big" name="task_alt" [size]="40" />Tudo em dia por aqui</div>
          }
        }
      </div>
      }
    </div>
  `,
  styles: `
    .perm { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
    .lista { display: flex; flex-direction: column; gap: 8px; }
    .volta { margin-top: 8px; }
    .seg button .n { background: var(--danger); color: #fff; border-radius: 9px; font-size: 0.7rem; padding: 0 6px; margin-left: 4px; }
    .com { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
    .com .s { color: var(--ink-2); font-size: 0.9rem; white-space: pre-line; }
    .tag { font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
    .lk { color: var(--primary); font-weight: 700; }
  `,
})
export default class Notificacoes {
  protected i = inject(Insights);
  protected s = inject(Store);
  protected c = inject(Comunicados);
  readonly tab = signal<'voce' | 'app'>('voce');
  readonly aba = input<string>();
  protected externo = (l: string) => /^https?:\/\//i.test(l);
  protected atual = mesAtual();
  protected noMesAtual = computed(() => this.s.mes() === this.atual);

  constructor() {
    effect(() => this.tab.set(this.aba() === 'app' ? 'app' : 'voce'));
    effect(() => {
      this.i.avisos();
      untracked(() => this.i.marcarLidas());
    });
    effect(() => {
      const ids = this.tab() === 'app' ? this.c.naoLidos().map((x) => x.id) : [];
      untracked(() => this.c.marcarLidos(ids));
    });
  }
}
