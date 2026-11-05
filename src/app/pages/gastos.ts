import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { addDias, addMeses, fechamentoFatura, hoje, inicioFatura } from '../core/datas';
import { duplicados, fixasNaFatura } from '../core/financas';
import { q, supabase } from '../core/supabase';
import { BrlPipe, DiaPipe, MesPipe, bateValor, soma } from '../core/formato';
import { normalizar } from '../core/texto';
import { Gasto } from '../core/models';
import { Store } from '../core/store';
import { AcaoDeslizar, Deslizar } from '../shared/deslizar';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';
import { Toast } from '../shared/toast';
import { Sheet } from '../shared/sheet';
import { Revisar, contarRevisao } from '../shared/revisar';
import { Auth } from '../core/auth';
import { lerTags } from '../core/texto';

type Filtro = 'todos' | 'debito' | 'cartao' | 'beneficio';

@Component({
  imports: [FormsModule, RouterLink, BrlPipe, DiaPipe, MesPipe, Icon, Deslizar, Sheet, Revisar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Gastos</h1>
        <div class="acts">
          <button class="btn ghost sm" type="button" (click)="alternarSelecao()" [class.on]="selecao()"><app-icon name="checklist" [size]="16" />{{ selecao() ? 'Pronto' : 'Selecionar' }}</button>
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
      @if (filtro() === 'cartao') {
        <div class="seg">
          <button type="button" [class.on]="fatura() === null" (click)="fatura.set(null)">Por data</button>
          @for (i of indices; track i) {
            <button type="button" [class.on]="fatura() === i" (click)="fatura.set(i)">Fatura de {{ faturaMes(i) | mes: true }}</button>
          }
        </div>
      }
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

      @if (aRevisar() && !selecao()) {
        <button type="button" class="card revisar" (click)="revisando.set(true)">
          <app-icon name="fact_check" [size]="22" />
          <span class="grow"><b>Revisar {{ aRevisar() }} gasto(s)</b><span class="small muted">Sem categoria ou lançados por {{ outro() || 'outro membro' }}</span></span>
          <app-icon name="chevron_right" [size]="20" />
        </button>
      }
      <app-revisar [(open)]="revisando" />

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
        <span class="muted">{{ lista().length }} gasto(s)
          @if (periodo(); as p) { <br /><small>compras de {{ p.ini | dia }} a {{ p.fim | dia }}</small> }
          @if (fixas()) { <br /><small>+ {{ fixas() | brl }} de contas fixas no cartão</small> }
        </span>
        <b class="num">{{ total() | brl }}</b>
      </div>

      @if (porFatura() && lista().length) {
        <div class="card conf">
          <div class="grow">
            <b>Conferir com a fatura do banco</b>
            <span class="small muted">{{ conferidos().n }} de {{ lista().length }} conferidos · falta {{ total() - conferidos().valor | brl }}</span>
            <div class="bar"><i [style.width.%]="(conferidos().n / lista().length) * 100"></i></div>
          </div>
          <button type="button" class="btn sm" [class.ghost]="!conferindo()" (click)="conferindo.set(!conferindo())">{{ conferindo() ? 'Pronto' : 'Conferir' }}</button>
        </div>
      }

      @if (s.carregandoMes() && !lista().length) {
        @for (i of [1, 2, 3]; track i) {
          <span class="esqueleto rot"></span>
          <section class="card list">
            @for (j of [1, 2]; track j) { <div class="row"><span class="esqueleto ico"></span><span class="grow"><span class="esqueleto"></span></span><span class="esqueleto v"></span></div> }
          </section>
        }
      }
      @for (d of dias(); track d.data) {
        <div class="day-label">{{ d.data | dia }} · <span class="num">{{ d.total | brl }}</span></div>
        <section class="card list">
          @for (g of d.itens; track g.id) {
            <app-deslizar [esquerda]="modoLista() ? null : excluirAcao" [direita]="modoLista() || g.parcelamento_id ? null : repetirAcao" (esquerdaFeito)="excluir(g)" (direitaFeito)="repetir(g)">
              <button class="row" [class.selecionado]="marcados().has(g.id)" [style.--cor]="cat_(g)?.cor ?? '#94a3b8'"
                (click)="tocar(g)" (pointerdown)="segurar(g, $event)" (pointerup)="soltar()" (pointercancel)="soltar()" (pointerleave)="soltar()" (contextmenu)="$event.preventDefault()">
                @if (selecao()) {
                  <span class="marca" [class.on]="marcados().has(g.id)"><app-icon [name]="marcados().has(g.id) ? 'check_box' : 'check_box_outline_blank'" [size]="22" /></span>
                } @else if (conferindo()) {
                  <span class="marca" [class.on]="g.conferido"><app-icon [name]="g.conferido ? 'task_alt' : 'radio_button_unchecked'" [size]="22" /></span>
                }
                <span class="ico" [style.background]="(cat_(g)?.cor ?? '#94a3b8') + '22'" [style.color]="(cat_(g)?.cor ?? '#94a3b8')"><app-icon [name]="cat_(g)?.icone ?? 'help'" /></span>
                <div class="grow">
                  <div class="t">{{ g.descricao }}@if (g.comprovante) {<app-icon class="clip" name="attach_file" [size]="14" />}@for (t of g.tags ?? []; track t) {<span class="tag">#{{ t }}</span>}</div>
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
        <p class="small muted dica">Arraste um gasto para a esquerda para excluir ou para a direita para lançar de novo hoje. Segure para selecionar vários.</p>
      }
    </div>

    @if (selecao()) {
      <div class="massa">
        <div class="cab">
          <b>{{ marcados().size }} selecionado(s)</b><span class="num">{{ totalMarcados() | brl }}</span>
          <button type="button" class="btn ghost sm" (click)="marcarTodos()">{{ marcados().size === lista().length ? 'Nenhum' : 'Todos' }}</button>
        </div>
        <div class="acoes">
          <select aria-label="Mudar categoria" [disabled]="!marcados().size" [ngModel]="undefined" (ngModelChange)="mudarCategoria($event)">
            <option [ngValue]="undefined" disabled>Categoria</option>
            <option [ngValue]="null">Sem categoria</option>
            @for (c of s.catGasto(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
          </select>
          <button type="button" class="btn ghost sm" [disabled]="!marcados().size" (click)="marcando.set(true)"><app-icon name="sell" [size]="16" />Marcador</button>
          <button type="button" class="btn danger sm" [disabled]="!marcados().size" (click)="excluirMarcados()"><app-icon name="delete" [size]="16" />Excluir</button>
        </div>
      </div>
    }

    <app-sheet [(open)]="marcando" titulo="Marcador nos selecionados">
      <form class="form" (ngSubmit)="aplicarMarcador()">
        <label class="field"><span>Marcadores</span><input name="m" autocomplete="off" placeholder="Ex.: viagem, reforma" [(ngModel)]="novoMarcador" /></label>
        <div class="grid2">
          <button type="button" class="btn ghost" (click)="aplicarMarcador(true)">Tirar</button>
          <button class="btn">Adicionar</button>
        </div>
      </form>
    </app-sheet>
  `,
  styles: `
    .acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .busca { display: flex; align-items: center; gap: 8px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 0 12px; color: var(--ink-3); }
    .busca input { border: 0; background: none; box-shadow: none; padding: 10px 0; }
    .total { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; }
    .total b { font-size: 1.15rem; }
    .total small { font-size: 0.75rem; color: var(--ink-3); }
    .list { padding-top: 4px; padding-bottom: 4px; }
    .benef { color: var(--ink-3); }
    .clip { color: var(--ink-3); vertical-align: -2px; margin-left: 3px; }
    .dica { text-align: center; }
    .dups { border-color: color-mix(in srgb, var(--warn) 50%, var(--line)); }
    .dups h2 { display: flex; align-items: center; gap: 6px; color: var(--warn); }
    .dup { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 0; border-top: 1px solid var(--line); }
    .dup .t { font-weight: 700; }
    .dup .s { font-size: 0.82rem; color: var(--ink-2); }
    .dup .bts { display: flex; gap: 6px; margin-left: auto; }
    .acts .on { color: var(--primary); }
    .revisar, .conf { display: flex; align-items: center; gap: 12px; text-align: left; font: inherit; color: var(--ink); }
    .revisar { cursor: pointer; width: 100%; border-color: color-mix(in srgb, var(--primary) 35%, var(--line)); }
    .revisar > app-icon:first-child { color: var(--primary); }
    .revisar .grow, .conf .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .conf .bar { margin-top: 6px; height: 6px; }
    .marca { color: var(--ink-3); display: grid; place-items: center; }
    .marca.on { color: var(--primary); }
    .row { box-shadow: inset 3px 0 0 var(--cor, transparent); }
    .rot { width: 120px; height: 12px; margin: 6px 4px 0; }
    .esqueleto.ico { width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0; }
    .esqueleto.v { width: 70px; }
    .massa {
      position: fixed; z-index: 30; left: 12px; right: 12px; bottom: calc(var(--nav-h) + var(--safe-b) + 10px);
      background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 10px 12px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
      display: flex; flex-direction: column; gap: 8px; max-width: 640px; margin: 0 auto;
    }
    .massa .cab { display: flex; align-items: center; gap: 10px; }
    .massa .cab .num { margin-left: auto; font-weight: 700; }
    .massa .acoes { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; }
    .massa select { padding: 6px 10px; }
    @media (min-width: 900px) { .massa { bottom: 16px; left: calc(var(--side-w) + 24px); } }
  `,
})
export default class Gastos {
  protected s = inject(Store);
  protected lancar = inject(Lancar);
  private toast = inject(Toast);
  protected excluirAcao: AcaoDeslizar = { rotulo: 'Excluir', icone: 'delete', cor: 'var(--danger)' };
  protected repetirAcao: AcaoDeslizar = { rotulo: 'Lançar hoje', icone: 'content_copy', cor: 'var(--primary)' };

  constructor() {
    // vindo de Cartões: ?cartao=<id>&fatura=0|1
    const p = inject(ActivatedRoute).snapshot.queryParamMap;
    const f = p.get('fatura');
    if (f === '0' || f === '1') {
      this.filtro.set('cartao');
      this.cartao.set(p.get('cartao'));
      this.fatura.set(+f as 0 | 1);
    }
  }

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

  /** Por fatura (0 = vence no mês, 1 = no seguinte; as duas já vêm carregadas): compras pelo ciclo do cartão, não pela data */
  protected fatura = signal<0 | 1 | null>(null);
  protected indices = [0, 1] as const;
  protected faturaMes = (i: number) => addMeses(this.s.mes(), i);
  protected porFatura = computed(() => (this.filtro() === 'cartao' && this.fatura() !== null ? this.faturaMes(this.fatura()!) : null));
  private cartaoSel = computed(() => (this.s.cartoes().length === 1 ? this.s.cartoes()[0] : this.s.cartoes().find((c) => c.id === this.cartao())));
  /** do dia do fechamento anterior até a véspera do fechamento */
  protected periodo = computed(() => {
    const m = this.porFatura();
    const c = this.cartaoSel();
    return m && c ? { ini: inicioFatura(m, c), fim: addDias(fechamentoFatura(m, c), -1) } : null;
  });
  protected fixas = computed(() => {
    const m = this.porFatura();
    const c = this.cartaoSel();
    return m && c ? soma(fixasNaFatura(m, c, this.s.recorrenciasPrev()), (f) => f.valor) : 0;
  });

  protected lista = computed(() => {
    const b = normalizar(this.busca());
    const cats = this.s.catMap();
    const fm = this.porFatura();
    const base = fm ? this.s.gastos().filter((g) => g.forma === 'cartao' && g.fatura_mes === fm) : this.s.gastosMes();
    return base.filter(
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

  private auth = inject(Auth);
  protected revisando = signal(false);
  /** recalcula ao fechar a revisão (o que foi visto fica no aparelho) */
  protected aRevisar = computed(() => (this.revisando() ? 0 : contarRevisao(this.s, this.auth.user()?.id)));
  protected outro = computed(() => this.s.membros().find((m) => m.user_id !== this.auth.user()?.id)?.nome ?? '');

  // seleção em massa: segurar uma linha (ou o botão Selecionar) entra no modo
  protected selecao = signal(false);
  protected marcados = signal(new Set<string>());
  protected totalMarcados = computed(() => soma(this.lista().filter((g) => this.marcados().has(g.id)), (g) => g.valor));
  protected marcando = signal(false);
  protected novoMarcador = '';
  protected conferindo = signal(false);
  protected conferidos = computed(() => {
    const l = this.lista().filter((g) => g.conferido);
    return { n: l.length, valor: soma(l, (g) => g.valor) };
  });
  /** selecionando ou conferindo: linha não desliza nem abre a edição */
  protected modoLista = computed(() => this.selecao() || this.conferindo());
  private timer: ReturnType<typeof setTimeout> | undefined;
  private segurou = false;

  alternarSelecao() {
    this.selecao.update((v) => !v);
    this.marcados.set(new Set());
    this.conferindo.set(false);
  }

  segurar(g: Gasto, e: PointerEvent) {
    if (this.modoLista() || e.button !== 0) return;
    this.segurou = false;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.segurou = true;
      navigator.vibrate?.(15);
      this.selecao.set(true);
      this.marcados.set(new Set([g.id]));
    }, 500);
  }

  soltar() {
    clearTimeout(this.timer);
  }

  tocar(g: Gasto) {
    if (this.segurou) return void (this.segurou = false);
    if (this.selecao()) {
      const m = new Set(this.marcados());
      if (!m.delete(g.id)) m.add(g.id);
      return this.marcados.set(m);
    }
    if (this.conferindo()) return void this.conferir(g);
    this.lancar.editarGasto(g);
  }

  marcarTodos() {
    this.marcados.set(this.marcados().size === this.lista().length ? new Set() : new Set(this.lista().map((g) => g.id)));
  }

  async mudarCategoria(cat: string | null) {
    const ids = [...this.marcados()];
    try {
      await this.s.atualizarGastos(ids, { categoria_id: cat });
      this.toast.ok(`Categoria trocada em ${ids.length} gasto(s)`);
      this.alternarSelecao();
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async aplicarMarcador(tirar = false) {
    const novas = lerTags(this.novoMarcador);
    if (!novas.length) return this.toast.erro('Informe o marcador');
    const sel = this.lista().filter((g) => this.marcados().has(g.id));
    try {
      // cada gasto tem os seus: grava um por um
      await Promise.all(sel.map((g) => {
        const atuais = g.tags ?? [];
        const tags = tirar ? atuais.filter((t) => !novas.includes(t)) : [...new Set([...atuais, ...novas])];
        return this.s.atualizarGastos([g.id], { tags });
      }));
      this.toast.ok(`${tirar ? 'Marcador tirado de' : 'Marcador em'} ${sel.length} gasto(s)`);
      this.marcando.set(false);
      this.novoMarcador = '';
      this.alternarSelecao();
    } catch (e) {
      this.toast.erro(e);
    }
  }

  excluirMarcados() {
    const ids = [...this.marcados()];
    this.s.excluirGastos(ids, `${ids.length} gasto(s) excluído(s)`);
    this.alternarSelecao();
  }

  async conferir(g: Gasto) {
    try {
      await this.s.atualizarGastos([g.id], { conferido: !g.conferido });
    } catch (e) {
      this.toast.erro(e);
    }
  }

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
