import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ePdf, linkComprovante } from '../core/comprovante';
import { hoje, mesAtual } from '../core/datas';
import { Deducao, deducoesIR } from '../core/financas';
import { BrlPipe, DiaPipe, baixarCsv, csvData, csvTexto, csvValor, pct, soma } from '../core/formato';
import { Gasto, Pagamento } from '../core/models';
import { Store } from '../core/store';
import { Abas, RELATORIOS } from '../shared/abas';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';
import { Toast } from '../shared/toast';
import { Visor } from '../shared/visor';

/** Despesas dedutíveis do ano (saúde, educação...) para a declaração do Imposto de Renda */
@Component({
  imports: [Abas, BrlPipe, DiaPipe, Icon, RouterLink, Visor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-abas titulo="Relatórios" [abas]="abas">
        <button class="btn ghost icon sm" type="button" (click)="ano.set(ano() - 1)" aria-label="Ano anterior"><app-icon name="chevron_left" /></button>
        <b class="ano">{{ ano() }}</b>
        <button class="btn ghost icon sm" type="button" [disabled]="ano() >= anoAtual" (click)="ano.set(ano() + 1)" aria-label="Próximo ano"><app-icon name="chevron_right" /></button>
        <button class="btn ghost sm" type="button" (click)="exportar()" [disabled]="!itens().length"><app-icon name="download" [size]="16" /> CSV</button>
      </app-abas>

      @if (!dedutiveis().size) {
        <div class="card empty">
          <app-icon class="big" name="receipt_long" [size]="40" />
          <p>Nenhuma categoria marcada como dedutível.</p>
          <a class="btn ghost sm" routerLink="/config">Marcar em Configurações → Categorias</a>
        </div>
      } @else if (!dados()) {
        <div class="card empty"><span class="big">⏳</span>Carregando...</div>
      } @else {
        <section class="card hero">
          <span class="small">Despesas dedutíveis em {{ ano() }}</span>
          <b class="grande num">{{ total() | brl }}</b>
          <span class="small">{{ itens().length }} lançamento(s) · {{ semComprovante() }} sem comprovante anexado</span>
        </section>

        @if (porCategoria().length > 1 || porPessoa().length > 1) {
          <div class="grade">
            <section class="card">
              <div class="card-head"><h2>Por categoria</h2></div>
              @for (g of porCategoria(); track g.nome) {
                <div class="lin"><span><i class="dot" [style.background]="g.cor"></i>{{ g.nome }}</span><b class="num">{{ g.total | brl }}</b></div>
              }
            </section>
            <section class="card">
              <div class="card-head"><h2>Por pessoa</h2></div>
              @for (g of porPessoa(); track g.nome) {
                <div class="lin"><span>{{ g.nome }}</span><b class="num">{{ g.total | brl }}<small> · {{ g.pct }}%</small></b></div>
              }
            </section>
          </div>
        }

        <section class="card list">
          @for (d of itens(); track $index) {
            <button class="row" type="button" (click)="abrir(d)">
              <div class="grow">
                <div class="t">{{ d.descricao }}</div>
                <div class="s">{{ d.data | dia }} · {{ nomeCat(d) }} · {{ quem(d) }}</div>
              </div>
              @if (d.gasto?.comprovante) { <app-icon class="ok" name="attach_file" [size]="18" /> }
              @else if (d.gasto) { <app-icon class="falta" name="add_photo_alternate" [size]="18" /> }
              <span class="v num">{{ d.valor | brl }}</span>
            </button>
          } @empty {
            <div class="empty">Nenhuma despesa dedutível em {{ ano() }}.</div>
          }
        </section>
        <p class="small muted">Toque num gasto para ver ou anexar o comprovante. Contas fixas entram pelo pagamento marcado em Contas. Confira as regras de dedução da Receita na hora de declarar.</p>
      }
    </div>
    <app-visor [(url)]="verUrl" alt="Comprovante" />
  `,
  styles: `
    .ano { font-variant-numeric: tabular-nums; padding: 0 2px; }
    .hero { background: var(--hero); color: var(--hero-ink); display: flex; flex-direction: column; gap: 4px; padding: 22px; }
    .hero .small { opacity: 0.85; }
    .grande { font-size: clamp(2rem, 8vw, 2.8rem); letter-spacing: -0.03em; }
    .grade { display: grid; gap: 12px; }
    @media (min-width: 720px) { .grade { grid-template-columns: 1fr 1fr; } }
    .lin { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0; font-size: 0.9rem; }
    .lin span { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
    .lin small { color: var(--ink-3); font-weight: 500; }
    .dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
    .list { padding-top: 4px; padding-bottom: 4px; }
    .ok { color: var(--ok); }
    .falta { color: var(--ink-3); }
  `,
})
export default class Imposto {
  protected abas = RELATORIOS;
  protected s = inject(Store);
  private lancar = inject(Lancar);
  private toast = inject(Toast);

  protected anoAtual = Number(hoje().slice(0, 4));
  // até maio (prazo da declaração) mostra o ano anterior
  protected ano = signal(Number(hoje().slice(5, 7)) <= 5 ? this.anoAtual - 1 : this.anoAtual);
  protected dados = signal<{ gastos: Gasto[]; pagamentos: Pagamento[] } | null>(null);
  protected verUrl = signal<string | null>(null);
  private req = 0;

  protected dedutiveis = computed(() => new Set(this.s.catGasto().filter((c) => c.dedutivel).map((c) => c.id)));
  protected itens = computed(() => {
    const d = this.dados();
    return d ? deducoesIR(this.ano(), d.gastos, this.s.recorrencias(), d.pagamentos, this.dedutiveis(), mesAtual()) : [];
  });
  protected total = computed(() => soma(this.itens(), (d) => d.valor));
  protected semComprovante = computed(() => this.itens().filter((d) => d.gasto && !d.gasto.comprovante).length);

  protected nomeCat = (d: Deducao) => (d.categoria_id && this.s.catMap().get(d.categoria_id)?.nome) || 'Sem categoria';
  protected quem = (d: Deducao) => (d.pessoa ? (this.s.membroMap().get(d.pessoa) ?? 'Ex-membro') : 'Conta fixa');

  private agrupar(chave: (d: Deducao) => string, cor: (d: Deducao) => string = () => '') {
    const m = new Map<string, { total: number; cor: string }>();
    for (const d of this.itens()) {
      const k = chave(d);
      m.set(k, { total: (m.get(k)?.total ?? 0) + d.valor, cor: cor(d) });
    }
    return [...m].map(([nome, a]) => ({ nome, ...a, pct: pct(a.total, this.total()) })).sort((a, b) => b.total - a.total);
  }
  protected porCategoria = computed(() => this.agrupar(this.nomeCat, (d) => (d.categoria_id && this.s.catMap().get(d.categoria_id)?.cor) || '#94a3b8'));
  protected porPessoa = computed(() => this.agrupar(this.quem));

  constructor() {
    effect(() => {
      const ano = this.ano();
      this.s.mudou();
      if (!this.s.carteiraId()) return;
      untracked(() => this.carregar(ano));
    });
  }

  private async carregar(ano: number) {
    const r = ++this.req;
    this.dados.set(null);
    try {
      const d = await this.s.historico(`${ano}-01-01`, `${ano}-12-31`);
      if (r === this.req) this.dados.set(d);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  /** Com comprovante abre o arquivo; sem, abre o gasto para anexar */
  async abrir(d: Deducao) {
    const c = d.gasto?.comprovante;
    if (!c) return d.gasto && this.lancar.editarGasto(d.gasto);
    try {
      const url = await linkComprovante(c);
      if (ePdf(c)) window.open(url, '_blank');
      else this.verUrl.set(url);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  exportar() {
    const linhas = this.itens().map((d) =>
      [csvData(d.data), csvTexto(d.descricao), csvTexto(this.nomeCat(d)), csvTexto(this.quem(d)), d.gasto?.comprovante ? 'sim' : '', csvValor(d.valor)].join(';'),
    );
    baixarCsv(`cfp-imposto-de-renda-${this.ano()}.csv`, 'Data;Descrição;Categoria;Pessoa;Comprovante;Valor', linhas);
  }
}
