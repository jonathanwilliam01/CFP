import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { addDias, addMeses, fimMes as ultimoDia, hoje, inicioMes, mesAtual, parse } from '../core/datas';
import { ativaNoMes, dataEntrada, noMes, saldoDiario } from '../core/financas';
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

      <div class="seg">
        <button type="button" [class.on]="vista() === 'mes'" (click)="trocarVista('mes')"><app-icon name="calendar_month" [size]="16" />Mês</button>
        <button type="button" [class.on]="vista() === 'semana'" (click)="trocarVista('semana')"><app-icon name="view_week" [size]="16" />Semana</button>
      </div>

      @if (vista() === 'semana') {
        <section class="card">
          <div class="nav-sem">
            <button class="btn ghost icon sm" type="button" (click)="mudarSemana(-1)" aria-label="Semana anterior"><app-icon name="chevron_left" /></button>
            <div class="tit-sem"><b>{{ rotuloSemana() }}</b><span class="small muted">gastos <b class="num">{{ totalSemana() | brl }}</b></span></div>
            <button class="btn ghost icon sm" type="button" (click)="mudarSemana(1)" aria-label="Próxima semana"><app-icon name="chevron_right" /></button>
          </div>
        </section>
        <div class="semana">
          @for (x of semana(); track x.data) {
            <section class="card sd" [class.hoje]="x.data === dataHoje" [class.fora]="!x.d" [class.livre]="x.d && !x.d.contas.length && !x.d.entradas.length && !x.d.gastos.length">
              <div class="sd-h">
                <span class="cap"><b>{{ x.nome }}</b> {{ x.dia }}</span>
                @if (x.d) { <b class="num" [class.muted]="!x.d.gasto">{{ x.d.gasto | brl }}</b> }
              </div>
              @if (x.d; as d) {
                <div class="its">
                  @for (c of d.contas; track c.ref_id) {
                    <a class="it" routerLink="/contas"><i class="pt" [class.pago]="c.pago" [class.vencida]="!c.pago && d.data < dataHoje"></i>
                      <span class="t">{{ c.descricao }}</span><span class="v neg">{{ c.valor | brl }}</span></a>
                  }
                  @for (e of d.entradas; track $index) {
                    <a class="it" routerLink="/entradas"><i class="pt entra"></i><span class="t">{{ e.descricao }}</span><span class="v pos">{{ e.valor | brl }}</span></a>
                  }
                  @for (g of d.gastos; track g.id) {
                    @if (s.livreDeOutro(g)) {
                      <div class="it"><i class="pt" [style.background]="'#94a3b8'"></i><span class="t">Dinheiro livre de {{ s.nomeAutor(g.criado_por) }}</span><span class="v">{{ g.valor | brl }}</span></div>
                    } @else {
                      <button class="it" type="button" (click)="lancar.editarGasto(g)"><i class="pt" [style.background]="s.catMap().get(g.categoria_id ?? '')?.cor ?? '#94a3b8'"></i>
                        <span class="t">{{ g.descricao }}</span><span class="v">{{ g.valor | brl }}</span></button>
                    }
                  }
                </div>
              } @else {
                <button class="link" type="button" (click)="s.mes.set(x.mes)">Ver <span class="cap">{{ x.mes | mes }}</span></button>
              }
            </section>
          }
        </div>
      } @else {
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
              @if (s.livreDeOutro(g)) {
                <div class="row">
                  <span class="ico"><app-icon name="wallet" /></span>
                  <div class="grow"><div class="t">Dinheiro livre de {{ s.nomeAutor(g.criado_por) }}</div><div class="s">Só o total aparece</div></div>
                  <span class="v">{{ g.valor | brl }}</span>
                </div>
              } @else {
              <button class="row" type="button" (click)="lancar.editarGasto(g)">
                <span class="ico" [style.background]="(s.catMap().get(g.categoria_id ?? '')?.cor ?? '#94a3b8') + '22'" [style.color]="s.catMap().get(g.categoria_id ?? '')?.cor ?? '#94a3b8'"><app-icon [name]="s.catMap().get(g.categoria_id ?? '')?.icone ?? 'help'" /></span>
                <div class="grow"><div class="t">{{ g.descricao }}</div><div class="s">{{ s.catMap().get(g.categoria_id ?? '')?.nome ?? 'Sem categoria' }}</div></div>
                <span class="v">{{ g.valor | brl }}</span>
              </button>
              }
            }
            @if (!d.contas.length && !d.entradas.length && !d.gastos.length) {
              <p class="muted small">Nada neste dia.</p>
            }
          </div>
        </section>
      }
      }
    </div>
  `,
  styles: `
    .cap { text-transform: capitalize; }
    .resumo { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; margin-top: 10px; font-size: 0.85rem; color: var(--ink-2); }
    .resumo b { color: var(--ink); }
    .resumo b.neg { color: var(--danger); }
    .resumo b.pos { color: var(--ok); }
    .sem, .grade { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
    .sem span { text-align: center; font-size: 0.72rem; font-weight: 700; color: var(--ink-3); padding-bottom: 4px; }
    .dia {
      aspect-ratio: 1; min-width: 0; overflow: hidden; border: 1px solid transparent; border-radius: 10px; background: var(--card-2); color: var(--ink);
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
    .nav-sem { display: flex; align-items: center; gap: 8px; }
    .tit-sem { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
    .semana { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
    .sd { padding: 10px 12px; min-width: 0; }
    .sd.hoje { border-color: var(--primary); }
    .sd.fora { opacity: 0.6; }
    .sd-h {
      display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-size: 0.9rem;
      padding-bottom: 8px; margin-bottom: 4px; border-bottom: 1px solid var(--line);
    }
    .its { display: flex; flex-direction: column; }
    .sd.livre { padding-block: 8px; opacity: 0.7; }
    .sd.livre .sd-h { border: 0; padding: 0; margin: 0; }
    .sd.livre .its { display: none; }
    .it + .it { border-top: 1px dashed var(--line); }
    .it {
      display: flex; align-items: center; gap: 8px; min-width: 0; padding: 8px 0; border: 0; background: none; font: inherit; font-size: 0.82rem;
      color: inherit; text-align: left; text-decoration: none; cursor: pointer; width: 100%;
    }
    div.it { cursor: default; }
    .it .t { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .it .v { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .it .pt { flex-shrink: 0; }
    .link { background: none; border: 0; padding: 0; font: inherit; font-size: 0.82rem; font-weight: 700; color: var(--primary); cursor: pointer; }
    @media (min-width: 900px) {
      .semana { grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
      .sd { padding: 8px; }
      .sd-h { flex-direction: column; gap: 0; }
      .it { padding: 5px 0; }
      .it { flex-wrap: wrap; gap: 2px 4px; }
      .it .t { flex-basis: calc(100% - 12px); }
      .it .v { margin-left: 12px; font-size: 0.78rem; }
    }
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
    // entrada que cai no mês seguinte: aparece no dia em que cai (a do mês anterior cai neste)
    const fixas = [addMeses(mes, -1), mes].flatMap((m) =>
      this.s.recorrencias().filter((r) => r.tipo === 'entrada' && ativaNoMes(r, m)).map((r) => ({ r, m, data: dataEntrada(r, m) })),
    );
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
      contas: this.s.contasMes().filter((c) => c.vencimento === d.data && c.tipo !== 'parcela'),
      entradas: [
        ...fixas.filter((f) => f.data === d.data).map(({ r, m }) => {
          const p = this.s.pagamentos().find((x) => x.ref_id === r.id && x.mes === m);
          return { descricao: r.descricao, valor: p?.valor ?? r.valor, recebida: !!p };
        }),
        ...this.s.entradasMes().filter((e) => e.data === d.data).map((e) => ({ descricao: e.descricao, valor: e.valor, recebida: true })),
      ],
      gastos: gastos.filter((g) => g.data === d.data),
    }));
  });

  protected sel = signal(noMes(hoje(), this.s.mes()) ? Number(hoje().slice(8)) : 1);
  protected diaSel = computed(() => this.dias().find((d) => d.dia === this.sel()) ?? null);

  protected vista = signal<'mes' | 'semana'>(lerVista());
  /** segunda-feira da semana exibida */
  protected semIni = signal(semanaInicial(this.s.mes()));

  /** 7 dias seg–dom; dia fora do mês carregado fica sem dados (botão leva ao mês dele) */
  protected semana = computed(() => {
    const porData = new Map(this.dias().map((d) => [d.data, d]));
    return Array.from({ length: 7 }, (_, i) => {
      const data = addDias(this.semIni(), i);
      return { data, dia: Number(data.slice(8)), nome: DIAS[i], mes: inicioMes(data), d: porData.get(data) ?? null };
    });
  });
  protected totalSemana = computed(() => soma(this.semana(), (x) => x.d?.gasto ?? 0));
  protected rotuloSemana = computed(() => {
    const ini = parse(this.semIni());
    const fim = parse(addDias(this.semIni(), 6));
    const f = (d: Date, mes: boolean) => d.toLocaleDateString('pt-BR', mes ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
    return `${f(ini, ini.getMonth() !== fim.getMonth())} – ${f(fim, true)}`;
  });

  constructor() {
    // troca de mês por fora (seletor, gesto): semana volta para a inicial se não toca o mês novo
    effect(() => {
      const mes = this.s.mes();
      untracked(() => {
        const ini = this.semIni();
        if (addDias(ini, 6) < mes || ini > ultimoDia(mes)) this.semIni.set(semanaInicial(mes));
      });
    });
  }

  trocarVista(v: 'mes' | 'semana') {
    this.vista.set(v);
    try {
      localStorage.setItem('cfp.calendario.vista', v);
    } catch {}
  }

  mudarSemana(n: number) {
    const ini = addDias(this.semIni(), 7 * n);
    const fim = addDias(ini, 6);
    this.semIni.set(ini);
    const mes = this.s.mes();
    if (fim < mes) this.s.mes.set(inicioMes(fim));
    else if (ini > ultimoDia(mes)) this.s.mes.set(inicioMes(ini));
  }
}

const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

const segunda = (d: string) => addDias(d, -((parse(d).getDay() + 6) % 7));

/** semana de hoje no mês atual; nos outros, a do dia 1 */
const semanaInicial = (mes: string) => segunda(mes === mesAtual() ? hoje() : mes);

function lerVista(): 'mes' | 'semana' {
  try {
    return localStorage.getItem('cfp.calendario.vista') === 'semana' ? 'semana' : 'mes';
  } catch {
    return 'mes';
  }
}
