import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { addMeses, diffDias, hoje, mesAtual, nomeMes } from '../core/datas';
import { Recebimento, Transferencia, creditoBeneficios, noMes, parcelasDoMes, porCategoria, proximoRecebimento, ritmoMes, saldoBeneficio, saldoDiario, variacaoGastos } from '../core/financas';
import { BrlPipe, DiaPipe, MesPipe, PrivPipe, moeda, pct, soma } from '../core/formato';
import { Insights } from '../core/insights';
import { Store } from '../core/store';
import { Avatar } from '../shared/avatar';
import { Autor } from '../shared/autor';
import { Bloco } from '../shared/bloco';
import { Donut, Linha } from '../shared/graficos';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';
import { Valor } from '../shared/valor';
import { Painel } from '../core/painel';
import { PrimeirosPassos } from '../shared/primeiros-passos';

@Component({
  imports: [RouterLink, BrlPipe, DiaPipe, MesPipe, PrivPipe, Donut, Linha, Icon, Avatar, Autor, Bloco, Valor, PrimeirosPassos],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <section class="saldo">
        <div class="topo">
          <small [title]="variacaoTxt()">Saldo previsto do mês</small>
          <span class="acoes-topo">
            @if (temBenef()) {
              <button type="button" class="modo" (click)="alternarBenef()">{{ comBenef() ? 'Com benefícios' : 'Só dinheiro' }}<span aria-hidden="true">⇄</span></button>
            }
            <button type="button" class="modo so-icone" (click)="painel.alternarCompacto()" [attr.aria-pressed]="compacto()" [attr.aria-label]="compacto() ? 'Mostrar todos os blocos' : 'Só o resumo'" [title]="compacto() ? 'Mostrar todos os blocos' : 'Só o resumo'">
              <app-icon [name]="compacto() ? 'unfold_more' : 'unfold_less'" [size]="16" />
            </button>
          </span>
        </div>
        @if (s.carregandoMes() && !s.gastos().length && !r().entradas) {
          <span class="esqueleto grande"></span>
        } @else {
          <strong class="num" [class.sobe]="saldo().saldo >= 0" [class.desce]="saldo().saldo < 0"><app-valor [v]="saldo().saldo" /></strong>
        }
        <div class="es">
          <a routerLink="/entradas"><i class="sobe">↑</i> <b class="num">{{ saldo().entradas | brl }}</b> entradas</a>
          <a routerLink="/contas" [title]="r().reservado > 0 ? 'Inclui ' + (r().reservado | brl) + ' reservados em orçamentos' : ''"><i class="desce">↓</i> <b class="num">{{ saldo().saidas | brl }}</b> saídas</a>
        </div>
        @if (r().saidas > 0) {
          <div class="pago">
            <div class="bar"><i [style.width.%]="pctPago()"></i></div>
            <span>{{ r().pago | brl }} pago · {{ r().aPagar | brl }} a pagar</span>
          </div>
        }
        @if (s.previsao(); as pv) {
          <a class="receb prev" routerLink="/planejamento" [class.neg]="pv.sobra < 0"
            [title]="'Dia a dia de ' + (pv.ritmo | brl) + '/dia; ainda devem sair ' + (pv.aSair | brl) + ' até o fim do mês'">
            <app-icon name="insights" [size]="16" />
            <span>No ritmo atual, fecha o mês com <b class="num">{{ pv.sobra | brl }}</b></span>
            @if (pv.resta > 0) { <small class="num">até {{ pv.porDia | brl }}/dia{{ pv.alvo ? ' p/ meta' : '' }}</small> }
          </a>
        }
        @if (proxReceb(); as p) {
          <a class="receb" routerLink="/entradas"><app-icon name="payments" [size]="16" />
            <span>{{ p.nome }} {{ p.dias === 0 ? 'hoje' : p.dias === 1 ? 'amanhã' : 'em ' + p.dias + ' dias' }}</span>
            <b class="num">{{ p.valor | brl }}</b></a>
        }
        @if (s.viagemAtiva(); as v) {
          <a class="receb" routerLink="/viagens" [title]="'Gastos com #' + v.tag"><app-icon name="flight" [size]="16" /><span>Modo viagem: {{ v.nome }}</span></a>
        }
        @if (s.meta(); as m) {
          <a class="meta" routerLink="/config" [class.ok]="m.ok" [title]="'Sobra prevista ' + m.prevista + '%'">
            <span><app-icon [name]="m.ok ? 'check_circle' : 'savings'" [size]="14" />Meta de sobra {{ m.meta }}% · prevista {{ m.prevista }}%</span>
            <div class="bar"><i [style.width.%]="m.pct"></i></div>
          </a>
        }
      </section>

      <app-primeiros-passos />

      @if (mostrarFechamento()) {
        <div class="aviso info fech">
          <app-icon class="i" name="task_alt" />
          <a class="grow t" routerLink="/fechamento" (click)="dispensarFechamento()">Fechamento de {{ mesAnterior() | mes }}</a>
          <button type="button" class="dispensar" aria-label="Agora não" title="Agora não" (click)="dispensarFechamento()"><app-icon name="close" [size]="18" /></button>
        </div>
      }

      <div class="grupo">
        @if (avisos().length) {
          <section class="avisos" bloco="avisos">
            @for (a of avisos(); track a.id) {
              <a class="aviso" [class]="a.nivel" [routerLink]="a.link ?? '/notificacoes'">
                <app-icon class="i" [name]="a.icone" />
                <div class="grow"><div class="t">{{ a.titulo }}</div><div class="s">{{ a.texto | priv }}</div></div>
                <button type="button" class="dispensar" aria-label="Dispensar até o mês que vem" title="Dispensar até o mês que vem"
                  (click)="$event.preventDefault(); $event.stopPropagation(); insights.dispensar(a.id)"><app-icon name="close" [size]="18" /></button>
              </a>
            }
            @if (insights.avisos().length > avisos().length) {
              <a routerLink="/notificacoes" class="small">Ver todos os {{ insights.avisos().length }} avisos →</a>
            }
          </section>
        }

        @if (proximas().length) {
          <section class="card" bloco="proximas">
            <div class="card-head"><h2>Próximas contas</h2><a routerLink="/contas" class="small">Ver todas</a></div>
            <div class="list">
              @for (c of proximas(); track c.ref_id) {
                <a class="row" routerLink="/contas">
                  <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
                  <div class="grow"><div class="t">{{ c.descricao }}</div><div class="s">{{ c.vencimento | dia }}@if (status(c.vencimento)) { · <span [class]="'st ' + status(c.vencimento)">{{ rotulo(c.vencimento) }}</span> }</div></div>
                  <span class="v">{{ c.valor | brl }}</span>
                </a>
              }
            </div>
          </section>
        }
      </div>

      <div class="grupo">
        @if (recebimentos().length) {
          <section class="card" bloco="recebimento">
            <div class="card-head"><h2>Por recebimento</h2>
              <span class="acoes">
                @if (s.entradaMesSeguinte()) { <button type="button" class="btn ghost sm" (click)="s.trocarRecebimento()" [title]="s.recebimentoModo() === 'mes' ? 'No mês: o que cai neste mês' : 'Competência: entradas e contas deste mês'">{{ s.recebimentoModo() === 'mes' ? 'No mês' : 'Competência' }}<app-icon name="swap_horiz" [size]="16" /></button> }
                <a routerLink="/contas" class="small">Contas</a>
              </span></div>
            <div class="list">
              @for (g of recebimentos(); track g.data) {
                <a class="rec" routerLink="/contas" [title]="detalheRec(g)">
                  <span class="grow"><b>{{ dm(g.data) }}</b> <span class="nm">{{ nomeRec(g) }}</span>
                    <span class="s">Recebe {{ g.recebe | brl }} · a pagar {{ g.aPagar | brl }}{{ g.reservado ? ' · ⚑ ' + (g.reservado | brl) : '' }}</span></span>
                  <span class="dirr"><span class="s">Sobra</span><b class="num" [class.neg]="g.sobra < 0">{{ g.sobra | brl }}</b></span>
                </a>
              }
            </div>
          </section>
        }

        @if (s.orcamentosStatus().length) {
          <section class="card" bloco="orcamentos">
            <div class="card-head"><h2>Orçamentos</h2><a routerLink="/orcamentos" class="small">Ver</a></div>
            @for (o of s.orcamentosStatus().slice(0, 4); track o.orcamento.id) {
              <div class="orc">
                <div class="l"><span class="tit"><app-icon [name]="o.icone" [size]="16" [style.color]="o.cor" />{{ o.nome }}{{ o.pagamento ? ' · ' + o.pagamento : '' }}</span><span class="num small">{{ o.gasto | brl }} / {{ o.orcamento.valor | brl }}</span></div>
                <div class="ritmo"><div class="bar" [class]="o.nivel"><i [style.width.%]="o.pct > 100 ? 100 : o.pct"></i></div>
                  @if (ritmo() !== null) { <i class="marca" [style.left.%]="ritmo()" [title]="'Onde o gasto deveria estar hoje (' + ritmo() + '% do mês)'"></i> }</div>
              </div>
            }
          </section>
        }

        @if (beneficios().length || s.cofrinhos().length) {
          <section class="card" bloco="saldos">
            <div class="card-head"><h2>Saldos</h2><a routerLink="/cofrinhos" class="small">Cofrinhos</a></div>
            <div class="list">
              @for (b of beneficios(); track b.id) {
                <a class="sl" routerLink="/beneficios"><span class="li"><app-icon name="restaurant" [size]="16" />{{ b.nome }}</span><b class="num" [class.neg]="b.saldo < 0">{{ b.saldo | brl }}</b></a>
              }
              @if (s.reserva(); as r) {
                @if (r.meses !== null) {
                  <a class="sl" routerLink="/cofrinhos"><span class="li"><app-icon name="health_and_safety" [size]="16" />Reserva cobre</span><b class="num" [class.neg]="r.meses < 3">{{ r.meses }} {{ r.meses === 1 ? 'mês' : 'meses' }}</b></a>
                }
              }
              @for (c of cofrinhos(); track c.id) {
                <a class="sl" [routerLink]="['/cofrinhos', c.id]" [title]="c.meta > 0 ? c.pct + '% da meta' : ''">
                  <span class="li"><app-icon [name]="c.icone" [size]="16" [style.color]="c.cor" />{{ c.nome }}@if (c.meta > 0) { <small class="muted">{{ c.pct }}%</small> }</span>
                  <b class="num">{{ c.guardado | brl }}</b></a>
              }
            </div>
          </section>
        }

        <section class="card" bloco="ultimos">
          <div class="card-head"><h2>Últimos gastos</h2><a routerLink="/gastos" class="small">Ver todos</a></div>
          <div class="list">
            @for (g of s.gastosMes().slice(0, 5); track g.id) {
              @if (s.livreDeOutro(g)) {
                <div class="row">
                  <span class="ico"><app-icon name="lock" /></span>
                  <div class="grow"><div class="t">Dinheiro livre de {{ s.nomeAutor(g.criado_por) }}</div><div class="s">{{ g.data | dia }}</div></div>
                  <app-autor [id]="g.criado_por" />
                  <span class="v">{{ g.valor | brl }}</span>
                </div>
              } @else {
                <button class="row" (click)="lancar.editarGasto(g)">
                  <span class="ico" [style.background]="(s.catMap().get(g.categoria_id ?? '')?.cor ?? '#94a3b8') + '22'" [style.color]="s.catMap().get(g.categoria_id ?? '')?.cor ?? '#94a3b8'"><app-icon [name]="s.catMap().get(g.categoria_id ?? '')?.icone ?? 'help'" /></span>
                  <div class="grow"><div class="t">{{ g.descricao }}</div><div class="s">{{ g.data | dia }}</div></div>
                  <app-autor [id]="g.criado_por" />
                  <span class="v">{{ g.valor | brl }}</span>
                </button>
              }
            } @empty {
              <div class="empty"><app-icon class="big" name="receipt_long" [size]="40" />Nenhum gasto neste mês ainda.
                <button class="btn sm" (click)="lancar.novo('gasto')">Lançar primeiro gasto</button>
              </div>
            }
          </div>
        </section>

        @if (insights.dicas()[0]; as d) {
          <a class="card dica" routerLink="/resumo" bloco="dica" [title]="d.texto | priv">
            <app-icon class="i" [name]="d.icone" [size]="22" />
            <div class="grow"><b>{{ d.titulo }}</b><span class="small muted">{{ d.texto | priv }}</span></div>
          </a>
        }
      </div>

      @if (compacto()) {
        <button type="button" class="btn ghost block" (click)="painel.alternarCompacto()"><app-icon name="unfold_more" [size]="18" />Mostrar o painel completo</button>
      } @else if (temAnalises()) {
        <details class="card mais" [open]="verAnalises()" (toggle)="lembrarAnalises($event)">
          <summary><app-icon name="insights" [size]="18" />Mais análises<span class="small muted">{{ analisesResumo() }}</span></summary>
          <div class="grupo">
            @if (r().entradas > 0 || r().saidas > 0) {
              <section bloco="diaadia">
                <div class="card-head"><h2>Saldo dia a dia</h2><a routerLink="/calendario" class="small">Calendário</a></div>
                <app-linha [valores]="curva()" [marca]="idxHoje()" />
                <p class="small muted cv">Menor saldo <b class="num" [class.neg]="menor().saldo < 0">{{ menor().saldo | brl }}</b> no dia {{ menor().dia }}</p>
              </section>
            }

            @if (comp(); as c) {
              <section bloco="comprometida">
                <div class="card-head"><h2 [title]="c.preso + '% das entradas presos em contas fixas e parcelas'">Renda comprometida</h2><b class="num" [class.neg]="c.preso >= 70">{{ c.preso }}%</b></div>
                <div class="comp" role="img" [attr.aria-label]="c.preso + '% das entradas em contas fixas e parcelas'">
                  @for (p of c.partes; track p.nome) { @if (p.pct > 0) { <i [style.flex-grow]="p.pct" [style.background]="p.cor" [title]="p.nome + ': ' + (p.valor | brl)"></i> } }
                </div>
                <div class="leg">
                  @for (p of c.partes; track p.nome) { @if (p.valor > 0) { <span><i [style.background]="p.cor"></i>{{ p.nome }} <b class="num">{{ p.pct }}%</b></span> } }
                </div>
              </section>
            }

            @if (pessoas().length > 1) {
              <section bloco="pessoas">
                <div class="card-head"><h2>Quem gastou o quê</h2>@if (diferenca(); as d) { <span class="small muted">{{ d.nome }} +{{ d.valor | brl }}</span> }</div>
                @for (p of pessoas(); track p.id) {
                  <div class="pes">
                    <app-avatar [size]="28" [foto]="p.foto" [nome]="p.nome" />
                    <div class="grow">
                      <div class="l"><b>{{ p.nome }}</b><span class="num">{{ p.total | brl }}</span></div>
                      <div class="bar"><i [style.width.%]="p.pct"></i></div>
                    </div>
                  </div>
                }
                @if (s.acerto(); as a) {
                  <div class="acerto">
                    @for (t of a.transferencias; track t.de + t.para) {
                      <div class="l" [title]="'Divididos ' + (a.total | brl) + ' · ' + (a.partes ? partesTexto(a.partes) : (a.parte | brl) + ' para cada')">
                        <span><b>{{ nomeDe(t.de) }}</b> deve {{ t.valor | brl }} para <b>{{ nomeDe(t.para) }}</b></span>
                        <button class="btn ghost sm" type="button" (click)="acertar(t)">Acertar</button>
                      </div>
                    } @empty {
                      @if (a.total > 0) { <span class="small pos">Tudo acertado no mês.</span> }
                    }
                  </div>
                }
              </section>
            }

            @if (cats().length) {
              <section bloco="onde">
                <div class="card-head"><h2>Onde está indo o dinheiro</h2><a routerLink="/relatorios" class="small">Relatórios</a></div>
                <div class="onde">
                  <app-donut [fatias]="fatias()" [size]="112" rotulo="Gasto no mês" />
                  <div class="list top">
                    @for (c of cats().slice(0, 5); track c.nome) {
                      <div class="cat">
                        <app-icon [name]="c.icone" [size]="18" [style.color]="c.cor" />
                        <div class="grow">
                          <div class="l"><b>{{ c.nome }}</b><span class="num">{{ c.total | brl }}</span></div>
                          <div class="bar"><i [style.width.%]="c.pct" [style.background]="c.cor"></i></div>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              </section>
            }
          </div>
        </details>
      }
    </div>
  `,
  styles: `
    .saldo {
      background: var(--hero);
      color: var(--hero-ink); border-radius: 22px; padding: 16px 18px; display: flex; flex-direction: column; gap: 4px;
      box-shadow: var(--hero-shadow);
    }
    .saldo small { opacity: 0.8; font-weight: 600; }
    .topo { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .acoes-topo { display: flex; gap: 6px; }
    .acoes { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 8px; }
    .so-icone { padding: 4px 6px; }
    .topo small { white-space: nowrap; }
    .esqueleto.grande { height: 2.4rem; width: 60%; margin: 4px 0; opacity: 0.6; }
    .modo {
      border: 0; background: var(--hero-glass); color: inherit; font: inherit; font-size: 0.72rem; font-weight: 700;
      padding: 4px 10px; border-radius: 999px; cursor: pointer; display: inline-flex; gap: 6px;
    }
    .saldo strong { font-size: 2.1rem; font-weight: 800; letter-spacing: -0.03em; }
    .es { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 0.82rem; }
    .es a { color: inherit; opacity: 0.9; }
    .es i { font-style: normal; font-weight: 800; }
    .sobe { color: var(--hero-sobe); }
    .desce { color: var(--hero-desce); }
    .pago { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; font-size: 0.75rem; opacity: 0.85; }
    .pago .bar { background: var(--hero-trilho); }
    .pago .bar i { background: var(--hero-barra); }
    .receb { display: flex; align-items: center; gap: 6px; margin-top: 6px; padding: 6px 10px; border-radius: 12px; background: var(--hero-glass); color: inherit; font-size: 0.78rem; font-weight: 600; }
    .receb span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .prev small { flex-shrink: 0; opacity: 0.85; font-weight: 600; }
    .prev.neg b { color: var(--hero-desce); }
    .meta { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; color: inherit; font-size: 0.75rem; font-weight: 600; opacity: 0.9; }
    .meta span { display: inline-flex; align-items: center; gap: 5px; }
    .meta .bar { background: var(--hero-trilho); height: 4px; }
    .meta .bar i { background: var(--warn); }
    .meta.ok .bar i { background: var(--hero-sobe); }
    .grupo { display: flex; flex-direction: column; gap: 14px; }
    .grupo:empty { display: none; }
    [bloco] .card-head h2 { cursor: pointer; display: inline-flex; align-items: center; gap: 2px; }
    [bloco] .card-head h2::after { content: 'expand_less'; font-family: 'Material Symbols Rounded'; font-feature-settings: 'liga'; font-weight: 400; font-size: 20px; line-height: 1; color: var(--ink-3); }
    .fechado .card-head h2::after { content: 'expand_more'; }
    .fechado > :not(.card-head) { display: none; }
    .fechado .card-head { margin-bottom: 0; }
    details [bloco] + [bloco] { border-top: 1px solid var(--line); padding-top: 14px; }
    details [bloco] h2 { font-size: 0.95rem; margin: 0; }
    .avisos { display: flex; flex-direction: column; gap: 8px; }
    .avisos .grow { flex: 1; min-width: 0; }
    .fech { align-items: center; }
    .fech .t { color: inherit; font-weight: 700; }
    .dispensar { border: 0; background: none; color: var(--ink-3); padding: 2px; margin: -2px -4px 0 0; cursor: pointer; display: grid; place-items: center; }
    .st { font-weight: 700; }
    .st.perigo { color: var(--danger, #ef4444); }
    .st.alerta { color: var(--warn); }
    .rec, .sl { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; color: var(--ink); border-bottom: 1px solid var(--line); font-size: 0.88rem; }
    .rec:last-child, .sl:last-child { border-bottom: 0; }
    .rec .grow { flex: 1; min-width: 0; }
    .rec .nm { color: var(--ink-2); margin-left: 6px; }
    .rec .s, .dirr .s { display: block; font-size: 0.75rem; color: var(--ink-3); }
    .dirr { text-align: right; white-space: nowrap; }
    .sl .li { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sl small { margin-left: 4px; }
    .onde { display: flex; gap: 16px; align-items: center; }
    .top { flex: 1; gap: 8px; min-width: 0; }
    .cat { display: flex; gap: 8px; align-items: center; }
    .cat .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .l { display: flex; justify-content: space-between; gap: 6px; font-size: 0.85rem; }
    .l b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cat .bar { height: 5px; }
    .orc { display: flex; flex-direction: column; gap: 6px; padding: 6px 0; }
    .cv { margin-top: 6px; }
    .comp { display: flex; height: 12px; border-radius: 999px; overflow: hidden; background: var(--card-2); gap: 2px; }
    .comp i { display: block; min-width: 3px; }
    .leg { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; font-size: 0.75rem; color: var(--ink-2); }
    .leg span { display: inline-flex; align-items: center; gap: 5px; }
    .leg i { width: 10px; height: 10px; border-radius: 3px; }
    .pes { display: flex; gap: 10px; align-items: center; padding: 5px 0; }
    .pes .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .pes .bar { height: 5px; }
    .acerto { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--line); }
    .acerto .l { align-items: center; gap: 8px; font-size: 0.88rem; }
    .dica { display: flex; gap: 10px; color: var(--ink); align-items: center; padding-top: 12px; padding-bottom: 12px; }
    .dica .i { color: var(--primary); }
    .dica .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .dica .small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .li { display: inline-flex; align-items: center; gap: 4px; }
    @media (max-width: 380px) { .onde { flex-direction: column; } .top { width: 100%; } }
  `,
})
export default class Inicio {
  protected s = inject(Store);
  protected insights = inject(Insights);
  protected lancar = inject(Lancar);
  protected painel = inject(Painel);
  protected compacto = computed(() => !!this.painel.prefs().compacto);

  protected r = this.s.resumo;
  private credito = computed(() => creditoBeneficios(this.s.beneficios(), this.s.mes()));
  protected temBenef = computed(() => this.credito() > 0 || this.r().beneficios > 0);
  protected comBenef = signal(localStorage.getItem('cfp.saldo') === 'beneficios');
  /** Saldo do card: só dinheiro ou somando benefícios (como no resumo mensal) */
  protected saldo = computed(() => {
    const r = this.r();
    if (!this.comBenef() || !this.temBenef()) return r;
    const entradas = r.entradas + this.credito();
    const saidas = r.saidas + r.beneficios;
    return { entradas, saidas, saldo: entradas - saidas };
  });
  protected noMesAtual = computed(() => this.s.mes() === mesAtual());
  protected mesAnterior = computed(() => addMeses(this.s.mes(), -1));
  protected variacao = computed(() => (this.s.antesDoInicio(this.mesAnterior()) ? null : variacaoGastos(this.s.gastos(), this.s.mes(), hoje())));
  protected pctPago = computed(() => pct(this.r().pago, this.r().pago + this.r().aPagar));
  protected variacaoTxt = computed(() => {
    const v = this.variacao();
    return v ? `Gastos lançados ${v > 0 ? '↑' : '↓'} ${Math.abs(v)}% em relação a ${nomeMes(this.mesAnterior())}${this.noMesAtual() ? ' (até hoje)' : ''}` : '';
  });
  // no máximo 2 avisos no topo (o de fechamento conta); dispensado some até o aviso mudar (o id leva o mês)
  protected avisos = computed(() =>
    this.insights.avisos().filter((a) => (a.nivel === 'perigo' || a.nivel === 'alerta') && !this.insights.dispensados().includes(a.id)).slice(0, this.mostrarFechamento() ? 1 : 2),
  );
  protected cats = computed(() => porCategoria(this.s.gastosMes(), this.s.catMap()));
  protected fatias = computed(() => this.cats().map((c) => ({ nome: c.nome, valor: c.total, cor: c.cor })));
  protected proximas = computed(() => this.s.contasMes().filter((c) => !c.pago).slice(0, 5));
  protected beneficios = computed(() =>
    this.s.beneficiosAtivos().map((b) => ({ ...b, saldo: saldoBeneficio(b, this.s.usoBeneficios(), this.s.mes(), this.s.cobrancasBeneficio()).saldo })),
  );
  protected cofrinhos = computed(() =>
    this.s.cofrinhos().slice(0, 4).map((c) => {
      const guardado = this.s.guardadoPorCofrinho().get(c.id) ?? 0;
      return { ...c, guardado, pct: pct(guardado, c.meta) };
    }),
  );

  private curvaDias = computed(() =>
    saldoDiario(this.s.mes(), this.s.gastos(), this.s.entradasMes(), this.s.recorrenciasPrev(), this.s.contasMes(), this.s.pagamentos(),
      this.s.reservasDia()),
  );
  protected curva = computed(() => this.curvaDias().map((d) => d.saldo));
  protected menor = computed(() => this.curvaDias().reduce((m, d) => (d.saldo < m.saldo ? d : m), this.curvaDias()[0]));
  protected idxHoje = computed(() => (noMes(hoje(), this.s.mes()) ? Number(hoje().slice(8)) - 1 : null));
  /** data do recebimento: 05/12 */
  protected dm = (d: string) => d.slice(8) + '/' + d.slice(5, 7);
  protected nomeRec = (g: Recebimento) => (g.util ? `${g.dia}º dia útil · ` : '') + g.nome + (g.mes !== this.s.mes() ? ` de ${nomeMes(g.mes, true)}` : '');

  protected detalheRec = (g: Recebimento) => `Recebe ${moeda(g.recebe)} · contas ${moeda(g.total)} · a pagar ${moeda(g.aPagar)}` + (g.reservado ? ` · orçamentos ${moeda(g.reservado)} (${this.nomesReservas(g)})` : '');

  protected recebimentos = this.s.recebimentos;
  protected nomesReservas = (g: Recebimento) => g.reservas.map((r) => r.nome).join(', ');
  protected proxReceb = computed(() => (this.noMesAtual() ? proximoRecebimento(hoje(), this.s.recorrencias(), this.s.pagamentos()) : null));
  protected ritmo = computed(() => ritmoMes(this.s.mes(), hoje()));

  /** Fatias das entradas: fixas e parcelas (presas), resto do cartão, à vista e o que sobra */
  protected comp = computed(() => {
    const r = this.r();
    if (r.entradas <= 0) return null;
    const p = parcelasDoMes(this.s.mes(), this.s.gastos(), this.s.cartoes());
    const partes = [
      { nome: 'Contas fixas', valor: r.contasFixas, cor: '#6366f1' },
      { nome: 'Parcelas', valor: p.cartao + p.debito, cor: '#db2777' },
      { nome: 'Cartão', valor: Math.max(0, r.faturas - p.cartao), cor: '#f59e0b' },
      { nome: 'À vista', valor: Math.max(0, r.avista - p.debito), cor: '#0ea5e9' },
      { nome: 'Reservado', valor: r.reservado, cor: '#8b5cf6' },
      { nome: 'Sobra', valor: Math.max(0, r.saldo), cor: 'var(--ok)' },
    ];
    const base = Math.max(r.entradas, r.saidas);
    return { preso: pct(partes[0].valor + partes[1].valor, r.entradas), partes: partes.map((x) => ({ ...x, pct: pct(x.valor, base) })) };
  });

  /** Gasto lançado por membro no mês (inclui benefícios e cartão) */
  protected pessoas = computed(() => {
    const gastos = this.s.gastosMes();
    const l = this.s.membros().map((m) => ({ id: m.user_id, nome: m.nome, foto: m.foto, total: soma(gastos.filter((g) => g.criado_por === m.user_id), (g) => g.valor) }));
    const max = Math.max(1, ...l.map((x) => x.total));
    return l.map((x) => ({ ...x, pct: pct(x.total, max) })).sort((a, b) => b.total - a.total);
  });
  protected nomeDe = (id: string) => this.s.nomeAutor(id);
  protected partesTexto = (ps: { id: string; valor: number; pct: number }[]) => ps.map((p) => `${this.nomeDe(p.id)} ${moeda(p.valor)} (${p.pct}%)`).join(', ');
  async acertar(t: Transferencia) {
    if (!confirm(`Registrar que ${this.nomeDe(t.de)} pagou ${moeda(t.valor)} para ${this.nomeDe(t.para)}?`)) return;
    await this.s.acertar(t);
  }
  protected diferenca = computed(() => {
    const [a, b] = this.pessoas();
    return a && b && a.total - b.total >= 1 ? { nome: a.nome, valor: a.total - b.total } : null;
  });

  /** Seção "Mais análises" (recolhida por padrão) */
  protected temAnalises = computed(() => this.r().entradas > 0 || this.r().saidas > 0 || this.pessoas().length > 1 || this.cats().length > 0);
  protected verAnalises = signal(lerLocal('cfp.inicio.analises') === '1');
  lembrarAnalises(e: Event) {
    const aberto = (e.target as HTMLDetailsElement).open;
    this.verAnalises.set(aberto);
    gravarLocal('cfp.inicio.analises', aberto ? '1' : '0');
  }
  protected analisesResumo = computed(() => {
    const l: string[] = [];
    const c = this.comp();
    if (c) l.push(`${c.preso}% da renda presa`);
    const t = this.s.acerto()?.transferencias.length;
    if (this.pessoas().length > 1 && t) l.push('acerto pendente');
    const cat = this.cats()[0];
    if (cat) l.push(`${cat.nome} ${pct(cat.total, soma(this.cats(), (x) => x.total))}%`);
    return l.join(' · ');
  });

  private fechVisto = signal(localStorage.getItem('cfp.fechamento'));
  protected mostrarFechamento = computed(
    () => this.noMesAtual() && Number(hoje().slice(8)) <= 7 && this.fechVisto() !== this.mesAnterior() && !this.s.carregando() && !this.s.antesDoInicio(this.mesAnterior()),
  );

  dispensarFechamento() {
    localStorage.setItem('cfp.fechamento', this.mesAnterior());
    this.fechVisto.set(this.mesAnterior());
  }

  alternarBenef() {
    this.comBenef.update((v) => !v);
    localStorage.setItem('cfp.saldo', this.comBenef() ? 'beneficios' : '');
  }

  status(venc: string) {
    const d = diffDias(hoje(), venc);
    return d < 0 ? 'perigo' : d <= 3 ? 'alerta' : '';
  }

  rotulo(venc: string) {
    const d = diffDias(hoje(), venc);
    return d < 0 ? 'Vencida' : d === 0 ? 'Hoje' : d <= 3 ? `${d}d` : 'Aberta';
  }
}

function lerLocal(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function gravarLocal(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sem armazenamento */
  }
}
