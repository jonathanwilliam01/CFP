import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { atualizarTaxas, taxasBcb } from '../core/bcb';
import { addMeses, fimMes, mesAtual } from '../core/datas';
import { inflacaoCasal } from '../core/financas';
import { BrlPipe, MesPipe } from '../core/formato';
import { Gasto, Pagamento } from '../core/models';
import { Store } from '../core/store';
import { Abas, RELATORIOS } from '../shared/abas';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';

type Periodo = 'ano' | 'tri';

/** Quanto subiu o custo de vida do casal (gastos + contas fixas) contra o IPCA */
@Component({
  imports: [Abas, BrlPipe, MesPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-abas titulo="Relatórios" [abas]="abas" />

      <div class="seg">
        <button type="button" [class.on]="periodo() === 'ano'" (click)="periodo.set('ano')">Em 1 ano</button>
        <button type="button" [class.on]="periodo() === 'tri'" (click)="periodo.set('tri')">Trimestre anterior</button>
      </div>
      <p class="muted small cap">{{ atual()[0] | mes }} a {{ atual()[2] | mes }} contra {{ anterior()[0] | mes }} a {{ anterior()[2] | mes }}</p>

      @if (!dados()) {
        <div class="card empty"><span class="big">⏳</span>Carregando...</div>
      } @else if (!r()) {
        <div class="card empty">
          <app-icon class="big" name="hourglass_top" [size]="40" />
          <p>Ainda não há lançamentos de {{ anterior()[0] | mes }} a {{ anterior()[2] | mes }} para comparar.</p>
          @if (periodo() === 'ano') { <button class="btn ghost sm" type="button" (click)="periodo.set('tri')">Comparar com o trimestre anterior</button> }
        </div>
      } @else {
        @let x = r()!;
        <section class="card hero">
          <span class="small">Custo de vida de vocês</span>
          <b class="grande num" [class.sobe]="(x.pct ?? 0) > 0" [class.desce]="(x.pct ?? 0) < 0">{{ (x.pct ?? 0) > 0 ? '+' : '' }}{{ x.pct }}%</b>
          <span class="small">Média de {{ x.antes | brl }} para {{ x.agora | brl }} por mês</span>
          @if (periodo() === 'ano' && ipca() !== null) {
            <span class="ipca">IPCA em 12 meses: <b>{{ ipca() }}%</b> · {{ (x.pct ?? 0) > ipca()! ? 'acima' : 'abaixo' }} da inflação oficial</span>
          }
        </section>

        <section class="card">
          <div class="card-head"><h2>Por categoria</h2><span class="muted small">média por mês</span></div>
          <div class="list">
            @for (c of cats(); track c.id) {
              <div class="row">
                <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
                <div class="grow"><div class="t">{{ c.nome }}</div><div class="s num">{{ c.antes | brl }} → {{ c.agora | brl }}</div></div>
                @if (c.pct === null) { <span class="badge">novo</span> }
                @else { <span class="v num" [class.neg]="c.pct > 0" [class.pos]="c.pct < 0">{{ c.pct > 0 ? '+' : '' }}{{ c.pct }}%</span> }
              </div>
            }
          </div>
        </section>
        <p class="small muted">Soma gastos lançados e contas fixas. Não é só preço: comprar mais ou menos também mexe no número.</p>
      }
    </div>
  `,
  styles: `
    .hero { background: var(--hero); color: var(--hero-ink); display: flex; flex-direction: column; gap: 4px; padding: 22px; }
    .hero .small { opacity: 0.85; }
    .grande { font-size: clamp(2rem, 8vw, 2.8rem); letter-spacing: -0.03em; }
    .sobe { color: var(--hero-desce); }
    .desce { color: var(--hero-sobe); }
    .ipca { margin-top: 8px; padding: 8px 12px; border-radius: 12px; background: var(--hero-glass); font-size: 0.82rem; }
    .cap::first-letter { text-transform: uppercase; }
  `,
})
export default class Inflacao {
  protected abas = RELATORIOS;
  protected s = inject(Store);
  private toast = inject(Toast);

  /** último mês fechado */
  private fim = addMeses(mesAtual(), -1);
  protected periodo = signal<Periodo>('ano');
  protected atual = computed(() => [-2, -1, 0].map((i) => addMeses(this.fim, i)));
  protected anterior = computed(() => this.atual().map((m) => addMeses(m, this.periodo() === 'ano' ? -12 : -3)));
  protected dados = signal<{ gastos: Gasto[]; pagamentos: Pagamento[] } | null>(null);
  protected ipca = computed(() => taxasBcb()?.ipca12 ?? null);
  private req = 0;

  protected r = computed(() => {
    const d = this.dados();
    const ant = this.anterior();
    if (!d || ant.every((m) => this.s.antesDoInicio(m))) return null;
    const r = inflacaoCasal(this.atual(), ant, d.gastos, this.s.recorrenciasPrev(), d.pagamentos);
    return r.antes > 0 ? r : null;
  });

  protected cats = computed(() => {
    const m = this.s.catMap();
    return (this.r()?.cats ?? []).map((c) => {
      const cat = c.id ? m.get(c.id) : undefined;
      return { ...c, nome: cat?.nome ?? 'Sem categoria', cor: cat?.cor ?? '#94a3b8', icone: cat?.icone ?? 'help' };
    });
  });

  constructor() {
    atualizarTaxas();
    effect(() => {
      const ini = this.anterior()[0];
      this.s.mudou();
      if (!this.s.carteiraId()) return;
      untracked(() => this.carregar(ini));
    });
  }

  private async carregar(ini: string) {
    const r = ++this.req;
    this.dados.set(null);
    try {
      const d = await this.s.historico(ini, fimMes(this.fim));
      if (r === this.req) this.dados.set(d);
    } catch (e) {
      this.toast.erro(e);
    }
  }
}
