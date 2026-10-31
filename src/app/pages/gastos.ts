import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { hoje } from '../core/datas';
import { duplicados } from '../core/financas';
import { q, supabase } from '../core/supabase';
import { BrlPipe, DiaPipe, bateValor, soma } from '../core/formato';
import { normalizar } from '../core/texto';
import { Gasto } from '../core/models';
import { Store } from '../core/store';
import { AcaoDeslizar, Deslizar } from '../shared/deslizar';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';
import { Toast } from '../shared/toast';

type Filtro = 'todos' | 'debito' | 'cartao' | 'beneficio';

@Component({
  imports: [FormsModule, RouterLink, BrlPipe, DiaPipe, Icon, Deslizar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Gastos</h1>
        <div class="acts">
          <a class="btn ghost sm" routerLink="/importar"><app-icon name="upload_file" [size]="16" />Importar</a>
          <button class="btn sm" (click)="lancar.novo('gasto')"><app-icon name="add" [size]="16" />Novo</button>
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
      @if (filtro() === 'cartao' && s.cartoes().length > 1) {
        <div class="chips">
          <button class="chip" [class.on]="!cartao()" (click)="cartao.set(null)">Todos os cartões</button>
          @for (c of s.cartoes(); track c.id) {
            <button class="chip" [class.on]="cartao() === c.id" (click)="cartao.set(c.id)">{{ c.nome }}</button>
          }
        </div>
      }
      @if (tags().length) {
        <div class="chips">
          @for (t of tags(); track t) {
            <button class="chip" [class.on]="tag() === t" (click)="tag.set(tag() === t ? null : t)">#{{ t }}</button>
          }
        </div>
      }
      <select aria-label="Categoria" [ngModel]="cat()" (ngModelChange)="cat.set($event)">
        <option [ngValue]="null">Todas as categorias</option>
        @for (c of s.catGasto(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
      </select>

      @if (dups().length) {
        <section class="card dups">
          <div class="card-head"><h2><app-icon name="content_copy" [size]="18" />Possíveis duplicados</h2><span class="badge">{{ dups().length }}</span></div>
          <p class="small muted">Mesmo valor e descrição com até 1 dia de diferença. Exclua o repetido ou confirme que são dois gastos.</p>
          @for (p of dups(); track p[0].id + p[1].id) {
            <div class="dup">
              <div class="grow">
                <div class="t">{{ p[0].descricao }} · <span class="num">{{ p[0].valor | brl }}</span></div>
                <div class="s">{{ p[0].data | dia }} ({{ forma(p[0]) }}{{ quem(p[0]) }}) e {{ p[1].data | dia }} ({{ forma(p[1]) }}{{ quem(p[1]) }})</div>
              </div>
              <div class="bts">
                <button class="btn ghost sm" type="button" (click)="excluir(p[1])">Excluir um</button>
                <button class="btn sm" type="button" (click)="manter(p)" [disabled]="ocupado()">Manter os dois</button>
              </div>
            </div>
          }
        </section>
      }

      <div class="total card">
        <span class="muted">{{ lista().length }} gasto(s)</span>
        <b class="num">{{ total() | brl }}</b>
      </div>

      @for (d of dias(); track d.data) {
        <div class="day-label">{{ d.data | dia }} · <span class="num">{{ d.total | brl }}</span></div>
        <section class="card list">
          @for (g of d.itens; track g.id) {
            <app-deslizar [esquerda]="excluirAcao" [direita]="g.parcelamento_id ? null : repetirAcao" (esquerdaFeito)="excluir(g)" (direitaFeito)="repetir(g)">
              <button class="row" (click)="lancar.editarGasto(g)">
                <span class="ico" [style.background]="(cat_(g)?.cor ?? '#94a3b8') + '22'" [style.color]="(cat_(g)?.cor ?? '#94a3b8')"><app-icon [name]="cat_(g)?.icone ?? 'help'" /></span>
                <div class="grow">
                  <div class="t">{{ g.descricao }}@for (t of g.tags ?? []; track t) {<span class="tag">#{{ t }}</span>}</div>
                  <div class="s">{{ cat_(g)?.nome ?? 'Sem categoria' }} · {{ forma(g) }}{{ quem(g) }}</div>
                </div>
                <span class="v" [class.benef]="g.forma === 'beneficio'">{{ g.valor | brl }}</span>
              </button>
            </app-deslizar>
          }
        </section>
      } @empty {
        <div class="empty"><app-icon class="big" name="search_off" [size]="40" />Nenhum gasto encontrado.</div>
      }
      @if (dias().length) {
        <p class="small muted dica">Arraste um gasto para a esquerda para excluir ou para a direita para lançar de novo hoje.</p>
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
    .dica { text-align: center; }
    .dups { border-color: color-mix(in srgb, var(--warn) 50%, var(--line)); }
    .dups h2 { display: flex; align-items: center; gap: 6px; color: var(--warn); }
    .dup { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 0; border-top: 1px solid var(--line); }
    .dup .t { font-weight: 700; }
    .dup .s { font-size: 0.82rem; color: var(--ink-2); }
    .dup .bts { display: flex; gap: 6px; margin-left: auto; }
  `,
})
export default class Gastos {
  protected s = inject(Store);
  protected lancar = inject(Lancar);
  private toast = inject(Toast);
  protected excluirAcao: AcaoDeslizar = { rotulo: 'Excluir', icone: 'delete', cor: 'var(--danger)' };
  protected repetirAcao: AcaoDeslizar = { rotulo: 'Lançar hoje', icone: 'content_copy', cor: 'var(--primary)' };

  protected opcoes: { k: Filtro; r: string; i?: string }[] = [
    { k: 'todos', r: 'Todos' },
    { k: 'cartao', r: 'Cartão', i: 'credit_card' },
    { k: 'debito', r: 'À vista', i: 'payments' },
    { k: 'beneficio', r: 'Benefício', i: 'restaurant' },
  ];
  protected filtro = signal<Filtro>('todos');
  protected cat = signal<string | null>(null);
  protected cartao = signal<string | null>(null);
  protected ocupado = signal(false);
  protected dups = computed(() => duplicados(this.s.gastosMes()));
  protected busca = signal('');
  protected tag = signal<string | null>(null);
  protected tags = computed(() => [...new Set(this.s.gastosMes().flatMap((g) => g.tags ?? []))].sort());

  protected lista = computed(() => {
    const b = normalizar(this.busca());
    const cats = this.s.catMap();
    return this.s.gastosMes().filter(
      (g) =>
        (this.filtro() === 'todos' || g.forma === this.filtro()) &&
        (this.filtro() !== 'cartao' || !this.cartao() || g.cartao_id === this.cartao()) &&
        (!this.cat() || g.categoria_id === this.cat()) &&
        (!this.tag() || !!g.tags?.includes(this.tag()!)) &&
        (!b || normalizar(g.descricao).includes(b) || normalizar(cats.get(g.categoria_id ?? '')?.nome ?? '').includes(b) || bateValor(g.valor, b)),
    );
  });

  protected total = computed(() => soma(this.lista(), (g) => g.valor));

  protected dias = computed(() => {
    const m = new Map<string, Gasto[]>();
    for (const g of this.lista()) m.set(g.data, [...(m.get(g.data) ?? []), g]);
    return [...m.entries()].map(([data, itens]) => ({ data, itens, total: soma(itens, (g) => g.valor) }));
  });

  excluir(g: Gasto) {
    this.s.excluirAdiado('gastos', g.id, 'Gasto excluído');
  }

  /** Confirma que o par não é duplicado: marca os dois para não avisar de novo */
  async manter(p: [Gasto, Gasto]) {
    this.ocupado.set(true);
    try {
      await q(supabase.from('gastos').update({ nao_duplicado: true }).in('id', p.map((g) => g.id)));
      await this.s.depois('gastos');
      this.toast.ok('Mantidos os dois gastos');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  async repetir(g: Gasto) {
    try {
      const { descricao, categoria_id, valor, forma, cartao_id, beneficio_id, tags } = g;
      const novo = await this.s.salvar('gastos', { descricao, categoria_id, valor, forma, cartao_id, beneficio_id, data: hoje(), ...(tags?.length ? { tags } : {}) });
      this.toast.feito(`${g.descricao} lançado hoje`, () => this.s.excluir('gastos', novo));
    } catch (e) {
      this.toast.erro(e);
    }
  }

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
