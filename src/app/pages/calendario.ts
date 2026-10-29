import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { diaNoMes, hoje, parse } from '../core/datas';
import { ativaNoMes, noMes, saldoDiario } from '../core/financas';
import { BrlPipe, DiaPipe, MesPipe, soma } from '../core/formato';
import { ContaMes, Gasto } from '../core/models';
import { Store } from '../core/store';
import { Linha } from '../shared/graficos';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';

interface Dia {
  dia: number;
  data: string;
  gasto: number;
  nivel: number;
  contas: ContaMes[];
  entradas: { descricao: string; valor: number; recebida: boolean }[];
  gastos: Gasto[];
  saldo: number;
}

@Component({
  imports: [RouterLink, BrlPipe, DiaPipe, MesPipe, Icon, Linha],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Calendário</h1><span class="muted small cap">{{ s.mes() | mes }}</span></div>

      <section class="card">
        <div class="card-head"><h2>Saldo dia a dia</h2><span class="small muted">previsto</span></div>
        <app-linha [valores]="valores()" [marca]="idxHoje()" />
        <div class="resumo">
          <span>Menor saldo <b class="num" [class.neg]="menor().saldo < 0">{{ menor().saldo | brl }}</b> no dia {{ menor().dia }}</span>
          <span>Fim do mês <b class="num" [class.neg]="fimMes() < 0" [class.pos]="fimMes() >= 0">{{ fimMes() | brl }}</b></span>
        </div>
      </section>

      <section class="card">
        <div class="sem">@for (d of ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']; track $index) { <span>{{ d }}</span> }</div>
        <div class="grade">
          @for (x of vazios(); track $index) { <span></span> }
          @for (d of dias(); track d.dia) {
            <button type="button" class="dia" [attr.data-n]="d.nivel" [class.hoje]="d.data === dataHoje" [class.sel]="sel() === d.dia"
              (click)="sel.set(d.dia)" [attr.aria-label]="d.dia + ': ' + (d.gasto | brl) + ' gastos'">
              <span class="n">{{ d.dia }}</span>
              <span class="pts">
                @for (c of d.contas; track c.ref_id) { <i class="pt" [class.pago]="c.pago" [class.vencida]="!c.pago && d.data < dataHoje"></i> }
                @for (e of d.entradas; track $index) { <i class="pt entra"></i> }
              </span>
            </button>
          }
        </div>
        <div class="leg">
          <span><i class="pt"></i>Conta</span><span><i class="pt vencida"></i>Vencida</span><span><i class="pt pago"></i>Paga</span>
          <span><i class="pt entra"></i>Entrada</span><span><i class="q"></i>Mais gasto no dia</span>
        </div>
        @if (proximoMes().length) {
          <p class="small muted">Pagas com o salário deste mês, vencem no seguinte: {{ proximoMes() }}.</p>
        }
      </section>

      @if (diaSel(); as d) {
        <section class="card">
          <div class="card-head"><h2>{{ d.data | dia }}</h2><span class="small muted">saldo <b class="num" [class.neg]="d.saldo < 0">{{ d.saldo | brl }}</b></span></div>
          <div class="list">
            @for (c of d.contas; track c.ref_id) {
              <a class="row" routerLink="/contas">
                <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
                <div class="grow"><div class="t">{{ c.descricao }}</div><div class="s">{{ c.pago ? 'Paga' : 'Vence neste dia' }}</div></div>
                <span class="v neg">{{ c.valor | brl }}</span>
              </a>
            }
            @for (e of d.entradas; track $index) {
              <a class="row" routerLink="/entradas">
                <span class="ico"><app-icon name="payments" /></span>
                <div class="grow"><div class="t">{{ e.descricao }}</div><div class="s">{{ e.recebida ? 'Recebida' : 'Prevista' }}</div></div>
                <span class="v pos">{{ e.valor | brl }}</span>
              </a>
            }
            @for (g of d.gastos; track g.id) {
              <button class="row" type="button" (click)="lancar.editarGasto(g)">
                <span class="ico"><app-icon [name]="s.catMap().get(g.categoria_id ?? '')?.icone ?? 'help'" /></span>
                <div class="grow"><div class="t">{{ g.descricao }}</div><div class="s">{{ s.catMap().get(g.categoria_id ?? '')?.nome ?? 'Sem categoria' }}</div></div>
                <span class="v">{{ g.valor | brl }}</span>
              </button>
            }
            @if (!d.contas.length && !d.entradas.length && !d.gastos.length) {
              <p class="muted small">Nada neste dia.</p>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .cap { text-transform: capitalize; }
    .resumo { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; margin-top: 10px; font-size: 0.85rem; color: var(--ink-2); }
    .resumo b { color: var(--ink); }
    .resumo b.neg { color: var(--danger); }
    .resumo b.pos { color: var(--ok); }
    .sem, .grade { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
    .sem span { text-align: center; font-size: 0.72rem; font-weight: 700; color: var(--ink-3); padding-bottom: 4px; }
    .dia {
      aspect-ratio: 1; border: 1px solid transparent; border-radius: 10px; background: var(--card-2); color: var(--ink);
      font: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 5px 2px;
    }
    .dia[data-n='1'] { background: color-mix(in srgb, var(--primary) 14%, var(--card-2)); }
    .dia[data-n='2'] { background: color-mix(in srgb, var(--primary) 28%, var(--card-2)); }
    .dia[data-n='3'] { background: color-mix(in srgb, var(--primary) 44%, var(--card-2)); }
    .dia[data-n='4'] { background: color-mix(in srgb, var(--primary) 62%, var(--card-2)); }
    .dia.hoje { border-color: var(--ink); }
    .dia.sel { box-shadow: 0 0 0 2px var(--primary); }
    .n { font-size: 0.82rem; font-weight: 700; }
    .pts { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px; min-height: 6px; }
    .pt { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--warn); }
    .pt.vencida { background: var(--danger); }
    .pt.pago { background: var(--ink-3); }
    .pt.entra { background: var(--ok); }
    .leg { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 12px; font-size: 0.75rem; color: var(--ink-2); }
    .leg span { display: inline-flex; align-items: center; gap: 5px; }
    .q { display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: color-mix(in srgb, var(--primary) 62%, var(--card-2)); }
    @media (min-width: 720px) { .n { font-size: 0.95rem; } .pt { width: 7px; height: 7px; } }
  `,
})
export default class Calendario {
  protected s = inject(Store);
  protected lancar = inject(Lancar);
  protected dataHoje = hoje();

  private saldo = computed(() =>
    saldoDiario(this.s.mes(), this.s.gastos(), this.s.entradasMes(), this.s.recorrenciasPrev(), this.s.contasMes(), this.s.pagamentos(),
      this.s.reservasDia()),
  );
  protected valores = computed(() => this.saldo().map((d) => d.saldo));
  protected menor = computed(() => this.saldo().reduce((m, d) => (d.saldo < m.saldo ? d : m), this.saldo()[0]));
  protected fimMes = computed(() => this.saldo().at(-1)?.saldo ?? 0);
  protected idxHoje = computed(() => (noMes(this.dataHoje, this.s.mes()) ? Number(this.dataHoje.slice(8)) - 1 : null));
  protected vazios = computed(() => Array(parse(this.s.mes()).getDay()));
  protected proximoMes = computed(() =>
    this.s.contasMes().filter((c) => !noMes(c.vencimento, this.s.mes()) && !c.beneficio_id).map((c) => c.descricao).join(', '),
  );

  protected dias = computed<Dia[]>(() => {
    const mes = this.s.mes();
    const gastos = this.s.gastosMes();
    const fixas = this.s.recorrencias().filter((r) => r.tipo === 'entrada' && ativaNoMes(r, mes));
    const totais = this.saldo().map((d) => soma(gastos.filter((g) => g.data === d.data), (g) => g.valor));
    const nz = totais.filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))] ?? 0;
    const cortes = [q(0.25), q(0.5), q(0.75)];
    return this.saldo().map((d, i) => ({
      dia: d.dia,
      data: d.data,
      saldo: d.saldo,
      gasto: totais[i],
      nivel: totais[i] <= 0 ? 0 : 1 + cortes.filter((c) => totais[i] > c).length,
      contas: this.s.contasMes().filter((c) => c.vencimento === d.data),
      entradas: [
        ...fixas.filter((r) => diaNoMes(mes, r.dia) === d.data).map((r) => {
          const p = this.s.pagamentos().find((x) => x.ref_id === r.id && x.mes === mes);
          return { descricao: r.descricao, valor: p?.valor ?? r.valor, recebida: !!p };
        }),
        ...this.s.entradasMes().filter((e) => e.data === d.data).map((e) => ({ descricao: e.descricao, valor: e.valor, recebida: true })),
      ],
      gastos: gastos.filter((g) => g.data === d.data),
    }));
  });

  protected sel = signal(noMes(hoje(), this.s.mes()) ? Number(hoje().slice(8)) : 1);
  protected diaSel = computed(() => this.dias().find((d) => d.dia === this.sel()) ?? null);
}
