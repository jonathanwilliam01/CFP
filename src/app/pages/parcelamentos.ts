import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { addMeses, inicioMes, mesAtual, mesFatura } from '../core/datas';
import { BrlPipe, MesPipe, pct, soma } from '../core/formato';
import { Gasto, Parcelamento } from '../core/models';

type Parcela = Pick<Gasto, 'parcelamento_id' | 'valor' | 'data' | 'fatura_mes'>;
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';
import { Toast } from '../shared/toast';

@Component({
  imports: [BrlPipe, MesPipe, Icon],
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

      <p class="small muted">As parcelas entram automaticamente nos gastos de cada mês e, no cartão, na fatura correspondente.</p>
    </div>
  `,
  styles: `
    .cab { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .grow { flex: 1; min-width: 0; }
    .grow b { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
        return c ? mesFatura(d, c.fechamento_dia, c.vencimento_dia) : inicioMes(d);
      };
      // parcela de mês passado conta como paga; importada a partir da parcela N não tem as anteriores como gasto
      const futuras = this.parcelas().filter((g) => g.parcelamento_id === p.id && (g.fatura_mes ?? inicioMes(g.data)) >= atual);
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
      };
    });
  });

  protected ativos = computed(() => this.lista().filter((x) => x.pagas < x.p.num_parcelas));
  protected finalizados = computed(() => this.lista().filter((x) => x.pagas >= x.p.num_parcelas));
  protected porMes = computed(() => soma(this.ativos(), (x) => x.p.valor_parcela));
  protected restante = computed(() => soma(this.ativos(), (x) => x.restante));

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
        q<Parcela[]>(supabase.from('gastos').select('parcelamento_id, valor, data, fatura_mes').eq('carteira_id', id).not('parcelamento_id', 'is', null)),
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
