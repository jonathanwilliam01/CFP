import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addMeses, hoje, inicioMes, mesAtual, mesFatura, nomeMes } from '../core/datas';
import { BrlPipe, MesPipe, moeda, parseValor, pct, soma } from '../core/formato';
import { Gasto, Parcelamento } from '../core/models';
import { Moeda } from '../shared/moeda';

type Parcela = Pick<Gasto, 'id' | 'parcelamento_id' | 'parcela' | 'valor' | 'data' | 'fatura_mes'>;
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Empilhadas, Pilha } from '../shared/graficos';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

@Component({
  imports: [Moeda, BrlPipe, MesPipe, Icon, Empilhadas, FormsModule, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Parcelamentos</h1>
        <button class="btn sm" type="button" (click)="lancar.novo('parcelado')"><app-icon name="add" [size]="16" />Nova</button>
      </div>

      <div class="stats">
        <div class="stat"><div class="l">Parcelas por mês</div><div class="v">{{ porMes() | brl }}</div></div>
        <div class="stat"><div class="l">Falta pagar</div><div class="v">{{ restante() | brl }}</div></div>
      </div>

      @if (ativos().length) {
        <section class="card">
          <div class="card-head"><h2>Parcelas liberando</h2><span class="muted small">próximos 12 meses</span></div>
          <app-empilhadas [colunas]="linhaTempo()" />
          @if (libera().length) {
            <div class="libera">
              @for (l of libera(); track l.mes) {
                <div class="lib"><app-icon name="lock_open" [size]="18" />
                  <span class="grow">Em <b class="cap">{{ l.mes | mes }}</b> libera <b class="num pos">{{ l.valor | brl }}</b>/mês<span class="small muted"> · {{ l.nomes }}</span></span>
                </div>
              }
            </div>
          }
        </section>
      }

      <div class="seg">
        <button type="button" [class.on]="aba() === 'ativos'" (click)="aba.set('ativos')">Em andamento ({{ ativos().length }})</button>
        <button type="button" [class.on]="aba() === 'fim'" (click)="aba.set('fim')">Finalizados ({{ finalizados().length }})</button>
      </div>

      @for (p of (aba() === 'ativos' ? ativos() : finalizados()); track p.p.id) {
        <article class="card">
          <div class="cab">
            <span class="ico" [style.background]="p.cor + '22'" [style.color]="p.cor"><app-icon [name]="p.icone" /></span>
            <div class="grow">
              <b>{{ p.p.descricao }}</b>
              <p class="small muted">{{ p.p.num_parcelas }}x de {{ p.p.valor_parcela | brl }} · {{ p.pagamento }}</p>
            </div>
            <button class="btn ghost icon" type="button" (click)="abrirEditar(p.p)" aria-label="Editar" title="Editar"><app-icon name="edit" [size]="18" /></button>
            <button class="btn ghost icon" type="button" (click)="excluir(p.p)" aria-label="Excluir" title="Excluir"><app-icon name="delete" [size]="18" /></button>
          </div>
          <div class="bar"><i [style.width.%]="p.pct"></i></div>
          <div class="info small muted">
            <span>{{ p.pagas }}/{{ p.p.num_parcelas }} pagas</span>
            <span>
              @if (p.pagas < p.p.num_parcelas) {
                Falta <b class="num">{{ p.restante | brl }}</b> · termina em {{ p.fim | mes }}
                @if (p.antecipaveis.length) {
                  <button class="link" type="button" (click)="abrirAntecipar(p)">Antecipar</button>
                }
              } @else {
                Total {{ p.p.valor_parcela * p.p.num_parcelas | brl }}
              }
            </span>
          </div>
        </article>
      } @empty {
        <div class="card empty">
          <app-icon class="big" name="event_repeat" [size]="40" />
          <p>{{ aba() === 'ativos' ? 'Nenhum parcelamento em andamento.' : 'Nenhum parcelamento finalizado.' }}</p>
          @if (aba() === 'ativos') {
            <button class="btn sm" type="button" (click)="lancar.novo('parcelado')">Lançar compra parcelada</button>
          }
        </div>
      }

      <app-sheet [(open)]="antecipando" titulo="Antecipar parcelas">
        @if (ant(); as a) {
          <form class="form" (ngSubmit)="antecipar()">
            <p class="small muted">{{ a.p.descricao }}: as últimas parcelas viram um pagamento só {{ a.cartao ? 'na fatura aberta' : 'hoje' }}.</p>
            <label class="field"><span>Quantas parcelas (até {{ a.antecipaveis.length }})</span>
              <input name="n" type="number" min="1" [max]="a.antecipaveis.length" [ngModel]="antN()" (ngModelChange)="trocarN(+$event)" />
            </label>
            <label class="field"><span>Valor pago (com desconto)</span><input name="v" moeda inputmode="numeric" [ngModel]="antValor()" (ngModelChange)="antValor.set($event)" /></label>
            <p class="hint">Sem desconto: {{ semDesconto() | brl }}@if (desconto() > 0) { · economia <b class="pos">{{ desconto() | brl }}</b> }</p>
            <button class="btn block" type="submit" [disabled]="salvando()">{{ antN() === a.antecipaveis.length ? 'Quitar' : 'Antecipar' }}</button>
          </form>
        }
      </app-sheet>

      <app-sheet [(open)]="editando" titulo="Editar parcelamento">
        @if (ed(); as e) {
          <form class="form" (ngSubmit)="salvarEdicao()">
            <label class="field"><span>Descrição</span><input name="desc" [(ngModel)]="e.descricao" autocomplete="off" /></label>
            <div class="grid2">
              <label class="field"><span>Valor da parcela</span><input name="valor" moeda inputmode="numeric" [(ngModel)]="e.valor" /></label>
              <label class="field"><span>Nº de parcelas</span><input name="num" type="number" inputmode="numeric" min="1" max="120" [(ngModel)]="e.num" /></label>
            </div>
            <p class="hint">Total: {{ totalEdicao() | brl }}</p>
            <label class="field"><span>Data da 1ª parcela</span><input name="primeira" type="date" [(ngModel)]="e.primeira" /></label>
            <label class="field"><span>Pagamento</span>
              <select name="cartao" [(ngModel)]="e.cartao">
                <option value="">Boleto/Débito</option>
                @for (c of cartoesEdicao(); track c.id) { <option [value]="c.id">Cartão {{ c.nome }}</option> }
              </select></label>
            <label class="field"><span>Categoria</span>
              <select name="cat" [(ngModel)]="e.categoria">
                <option value="">Sem categoria</option>
                @for (c of s.catGasto(); track c.id) { <option [value]="c.id">{{ c.nome }}</option> }
              </select></label>
            <p class="small muted">Vale para todas as parcelas. Aumentar o número cria as novas; diminuir apaga as que passarem do total.</p>
            <button class="btn block" type="submit" [disabled]="salvando()">Salvar</button>
          </form>
        }
      </app-sheet>

      <p class="small muted">As parcelas entram automaticamente nos gastos de cada mês e, no cartão, na fatura correspondente.</p>
    </div>
  `,
  styles: `
    .cab { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .grow { flex: 1; min-width: 0; }
    .grow b { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .libera { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
    .lib { display: flex; gap: 8px; align-items: flex-start; font-size: 0.88rem; color: var(--ink-2); }
    .lib app-icon { color: var(--ok); }
    .lib .grow b { display: inline; }
    .cap { text-transform: capitalize; }
    .link { background: none; border: 0; color: var(--primary); font: inherit; font-weight: 700; cursor: pointer; padding: 0 0 0 6px; }
    .info { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
  `,
})
export default class Parcelamentos {
  protected s = inject(Store);
  protected lancar = inject(Lancar);
  private toast = inject(Toast);

  private dados = signal<Parcelamento[]>([]);
  /** Parcelas que ainda existem como gasto (a excluída some da conta) */
  private parcelas = signal<Parcela[]>([]);
  protected aba = signal<'ativos' | 'fim'>('ativos');

  protected lista = computed(() => {
    const atual = mesAtual();
    const cartoes = new Map(this.s.cartoes().map((c) => [c.id, c]));
    return this.dados().map((p) => {
      const c = p.cartao_id ? cartoes.get(p.cartao_id) : undefined;
      const mesDa = (i: number) => {
        const d = addMeses(p.primeira_data, i);
        return c ? mesFatura(d, c) : inicioMes(d);
      };
      // parcela de mês passado conta como paga; importada a partir da parcela N não tem as anteriores como gasto
      // antecipação (parcela null) não é parcela: as que ela substituiu contam como pagas
      const futuras = this.parcelas().filter((g) => g.parcelamento_id === p.id && g.parcela != null && (g.fatura_mes ?? inicioMes(g.data)) >= atual);
      const alvo = c ? mesFatura(hoje(), c) : atual;
      const pagas = p.num_parcelas - futuras.length;
      const cat = p.categoria_id ? this.s.catMap().get(p.categoria_id) : undefined;
      return {
        p,
        pagas,
        pct: pct(pagas, p.num_parcelas),
        restante: soma(futuras, (g) => g.valor),
        fim: mesDa(p.num_parcelas - 1),
        icone: cat?.icone ?? 'receipt_long',
        cor: cat?.cor ?? '#64748b',
        pagamento: c ? `Cartão ${c.nome}` : 'Boleto/Débito',
        cartao: !!c,
        /** depois da fatura aberta (ou do mês), da última para a primeira */
        antecipaveis: futuras.filter((g) => (g.fatura_mes ?? inicioMes(g.data)) > alvo).sort((a, b) => (b.parcela ?? 0) - (a.parcela ?? 0)),
      };
    });
  });

  protected ativos = computed(() => this.lista().filter((x) => x.pagas < x.p.num_parcelas));
  protected finalizados = computed(() => this.lista().filter((x) => x.pagas >= x.p.num_parcelas));
  protected porMes = computed(() => soma(this.ativos(), (x) => x.p.valor_parcela));
  protected restante = computed(() => soma(this.ativos(), (x) => x.restante));

  private meses = computed(() => Array.from({ length: 12 }, (_, i) => addMeses(mesAtual(), i)));

  /** Uma cor por compra (as 6 maiores, o resto em Outras): dá para ver qual parcela some em cada mês */
  protected linhaTempo = computed<Pilha[]>(() => {
    const cores = ['#1d5bd8', '#7c3aed', '#db2777', '#d97706', '#0e9f6e', '#0b7f9c'];
    const top = [...this.ativos()].sort((a, b) => b.p.valor_parcela - a.p.valor_parcela).slice(0, 6);
    const ids = new Set(top.map((x) => x.p.id));
    const mesDe = (g: Parcela) => g.fatura_mes ?? inicioMes(g.data);
    return this.meses().map((mes, i) => {
      const doMes = this.parcelas().filter((g) => mesDe(g) === mes);
      return {
        rotulo: nomeMes(mes, true),
        destaque: i === 0,
        partes: [
          ...top.map((x, j) => ({ nome: x.p.descricao, cor: cores[j], valor: soma(doMes.filter((g) => g.parcelamento_id === x.p.id), (g) => g.valor) })),
          { nome: 'Outras', cor: '#94a3b8', valor: soma(doMes.filter((g) => !ids.has(g.parcelamento_id ?? '')), (g) => g.valor) },
        ],
      };
    });
  });

  /** Mês seguinte à última parcela: quanto deixa de sair por mês */
  protected libera = computed(() => {
    const m = new Map<string, { valor: number; nomes: string[] }>();
    for (const x of this.ativos()) {
      const mes = addMeses(x.fim, 1);
      if (mes > this.meses()[11]) continue;
      const a = m.get(mes) ?? { valor: 0, nomes: [] };
      a.valor += x.p.valor_parcela;
      a.nomes.push(x.p.descricao);
      m.set(mes, a);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, a]) => ({ mes, valor: a.valor, nomes: a.nomes.join(', ') }));
  });

  protected antecipando = signal(false);
  protected ant = signal<ReturnType<typeof this.lista>[number] | null>(null);
  protected antN = signal(1);
  protected salvando = signal(false);
  protected antValor = signal('');
  protected semDesconto = computed(() => soma(this.ant()?.antecipaveis.slice(0, this.antN()) ?? [], (g) => g.valor));
  protected desconto = computed(() => Math.round((this.semDesconto() - parseValor(this.antValor())) * 100) / 100);

  abrirAntecipar(p: ReturnType<typeof this.lista>[number]) {
    this.ant.set(p);
    this.trocarN(p.antecipaveis.length);
    this.antecipando.set(true);
  }

  trocarN(n: number) {
    const max = this.ant()?.antecipaveis.length ?? 1;
    this.antN.set(Math.max(1, Math.min(max, Math.round(n) || 1)));
    this.antValor.set(this.semDesconto().toFixed(2).replace('.', ','));
  }

  async antecipar() {
    const a = this.ant();
    const valor = parseValor(this.antValor());
    if (!a || !valor) return this.toast.erro('Informe o valor pago');
    const ids = a.antecipaveis.slice(0, this.antN()).map((g) => g.id);
    this.salvando.set(true);
    try {
      await q(supabase.rpc('antecipar_parcelas', { p_parcelamento: a.p.id, p_ids: ids, p_valor: valor, p_data: hoje() }));
      await Promise.all([this.carregar(), this.s.carregarMes()]);
      this.antecipando.set(false);
      this.toast.ok(this.desconto() > 0 ? `Antecipado, economia de ${moeda(this.desconto())}` : 'Parcelas antecipadas');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  protected editando = signal(false);
  protected ed = signal<{ id: string; descricao: string; valor: string; num: number; primeira: string; cartao: string; categoria: string } | null>(null);
  /** método (não computed): o ngModel muda o objeto do formulário por dentro */
  protected totalEdicao() {
    const e = this.ed();
    return e ? Math.round(parseValor(e.valor) * (+e.num || 0) * 100) / 100 : 0;
  }
  /** ativos + o cartão atual do parcelamento, mesmo inativo */
  protected cartoesEdicao = computed(() => this.s.cartoes().filter((c) => c.ativo || c.id === this.ed()?.cartao));

  abrirEditar(p: Parcelamento) {
    this.ed.set({
      id: p.id, descricao: p.descricao, valor: p.valor_parcela.toFixed(2).replace('.', ','), num: p.num_parcelas,
      primeira: p.primeira_data, cartao: p.cartao_id ?? '', categoria: p.categoria_id ?? '',
    });
    this.editando.set(true);
  }

  async salvarEdicao() {
    const e = this.ed();
    if (!e) return;
    const valor = parseValor(e.valor), num = Math.round(+e.num);
    if (!e.descricao.trim()) return this.toast.erro('Informe a descrição');
    if (!(valor > 0)) return this.toast.erro('Informe o valor da parcela');
    if (!(num >= 1 && num <= 120)) return this.toast.erro('Parcelas: de 1 a 120');
    if (!e.primeira) return this.toast.erro('Informe a data da 1ª parcela');
    this.salvando.set(true);
    try {
      await q(supabase.rpc('editar_parcelamento', {
        p_id: e.id, p_descricao: e.descricao.trim(), p_categoria: e.categoria || null, p_cartao: e.cartao || null,
        p_valor_parcela: valor, p_num: num, p_primeira: e.primeira,
      }));
      await Promise.all([this.carregar(), this.s.carregarMes()]);
      this.editando.set(false);
      this.toast.ok('Parcelamento atualizado');
    } catch (err) {
      this.toast.erro(err);
    } finally {
      this.salvando.set(false);
    }
  }

  constructor() {
    effect(() => {
      this.s.mudou();
      const id = this.s.carteiraId();
      if (this.lancar.aberto() || !id) return;
      untracked(() => this.carregar());
    });
  }

  private async carregar() {
    try {
      const id = this.s.carteiraId()!;
      const [dados, parcelas] = await Promise.all([
        q<Parcelamento[]>(supabase.from('parcelamentos').select('*').eq('carteira_id', id).order('criado_em', { ascending: false })),
        q<Parcela[]>(supabase.from('gastos').select('id, parcelamento_id, parcela, valor, data, fatura_mes').eq('carteira_id', id).not('parcelamento_id', 'is', null)),
      ]);
      this.dados.set(dados);
      this.parcelas.set(parcelas);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  excluir(p: Parcelamento) {
    this.dados.update((l) => l.filter((x) => x.id !== p.id));
    this.s.excluirAdiado('parcelamentos', p.id, 'Parcelamento excluído', () => this.carregar());
  }
}
