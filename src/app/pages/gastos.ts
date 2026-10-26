import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BrlPipe, DiaPipe, soma } from '../core/formato';
import { Gasto } from '../core/models';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';

type Filtro = 'todos' | 'debito' | 'cartao' | 'beneficio';

@Component({
  imports: [FormsModule, RouterLink, BrlPipe, DiaPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Gastos</h1>
        <div class="acts">
          <a class="btn ghost sm" routerLink="/importar"><app-icon name="upload_file" [size]="16" />Importar Nubank</a>
          <button class="btn sm" (click)="lancar.novo()"><app-icon name="add" [size]="16" />Novo</button>
        </div>
      </div>

      <label class="busca">
        <app-icon name="search" [size]="18" />
        <input placeholder="Buscar" [ngModel]="busca()" (ngModelChange)="busca.set($event)" />
      </label>

      <div class="chips">
        @for (o of opcoes; track o.k) {
          <button class="chip" [class.on]="filtro() === o.k" (click)="filtro.set(o.k)">@if (o.i) {<app-icon [name]="o.i" [size]="18" />}{{ o.r }}</button>
        }
      </div>
      <select aria-label="Categoria" [ngModel]="cat()" (ngModelChange)="cat.set($event)">
        <option [ngValue]="null">Todas as categorias</option>
        @for (c of s.catGasto(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
      </select>

      <div class="total card">
        <span class="muted">{{ lista().length }} gasto(s)</span>
        <b class="num">{{ total() | brl }}</b>
      </div>

      @for (d of dias(); track d.data) {
        <div class="day-label">{{ d.data | dia }} · <span class="num">{{ d.total | brl }}</span></div>
        <section class="card list">
          @for (g of d.itens; track g.id) {
            <button class="row" (click)="lancar.editarGasto(g)">
              <span class="ico" [style.background]="(cat_(g)?.cor ?? '#94a3b8') + '22'" [style.color]="(cat_(g)?.cor ?? '#94a3b8')"><app-icon [name]="cat_(g)?.icone ?? 'help'" /></span>
              <div class="grow">
                <div class="t">{{ g.descricao }}</div>
                <div class="s">{{ cat_(g)?.nome ?? 'Sem categoria' }} · {{ forma(g) }}{{ quem(g) }}</div>
              </div>
              <span class="v" [class.benef]="g.forma === 'beneficio'">{{ g.valor | brl }}</span>
            </button>
          }
        </section>
      } @empty {
        <div class="empty"><app-icon class="big" name="search_off" [size]="40" />Nenhum gasto encontrado.</div>
      }
    </div>
  `,
  styles: `
    .acts { display: flex; gap: 8px; }
    .busca { display: flex; align-items: center; gap: 8px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 0 12px; color: var(--ink-3); }
    .busca input { border: 0; background: none; box-shadow: none; padding: 10px 0; }
    .total { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; }
    .total b { font-size: 1.15rem; }
    .list { padding-top: 4px; padding-bottom: 4px; }
    .benef { color: var(--ink-3); }
  `,
})
export default class Gastos {
  protected s = inject(Store);
  protected lancar = inject(Lancar);

  protected opcoes: { k: Filtro; r: string; i?: string }[] = [
    { k: 'todos', r: 'Todos' },
    { k: 'cartao', r: 'Cartão', i: 'credit_card' },
    { k: 'debito', r: 'À vista', i: 'payments' },
    { k: 'beneficio', r: 'Benefício', i: 'restaurant' },
  ];
  protected filtro = signal<Filtro>('todos');
  protected cat = signal<string | null>(null);
  protected busca = signal('');

  protected lista = computed(() => {
    const b = this.busca().trim().toLowerCase();
    return this.s.gastosMes().filter(
      (g) =>
        (this.filtro() === 'todos' || g.forma === this.filtro()) &&
        (!this.cat() || g.categoria_id === this.cat()) &&
        (!b || g.descricao.toLowerCase().includes(b)),
    );
  });

  protected total = computed(() => soma(this.lista(), (g) => g.valor));

  protected dias = computed(() => {
    const m = new Map<string, Gasto[]>();
    for (const g of this.lista()) m.set(g.data, [...(m.get(g.data) ?? []), g]);
    return [...m.entries()].map(([data, itens]) => ({ data, itens, total: soma(itens, (g) => g.valor) }));
  });

  cat_(g: Gasto) {
    return g.categoria_id ? this.s.catMap().get(g.categoria_id) : undefined;
  }

  forma(g: Gasto) {
    if (g.forma === 'cartao') return this.s.cartoes().find((c) => c.id === g.cartao_id)?.nome ?? 'Cartão';
    if (g.forma === 'beneficio') return this.s.beneficios().find((b) => b.id === g.beneficio_id)?.nome ?? 'Benefício';
    return 'À vista';
  }

  quem(g: Gasto) {
    if (this.s.membros().length < 2 || !g.criado_por) return '';
    return ' · ' + (this.s.membroMap().get(g.criado_por) ?? '');
  }
}
