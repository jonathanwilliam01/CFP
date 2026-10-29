import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { diaNoMes, nomeMes } from '../core/datas';
import { ativaNoMes, creditoBeneficios, porCategoria } from '../core/financas';
import { BrlPipe, DiaPipe, MesPipe, baixarCsv, csvData, csvTexto, csvValor, moeda, pct, soma } from '../core/formato';
import { Insights } from '../core/insights';
import { Gasto } from '../core/models';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';

@Component({
  imports: [BrlPipe, DiaPipe, MesPipe, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1 class="cap">{{ s.mes() | mes }}</h1>
        <div class="acoes no-print">
          <button class="btn ghost sm" type="button" (click)="exportar()"><app-icon name="download" [size]="16" /> CSV</button>
          <button class="btn ghost sm" type="button" (click)="imprimir()"><app-icon name="picture_as_pdf" [size]="16" /> PDF</button>
          <button class="btn ghost sm" type="button" (click)="compartilhar()"><app-icon name="share" [size]="16" /> Compartilhar</button>
        </div>
      </div>

      <section class="card hero">
        <span class="muted small">Saldo previsto do mês</span>
        <b class="saldo num" [class.neg]="r().saldo < 0">{{ r().saldo | brl }}</b>
        <div class="io">
          <span>Entradas <b class="pos num">{{ r().entradas | brl }}</b></span>
          <span>Saídas <b class="neg num">{{ r().saidas | brl }}</b></span>
        </div>
        @if (r().entradas > 0) {
          <div class="bar" [class.estourado]="sobra() < 0" [class.alerta]="sobra() >= 0 && sobra() < 10">
            <i [style.width.%]="sobra() < 0 ? 100 : sobra()"></i>
          </div>
          <span class="small muted">Sobra de <b>{{ sobra() }}%</b> das entradas</span>
        }
      </section>

      <div class="stats">
        <div class="stat"><div class="l">À vista</div><div class="v">{{ r().avista | brl }}</div></div>
        <div class="stat"><div class="l">Faturas</div><div class="v">{{ r().faturas | brl }}</div></div>
        <div class="stat"><div class="l">Contas fixas</div><div class="v">{{ r().contasFixas | brl }}</div></div>
        <div class="stat"><div class="l">Benefícios</div><div class="v">{{ r().beneficios | brl }}</div></div>
      </div>

      @if (credito() || r().beneficios) {
        <section class="card">
          <div class="card-head"><h2>Com benefícios</h2><a routerLink="/beneficios" class="small">Benefícios</a></div>
          <div class="io">
            <span>Entradas <b class="pos num">{{ r().entradas + credito() | brl }}</b></span>
            <span>Gastos <b class="neg num">{{ r().saidas + r().beneficios | brl }}</b></span>
          </div>
          <p class="muted small">Inclui o crédito do VR/VA e o que foi pago com ele. O saldo acima considera só dinheiro.</p>
        </section>
      }

      <section class="card">
        <div class="card-head"><h2>Consumo do mês</h2>
          @if (consumoAnt() > 0) {
            <span class="badge" [class.perigo]="variacao() > 0" [class.ok]="variacao() <= 0">
              {{ variacao() > 0 ? '▲' : '▼' }} {{ variacao() > 0 ? variacao() : -variacao() }}%
            </span>
          }
        </div>
        <b class="num grande">{{ r().consumo | brl }}</b>
        <p class="muted small">{{ s.gastosMes().length }} gastos · mês anterior {{ consumoAnt() | brl }}</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>Onde mais gastou</h2><a routerLink="/relatorios" class="small">Relatórios</a></div>
        @for (c of top(); track c.id) {
          <div class="row">
            <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
            <div class="grow">
              <div class="t">{{ c.nome }}</div>
              <div class="s">{{ c.pct }}% · {{ c.qtd }} gasto(s)</div>
            </div>
            <div class="v">{{ c.total | brl }}
              @if (c.var !== null) {
                <div class="s" [class.neg]="c.var > 0" [class.pos]="c.var < 0">{{ c.var > 0 ? '▲' : '▼' }} {{ c.var > 0 ? c.var : -c.var }}%</div>
              } @else {
                <div class="s">novo</div>
              }
            </div>
          </div>
        } @empty {
          <div class="empty">Nenhum gasto neste mês</div>
        }
      </section>

      @if (maior(); as g) {
        <section class="card">
          <div class="card-head"><h2>Maior gasto</h2></div>
          <div class="row">
            <span class="ico"><app-icon [name]="(g.categoria_id && s.catMap().get(g.categoria_id)?.icone) || 'payments'" /></span>
            <div class="grow"><div class="t">{{ g.descricao }}</div><div class="s">{{ g.data | dia }}</div></div>
            <div class="v neg">{{ g.valor | brl }}</div>
          </div>
          @if (diaPico(); as d) {
            <p class="small muted">Dia com mais gastos: <b>{{ d.data | dia }}</b> ({{ d.total | brl }})</p>
          }
        </section>
      }

      <section class="card">
        <div class="card-head"><h2>Contas</h2><a routerLink="/contas" class="small">Ver contas</a></div>
        <p>{{ pagas() }} de {{ s.contasMes().length }} pagas · <b class="num">{{ r().pago | brl }}</b> pago</p>
        @if (pendentes().length) {
          <div class="list">
            @for (c of pendentes(); track c.ref_id) {
              <div class="row">
                <span class="ico"><app-icon [name]="c.icone" /></span>
                <div class="grow"><div class="t">{{ c.descricao }}</div><div class="s">vence {{ c.vencimento | dia }}</div></div>
                <div class="v">{{ c.valor | brl }}</div>
              </div>
            }
          </div>
          <p class="small muted">A pagar: <b>{{ r().aPagar | brl }}</b></p>
        }
      </section>

      @if (s.orcamentosStatus().length) {
        <section class="card">
          <div class="card-head"><h2>Orçamentos</h2><a routerLink="/orcamentos" class="small">Ajustar</a></div>
          @for (o of s.orcamentosStatus(); track o.orcamento.id) {
            <div class="orc">
              <div class="l"><span class="tit"><app-icon [name]="o.icone" [size]="16" [style.color]="o.cor" />{{ o.nome }}</span><span class="num small">{{ o.gasto | brl }} / {{ o.orcamento.valor | brl }}</span></div>
              <div class="bar" [class.alerta]="o.nivel === 'alerta'" [class.estourado]="o.nivel === 'estourado'"><i [style.width.%]="o.pct > 100 ? 100 : o.pct"></i></div>
            </div>
          }
        </section>
      }

      <section class="card">
        <div class="card-head"><h2>Dicas</h2></div>
        <div class="dicas">
          @for (d of insights.dicas(); track d.titulo) {
            <div class="aviso"><app-icon class="i" [name]="d.icone" /><div><div class="t">{{ d.titulo }}</div><div class="s">{{ d.texto }}</div></div></div>
          }
        </div>
      </section>
    </div>
  `,
  styles: `
    .cap { text-transform: capitalize; }
    .hero { display: flex; flex-direction: column; gap: 8px; }
    .saldo { font-size: 2rem; font-weight: 800; letter-spacing: -0.02em; }
    .io { display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.88rem; color: var(--ink-2); }
    .grande { font-size: 1.5rem; font-weight: 800; }
    .orc { display: flex; flex-direction: column; gap: 6px; padding: 8px 0; }
    .orc .l { display: flex; justify-content: space-between; gap: 8px; font-weight: 600; }
    .acoes { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .dicas { display: flex; flex-direction: column; gap: 8px; }
  `,
})
export default class Resumo {
  protected s = inject(Store);
  protected insights = inject(Insights);
  private toast = inject(Toast);

  protected r = this.s.resumo;
  protected credito = computed(() => creditoBeneficios(this.s.beneficios(), this.s.mes()));
  protected sobra = computed(() => pct(this.r().saldo, this.r().entradas));
  protected consumoAnt = computed(() => soma(this.s.gastosMesAnterior(), (g) => g.valor));
  protected variacao = computed(() => {
    const a = this.consumoAnt();
    return a > 0 ? Math.round((this.r().consumo / a - 1) * 100) : 0;
  });

  protected top = computed(() => {
    const ant = new Map(porCategoria(this.s.gastosMesAnterior(), this.s.catMap()).map((c) => [c.id, c.total]));
    return porCategoria(this.s.gastosMes(), this.s.catMap())
      .slice(0, 6)
      .map((c) => {
        const a = ant.get(c.id);
        return { ...c, var: a ? Math.round((c.total / a - 1) * 100) : null };
      });
  });

  protected maior = computed(() => this.s.gastosMes().reduce<Gasto | null>((m, g) => (!m || g.valor > m.valor ? g : m), null));

  protected diaPico = computed(() => {
    const m = new Map<string, number>();
    for (const g of this.s.gastosMes()) m.set(g.data, (m.get(g.data) ?? 0) + g.valor);
    let pico: { data: string; total: number } | null = null;
    for (const [data, total] of m) if (!pico || total > pico.total) pico = { data, total };
    return pico;
  });

  protected pagas = computed(() => this.s.contasMes().filter((c) => c.pago).length);
  protected pendentes = computed(() => this.s.contasMes().filter((c) => !c.pago));

  /** Tudo do mês num CSV: gastos (pela data), entradas avulsas e fixas, contas e faturas */
  exportar() {
    const s = this.s;
    const mes = s.mes();
    const cat = (id: string | null) => csvTexto((id && s.catMap().get(id)?.nome) || '');
    const cartoes = new Map(s.cartoes().map((c) => [c.id, c.nome]));
    const benef = new Map(s.beneficios().map((b) => [b.id, b.nome]));
    const membros = s.membroMap();
    const gastos = [...s.gastosMes()].sort((a, b) => a.data.localeCompare(b.data)).map((g) =>
      ['Gasto', csvData(g.data), csvTexto(g.descricao), cat(g.categoria_id),
        csvTexto(g.forma === 'cartao' ? (cartoes.get(g.cartao_id!) ?? 'Cartão') : g.forma === 'beneficio' ? (benef.get(g.beneficio_id!) ?? 'Benefício') : 'À vista'),
        csvTexto((g.criado_por && membros.get(g.criado_por)) || ''), '', csvValor(g.valor)].join(';'));
    const avulsas = s.entradasMes().map((e) => ['Entrada', csvData(e.data), csvTexto(e.descricao), cat(e.categoria_id), '', '', '', csvValor(e.valor)].join(';'));
    const fixas = s.recorrenciasPrev().filter((r) => r.tipo === 'entrada' && ativaNoMes(r, mes)).map((r) => {
      const p = s.pagamentos().find((x) => x.ref_id === r.id && x.mes === mes);
      return ['Entrada fixa', csvData(diaNoMes(mes, r.dia)), csvTexto(r.descricao), cat(r.categoria_id), '', '', p ? 'Recebida' : 'Prevista', csvValor(p?.valor ?? r.valor)].join(';');
    });
    const contas = s.contasMes().map((c) =>
      [c.tipo === 'fatura' ? 'Fatura' : 'Conta', csvData(c.vencimento), csvTexto(c.descricao), '', '', '', c.pago ? 'Paga' : 'Em aberto', csvValor(c.valor)].join(';'));
    baixarCsv(`cfp-${mes.slice(0, 7)}.csv`, 'Tipo;Data;Descrição;Categoria;Pagamento;Pessoa;Situação;Valor', [...gastos, ...avulsas, ...fixas, ...contas]);
  }

  /** "Salvar como PDF" na janela de impressão do navegador */
  imprimir() {
    print();
  }

  async compartilhar() {
    const r = this.r();
    const linhas = [
      `CFP · Resumo de ${nomeMes(this.s.mes())}`,
      `Entradas: ${moeda(r.entradas)}`,
      `Saídas: ${moeda(r.saidas)}`,
      ...(this.credito() || r.beneficios ? [`Com benefícios: entradas ${moeda(r.entradas + this.credito())} · gastos ${moeda(r.saidas + r.beneficios)}`] : []),
      `Saldo previsto: ${moeda(r.saldo)}${r.entradas > 0 ? ` (sobra de ${this.sobra()}%)` : ''}`,
      `Consumo: ${moeda(r.consumo)}`,
      '',
      'Onde mais gastamos:',
      ...this.top().slice(0, 3).map((c, i) => `${i + 1}. ${c.nome}: ${moeda(c.total)} (${c.pct}%)`),
      '',
      `Contas pagas: ${this.pagas()}/${this.s.contasMes().length} · a pagar ${moeda(r.aPagar)}`,
    ];
    const text = linhas.join('\n');
    try {
      if (navigator.share) await navigator.share({ title: 'Resumo CFP', text });
      else {
        await navigator.clipboard.writeText(text);
        this.toast.ok('Resumo copiado');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') this.toast.erro(e);
    }
  }
}
