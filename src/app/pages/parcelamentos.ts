import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addMeses, hoje, inicioMes, mesAtual, mesFatura, nomeMes } from '../core/datas';
import { BrlPipe, MesPipe, moeda, parseValor, pct, soma } from '../core/formato';
import { Gasto, Parcelamento } from '../core/models';

type Parcela = Pick<Gasto, 'id' | 'parcelamento_id' | 'parcela' | 'valor' | 'data' | 'fatura_mes'>;
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Empilhadas, Pilha } from '../shared/graficos';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

@Component({
  imports: [BrlPipe, MesPipe, Icon, Empilhadas, FormsModule, Sheet],
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
          <div class="card-head"><h2>Parcelas nos próximos meses</h2></div>
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
            <button class="btn ghost icon" type="button" (click)="excluir(p.p)" aria-label="Excluir"><app-icon name="delete" [size]="18" /></button>
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
            <label class="field"><span>Valor pago (com desconto)</span><input name="v" inputmode="decimal" [ngModel]="antValor()" (ngModelChange)="antValor.set($event)" /></label>
            <p class="hint">Sem desconto: {{ semDesconto() | brl }}@if (desconto() > 0) { · economia <b class="pos">{{ desconto() | brl }}</b> }</p>
            <button class="btn block" type="submit" [disabled]="salvando()">{{ antN() === a.antecipaveis.length ? 'Quitar' : 'Antecipar' }}</button>
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

  protected linhaTempo = computed<Pilha[]>(() =>
    this.meses().map((mes, i) => ({
      rotulo: nomeMes(mes, true),
      destaque: i === 0,
      partes: [{ nome: 'Parcelas', cor: 'var(--primary)', valor: soma(this.parcelas().filter((g) => (g.fatura_mes ?? inicioMes(g.data)) === mes), (g) => g.valor) }],
    })),
  );

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
