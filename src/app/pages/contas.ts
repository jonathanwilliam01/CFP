import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { addMeses, diffDias, hoje, inicioMes, mesesEntre, nomeMes } from '../core/datas';
import { ACIMA_MEDIA, CompraRecorrente, Recebimento, aporteMensal, fixasNaFatura, mediaContas, noMes } from '../core/financas';
import { BrlPipe, DiaPipe, MesPipe, PrivPipe, moeda, parseValor, privado, soma } from '../core/formato';
import { Cartao, Cofrinho, ContaMes, Gasto, Recorrencia } from '../core/models';
import { Store } from '../core/store';
import { CodigoLido, lerCodigo } from '../core/boleto';
import { ContaFixa } from '../shared/conta-fixa';
import { AcaoDeslizar, Deslizar } from '../shared/deslizar';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';
import { taxas } from './calc/comum';
import { Moeda } from '../shared/moeda';
import { ColunaQuadro, MoverQuadro, Quadro } from '../shared/quadro';

@Component({
  imports: [NgTemplateOutlet, Moeda, FormsModule, RouterLink, BrlPipe, PrivPipe, DiaPipe, MesPipe, Icon, Sheet, ContaFixa, Deslizar, Quadro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" [class.quadro]="quadro()">
      <div class="page-head">
        <h1>Contas</h1>
        <button class="btn sm" (click)="novaFixa()"><app-icon name="add" [size]="16" />Conta fixa</button>
      </div>

      <div class="stats">
        <div class="stat"><div class="l">Total do mês</div><div class="v">{{ total() | brl }}</div></div>
        <div class="stat"><div class="l">A pagar</div><div class="v neg">{{ s.resumo().aPagar | brl }}</div></div>
        <div class="stat"><div class="l">Pago</div><div class="v pos">{{ s.resumo().pago | brl }}</div></div>
        <div class="stat"><div class="l">À vista no mês</div><div class="v">{{ s.resumo().avista | brl }}</div></div>
      </div>

      <div class="col">
      @if (recebimentos().length) {
        <div class="card-head"><h2>Por recebimento</h2>
          @if (s.entradaMesSeguinte()) { <button type="button" class="btn ghost sm" (click)="s.trocarRecebimento(); diaSel.set(null)">{{ s.recebimentoModo() === 'mes' ? 'No mês' : 'Competência' }}<app-icon name="swap_horiz" [size]="16" /></button> }
        </div>
        <div class="stats">
          @for (g of recebimentos(); track g.data) {
            <button type="button" class="stat rec" [class.on]="diaSel() === g.data" (click)="diaSel.set(diaSel() === g.data ? null : g.data)">
              <div class="l">{{ dm(g.data) }} · {{ nomeRec(g) }}</div>
              <div class="lin"><span>Recebe</span><b class="pos">{{ g.recebe | brl }}</b></div>
              <div class="lin"><span>Contas</span><b>{{ g.total | brl }}</b></div>
              <div class="lin"><span>A pagar</span><b class="neg">{{ g.aPagar | brl }}</b></div>
              @if (g.reservado) {
                <div class="lin orc" [title]="nomesReservas(g) | priv"><span><app-icon name="flag" [size]="14" [fill]="true" />Orçamentos</span><b>{{ g.reservado | brl }}</b></div>
                <div class="orcn">{{ nomesReservas(g) | priv }}</div>
              }
              <div class="lin sobra"><span>Sobra</span><b [class.neg]="g.sobra < 0">{{ g.sobra | brl }}</b></div>
            </button>
          }
        </div>
        <p class="small muted">Cada conta fica com o último recebimento até o dia do vencimento.{{ s.entradaMesSeguinte() ? (s.recebimentoModo() === 'mes' ? ' No mês: o que cai neste mês, com as contas do mês da entrada.' : ' Competência: entradas e contas deste mês, mesmo as que caem no seguinte.') : '' }} Toque para ver só as contas dele.
          @if (temReserva()) { A <app-icon class="fl" name="flag" [size]="13" [fill]="true" /> mostra o que os orçamentos reservam e ainda não foi gasto: entra na sobra. }</p>
      }

      @if (contasBase().length) {
        <div class="progresso" role="progressbar" [attr.aria-valuenow]="progresso().pct" aria-valuemin="0" aria-valuemax="100">
          <div class="pl"><span>Pago {{ progresso().pago | brl }} de {{ progresso().total | brl }}</span><b>{{ progresso().pct }}%</b></div>
          <div class="barra"><span [style.width.%]="progresso().pct"></span></div>
        </div>
        <div class="filtros">
          @if (!quadro()) {
            <div class="chips">
              @for (o of opcoes(); track o.k) {
                <button type="button" class="chip" [class.on]="filtro() === o.k" [class.vermelho]="o.k === 'vencidas' && o.n" (click)="filtro.set(o.k)">{{ o.r }}@if (o.n !== null) { <span class="n">{{ o.n }}</span> }</button>
              }
            </div>
          }
          <div class="acoes">
            <div class="seg vista" role="group" aria-label="Visualização">
              <button type="button" [class.on]="!quadro()" (click)="trocarVista('lista')" aria-label="Lista" title="Lista"><app-icon name="view_list" [size]="18" /></button>
              <button type="button" [class.on]="quadro()" (click)="trocarVista('quadro')" aria-label="Quadro" title="Quadro"><app-icon name="view_kanban" [size]="18" /></button>
            </div>
            <button type="button" class="btn ghost sm" (click)="ordem.set(ordem() === 'venc' ? 'valor' : 'venc')" [attr.aria-label]="'Ordenar por ' + (ordem() === 'venc' ? 'valor' : 'vencimento')">
              <app-icon name="sort" [size]="16" />{{ ordem() === 'venc' ? 'Vencimento' : 'Valor' }}</button>
            @if (!quadro() && abertas().length > 1) {
              <button type="button" class="btn ghost sm" [class.on]="selecionando()" (click)="alternarSelecao()"><app-icon name="checklist" [size]="16" />{{ selecionando() ? 'Cancelar' : 'Selecionar' }}</button>
            }
          </div>
        </div>
      }

      <ng-template #linha let-c>
        <button class="row" [class.venc]="!c.pago && st(c).c === 'perigo'" (click)="selecionando() && !c.pago ? marcar(c) : abrir(c)">
          @if (selecionando() && !c.pago) {
            <span class="ico sel" [class.on]="marcadas().has(chave(c))"><app-icon [name]="marcadas().has(chave(c)) ? 'check_box' : 'check_box_outline_blank'" [fill]="marcadas().has(chave(c))" /></span>
          } @else {
            <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
          }
          <div class="grow">
            <div class="t">{{ c.descricao }}</div>
            <div class="s">Vence {{ c.vencimento | dia }}{{ c.media ? ' · pela média' : '' }}{{ c.informado ? ' · valor do mês' : '' }}{{ c.beneficio_id ? ' · ' + beneficioNome(c.beneficio_id) : '' }}{{ c.mes > s.mes() ? ' · paga com o salário deste mês' : c.mes < s.mes() ? ' · de ' + (c.mes | mes: true) : '' }}@if (c.tipo === 'fatura' && reservaCartao().get(c.ref_id); as rv) { · <span class="fl">⚑ +{{ rv | brl }} reservado</span>}</div>
          </div>
          <div class="dir">
            <span class="v" [class.riscado]="c.pago">{{ c.valor | brl }}</span>
            <span class="badge" [class]="st(c).c">{{ st(c).r }}</span>
          </div>
        </button>
      </ng-template>

      <ng-template #cartaoQuadro let-c>
        <button type="button" class="row qc" (click)="abrir(c)">
          <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" [size]="18" /></span>
          <div class="grow"><div class="t">{{ c.descricao }}</div>
            <div class="s"><span>{{ dm(c.vencimento) }}</span><b class="v" [class.riscado]="c.pago">{{ c.valor | brl }}</b></div></div>
        </button>
      </ng-template>

      @if (quadro()) {
        <app-quadro [colunas]="colunasQuadro()" [chave]="chave" [total]="totalColuna" vazio="Nenhuma conta" (mover)="moverQuadro($event)">
          <ng-template #cartao let-c><ng-container *ngTemplateOutlet="cartaoQuadro; context: { $implicit: c }" /></ng-template>
        </app-quadro>
        <p class="small muted centro">Arraste para "Paga" para pagar (no celular, segure antes) ou use <app-icon name="swap_horiz" [size]="14" /> no cartão.</p>
      } @else {
      <section class="card list">
        @for (c of visiveis(); track c.tipo + c.ref_id) {
          @if (selecionando()) {
            <ng-container *ngTemplateOutlet="linha; context: { $implicit: c }" />
          } @else {
            <app-deslizar [esquerda]="c.pago ? desfazerAcao : pagarAcao" (esquerdaFeito)="c.pago ? desfazer(c) : pagarRapido(c)">
              <ng-container *ngTemplateOutlet="linha; context: { $implicit: c }" />
            </app-deslizar>
          }
        }
        @if (filtro() === 'todas' && pagas().length) {
          <button type="button" class="row sep" (click)="alternarPagas()" [attr.aria-expanded]="verPagas()">
            <span class="ico"><app-icon name="task_alt" /></span>
            <div class="grow"><div class="t">Pagas ({{ pagas().length }})</div><div class="s">{{ totalPagas() | brl }}</div></div>
            <app-icon [name]="verPagas() ? 'expand_less' : 'expand_more'" />
          </button>
          @if (verPagas()) {
            @for (c of pagas(); track c.tipo + c.ref_id) {
              <app-deslizar [esquerda]="desfazerAcao" (esquerdaFeito)="desfazer(c)">
                <ng-container *ngTemplateOutlet="linha; context: { $implicit: c }" />
              </app-deslizar>
            }
          }
        }
        @if (filtro() !== 'todas' && contasBase().length && !visiveis().length) {
          <p class="small muted vazio">{{ filtro() === 'vencidas' ? 'Nenhuma conta vencida.' : filtro() === 'pagas' ? 'Nenhuma conta paga ainda.' : 'Tudo pago neste mês.' }}</p>
        }
        @for (r of mostraReservas() ? reservasLista() : []; track r.orcamento_id) {
          <app-deslizar [esquerda]="desconsiderarAcao" (esquerdaFeito)="desconsiderar(r.orcamento_id, r.nome)">
            <a class="row" routerLink="/orcamentos">
              <span class="ico flag"><app-icon name="flag" [fill]="true" /></span>
              <div class="grow"><div class="t">{{ r.nome }}</div><div class="s">Reservado pelo orçamento · ainda não gasto</div></div>
              <div class="dir"><span class="v">{{ r.valor | brl }}</span><span class="badge orcb">Orçamento</span></div>
            </a>
          </app-deslizar>
        }
        @if (!contasBase().length && !reservasLista().length && s.carregandoMes()) {
          @for (i of [1, 2, 3]; track i) { <span class="esqueleto" style="height: 44px; margin: 8px 0"></span> }
        } @else if (!contasBase().length && !reservasLista().length) {
          <div class="empty"><app-icon class="big" name="calendar_month" [size]="40" />Nenhuma conta neste mês.<br />
            <span class="small">Cadastre contas fixas (aluguel, luz, internet) e as faturas dos cartões aparecem aqui sozinhas.</span>
          </div>
        }
      </section>
      @if (marcadas().size) {
        <div class="lote">
          <span>{{ marcadas().size }} {{ marcadas().size === 1 ? 'conta' : 'contas' }} · <b>{{ totalMarcadas() | brl }}</b></span>
          <button type="button" class="btn sm" (click)="pagarMarcadas()" [disabled]="pagando()"><app-icon name="check" [size]="16" />Marcar como pagas</button>
        </div>
      } @else if (selecionando()) {
        <p class="small muted centro">Toque nas contas em aberto para escolher quais pagar de uma vez (com o valor previsto e a data de hoje).</p>
      } @else if (contasBase().length || reservasLista().length) {
        <p class="small muted centro">Arraste uma conta para a esquerda para marcar como paga{{ reservasLista().length ? ', ou uma reserva para desconsiderar a sobra do orçamento' : '' }}.</p>
      }
      }

      </div>

      <div class="col">
      @if (metas().length) {
        <h2>Cofrinhos do mês</h2>
        <section class="card list">
          @for (m of metas(); track m.c.id) {
            <div class="row">
              <a class="ico" [routerLink]="['/cofrinhos', m.c.id]" [style.background]="m.c.cor + '22'" [style.color]="m.c.cor"><app-icon [name]="m.c.icone" /></a>
              <div class="grow">
                <div class="t">{{ m.c.nome }}</div>
                <div class="s">Guardar {{ m.aporte | brl }} no mês · {{ m.prazo }}</div>
              </div>
              @if (m.falta > 0) {
                <button class="btn sm" type="button" (click)="guardar(m.c, m.falta)">Guardar {{ m.falta | brl }}</button>
              } @else {
                <span class="badge ok">Guardado</span>
              }
            </div>
          }
        </section>
      }

      @if (credito().length) {
        <h2>Compras no crédito em {{ s.mes() | mes }}</h2>
        <section class="card list">
          @for (x of credito(); track x.cartao.id) {
            <button class="row" (click)="creditoSel.set(x)">
              <span class="ico" [style.background]="x.cartao.cor + '22'" [style.color]="x.cartao.cor"><app-icon name="credit_card" /></span>
              <div class="grow">
                <div class="t">{{ x.cartao.nome }}</div>
                <div class="s">{{ x.itens.length }} {{ x.itens.length === 1 ? 'compra' : 'compras' }} · {{ x.faturas }}</div>
              </div>
              <span class="v">{{ x.total | brl }}</span>
            </button>
          }
        </section>
      }

      @if (s.sugestoesFixas().length) {
        <div class="card-head"><h2>Parecem contas fixas</h2></div>
        <section class="card list">
          <p class="small muted">Lançadas uma vez por mês nos últimos 3 meses com valor parecido. Virando conta fixa, entram sozinhas a partir do mês seguinte ao último lançamento.</p>
          @for (x of s.sugestoesFixas(); track x.chave) {
            <div class="row">
              <span class="ico"><app-icon [name]="s.catMap().get(x.categoria_id ?? '')?.icone ?? 'autorenew'" /></span>
              <div class="grow"><div class="t">{{ x.descricao }}</div><div class="s">Todo dia {{ x.dia }}{{ x.cartao_id ? ' · ' + cartaoNomeId(x.cartao_id) : '' }} · {{ x.valor | brl }}</div></div>
              <button class="btn sm" type="button" (click)="criarSugestao(x)">Criar</button>
              <button class="btn ghost sm" type="button" (click)="s.ignorarSugestao(x.chave)" aria-label="Ignorar"><app-icon name="close" [size]="18" /></button>
            </div>
          }
        </section>
      }

      @if (fixas().length || encerradas().length) {
        <div class="card-head">
          <h2>Contas fixas cadastradas</h2>
          @if (encerradas().length) {
            <button class="btn ghost sm" type="button" (click)="verEncerradas.set(!verEncerradas())">
              {{ verEncerradas() ? 'Ocultar encerradas' : 'Encerradas (' + encerradas().length + ')' }}
            </button>
          }
        </div>
        <section class="card list">
          @for (r of verEncerradas() ? encerradas().concat(fixas()) : fixas(); track r.id) {
            <button class="row" (click)="editarFixa(r)">
              <span class="ico"><app-icon [name]="s.catMap().get(r.categoria_id ?? '')?.icone ?? 'receipt_long'" /></span>
              <div class="grow">
                <div class="t">{{ r.descricao }}@if (encerradas().includes(r)) {<span class="badge perigo enc">Encerrada</span>}</div>
                <div class="s">{{ cartaoNome(r) ? 'Na fatura do ' + cartaoNome(r) + ', vence dia ' + r.dia : 'Todo dia ' + r.dia }}{{ r.variavel ? ' · variável' : '' }}{{ r.paga_mes_anterior && !cartaoNome(r) ? ' · salário do mês anterior' : '' }}{{ r.beneficio_id ? ' · ' + beneficioNome(r.beneficio_id) : '' }}{{ r.ativo ? '' : ' · inativa' }}{{ r.inicio >= proxMes() ? ' · a partir de ' + r.inicio.slice(5, 7) + '/' + r.inicio.slice(0, 4) : '' }}{{ r.fim ? ' · até ' + r.fim.slice(5, 7) + '/' + r.fim.slice(0, 4) : '' }}</div>
              </div>
              <span class="v">{{ s.medias().get(r.id) ?? r.valor | brl }}</span>
            </button>
          }
          <div class="row tot">
            <div class="grow"><div class="t">Total</div><div class="s">{{ totalFixas().n }} {{ totalFixas().n === 1 ? 'conta' : 'contas' }} em {{ s.mes() | mes }}</div></div>
            <span class="v">{{ totalFixas().valor | brl }}</span>
          </div>
        </section>
      }
      </div>
    </div>

    <app-sheet [(open)]="detalhe" [titulo]="sel()?.descricao ?? ''">
      @if (sel(); as c) {
        <div class="form">
          <p class="muted">Vencimento {{ c.vencimento | dia }}</p>
          @if (codigoFixa(c); as cod) {
            <div class="cod">
              <div class="grow"><div class="small muted">{{ cod.startsWith('000201') || !lido(cod) ? 'Pix' : 'Código do boleto' }}</div><div class="num txt">{{ cod }}</div></div>
              <button type="button" class="btn sm" (click)="copiar(cod)"><app-icon name="content_copy" [size]="16" />Copiar</button>
            </div>
          }
          @if (c.tipo === 'fatura') {
            <div class="itens">
              @if (c.anterior) {
                <div class="it"><span class="tit">Saldo da fatura anterior<span class="badge alerta">Pago em parte</span></span><span class="num">{{ c.anterior | brl }}</span></div>
              }
              @for (g of itensFatura(); track g.id) {
                <div class="it"><span class="tit">{{ g.descricao }}@if (g.fixa) {<span class="badge info">Conta fixa</span>}</span><span class="num">{{ g.valor | brl }}</span></div>
              }
            </div>
          }
          @if (c.pago) {
            <div class="aviso sucesso"><app-icon class="i" name="check_circle" /><div><div class="t">Paga em {{ c.pago.pago_em! | dia }}</div><div class="s">{{ c.pago.valor | brl }}@if (c.pago.resto) { · {{ c.pago.resto | brl }} foi para a fatura seguinte }</div></div></div>
            <button class="btn ghost block" (click)="desfazer(c)">Desfazer pagamento</button>
          } @else {
            <label class="field"><span>Colar código do boleto ou Pix (opcional)</span>
              <input [(ngModel)]="codigo" (ngModelChange)="lerColado($event)" inputmode="numeric" placeholder="Preenche o valor sozinho" />
            </label>
            @if (codigoLido(); as l) {
              <p class="small muted">{{ l.tipo === 'pix' ? 'Pix' : 'Boleto' }}{{ l.valor ? ' de ' + (l.valor | brl) : ' sem valor no código' }}{{ l.vencimento ? ', vence ' + (l.vencimento | dia) : '' }}{{ l.vencimento && l.vencimento !== c.vencimento ? ' (a conta está para ' + (c.vencimento | dia) + ')' : '' }}</p>
            }
            <div class="grid2">
              <label class="field"><span>{{ variavel(c) ? 'Valor da conta' : 'Valor pago' }}</span><input moeda inputmode="numeric" [(ngModel)]="valorPago" /></label>
              <label class="field"><span>Pago em</span><input type="date" [(ngModel)]="pagoEm" /></label>
            </div>
            @if (variavel(c) && historico(c); as h) {
              @if (h.media) {
                <p class="small muted">Média {{ h.media | brl }} · últimas: @for (v of h.ultimas; track v.mes; let ult = $last) { <span>{{ v.mes | mes: true }} {{ v.valor | brl }}{{ ult ? '' : ',' }}</span> }</p>
              }
              @if (acima(h.media); as p) {
                <div class="aviso alerta"><app-icon class="i" name="trending_up" /><div><div class="t">{{ p }}% acima da média</div><div class="s">Confira a leitura ou se houve cobrança a mais.</div></div></div>
              }
            }
            @if (parcial(c); as p) {
              <div class="aviso alerta"><app-icon class="i" name="call_split" /><div>
                <div class="t">Pagamento parcial: {{ p.resto | brl }} vai para a fatura de {{ p.proxima | mes }}</div>
                <div class="s">No rotativo (~{{ p.taxa }}% ao mês, média do Banco Central) os juros ficam perto de {{ p.juros | brl }}, fora IOF. Confira na próxima fatura.</div>
                <label class="check small"><input type="checkbox" [(ngModel)]="somarJuros" />Somar os juros estimados na próxima fatura</label>
              </div></div>
            }
            <button class="btn block" (click)="pagar(c)"><app-icon name="check" [size]="18" />{{ parcial(c) ? 'Pagar só esse valor' : 'Marcar como paga' }}</button>
            @if (variavel(c)) {
              <p class="small muted">Salve o valor que chegou para contar nas saídas deste mês sem pagar agora. Os outros meses continuam pela média.</p>
              <button class="btn ghost block" (click)="pagar(c, true)">Salvar só o valor do mês</button>
              @if (c.informado) {
                <button class="btn ghost block" (click)="voltarMedia(c)">Voltar para a média</button>
              }
            }
          }
          @if (c.tipo === 'recorrencia') {
            <button class="btn ghost block" (click)="editarFixaId(c.ref_id)">Editar conta fixa</button>
          }
        </div>
      }
    </app-sheet>

    <app-sheet [open]="!!creditoSel()" (openChange)="creditoSel.set(null)" [titulo]="'Crédito ' + (creditoSel()?.cartao?.nome ?? '')">
      @if (creditoSel(); as x) {
        <div class="form">
          <p class="muted">Compras feitas em {{ s.mes() | mes }} · total {{ x.total | brl }}</p>
          <div class="itens">
            @for (g of x.itens; track g.id) {
              <div class="it">
                <span>{{ g.descricao }}<br /><span class="small muted">{{ g.data | dia }} · fatura {{ g.fatura_mes ?? '' | mes: true }}</span></span>
                <span class="num">{{ g.valor | brl }}</span>
              </div>
            }
          </div>
        </div>
      }
    </app-sheet>

    <app-sheet [(open)]="formAberto" [titulo]="fixaSel() ? 'Editar conta fixa' : 'Nova conta fixa'">
      @if (formAberto()) {
        <app-conta-fixa [rec]="fixaSel()" [sugestao]="sugestao()" (fechar)="formAberto.set(false)" />
      }
    </app-sheet>
  `,
  styles: `
    .list { padding-top: 4px; padding-bottom: 4px; }
    .col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    @media (min-width: 1100px) {
      .page { max-width: 1240px; display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); column-gap: 20px; align-items: start; }
      .page-head, .page > .stats { grid-column: 1 / -1; }
      .page > .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .col > .stats { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
      /* quadro com as 4 colunas na largura toda; o resto desce */
      .page.quadro .col { grid-column: 1 / -1; }
    }
    .progresso { display: flex; flex-direction: column; gap: 6px; }
    .pl { display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--ink-2); }
    .pl b { color: var(--ok); font-variant-numeric: tabular-nums; }
    .barra { height: 8px; border-radius: 99px; background: var(--line); overflow: hidden; }
    .barra span { display: block; height: 100%; background: var(--ok); border-radius: inherit; transition: width 0.4s ease; }
    .filtros { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
    .filtros .chips { min-width: 0; }
    .acoes { display: flex; gap: 4px; margin-left: auto; }
    .acoes .on { color: var(--primary); }
    .vista { padding: 2px; }
    .vista button { padding: 4px 8px; }
    .qc { min-height: 0; gap: 8px; padding: 8px 0; }
    .qc .ico { width: 30px; height: 30px; border-radius: 9px; }
    .qc .s { display: flex; justify-content: space-between; gap: 6px; }
    .qc .v { color: var(--ink); }
    .chip .n { font-size: 0.75rem; opacity: 0.75; }
    .chip.vermelho:not(.on) { border-color: var(--danger); color: var(--danger); }
    .row.venc { box-shadow: inset 3px 0 0 var(--danger); }
    .ico.sel { color: var(--ink-3); background: transparent; }
    .ico.sel.on { color: var(--primary); }
    .row.sep { font: inherit; color: inherit; width: 100%; border: 0; background: none; text-align: left; cursor: pointer; }
    .row.sep .t { color: var(--ink-2); }
    .vazio { text-align: center; padding: 16px 0; margin: 0; }
    .lote {
      position: sticky; bottom: calc(var(--nav-h) + var(--safe-b) + 12px); z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 10px 12px 10px 16px; border-radius: 16px; background: var(--card); border: 1px solid var(--primary); box-shadow: 0 8px 24px #0003;
    }
    @media (min-width: 1024px) { .lote { bottom: 16px; } }
    .cod { display: flex; align-items: center; gap: 8px; border: 1px dashed var(--line); border-radius: 12px; padding: 8px 8px 8px 12px; }
    .cod .txt { font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rec { font: inherit; color: inherit; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 3px; }
    .rec.on { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
    .rec .l { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
    .lin { display: flex; flex-wrap: wrap; justify-content: space-between; column-gap: 6px; font-size: 0.85rem; }
    .lin b { margin-left: auto; }
    .lin span { color: var(--ink-2); }
    .lin b { font-variant-numeric: tabular-nums; }
    .orc span { display: inline-flex; align-items: center; gap: 3px; color: #8b5cf6; font-weight: 700; }
    .orc b { color: #8b5cf6; }
    .orcn { font-size: 0.7rem; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .fl { color: #8b5cf6; vertical-align: -2px; }
    .flag { background: #8b5cf622; color: #8b5cf6; }
    .orcb { background: #8b5cf622; color: #8b5cf6; }
    .sobra { border-top: 1px solid var(--line); padding-top: 4px; margin-top: 2px; }
    .dir { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .riscado { color: var(--ink-3); }
    .enc { margin-left: 6px; vertical-align: 2px; }
    .row.tot { cursor: default; }
    .centro { text-align: center; margin-top: -6px; }
    .itens { max-height: 40dvh; overflow-y: auto; border: 1px solid var(--line); border-radius: 12px; padding: 4px 12px; }
    .it { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 0.9rem; }
    .it:last-child { border-bottom: 0; }
  `,
})
export default class Contas {
  protected s = inject(Store);
  private toast = inject(Toast);

  protected detalhe = signal(false);
  protected sel = signal<ContaMes | null>(null);
  protected valorPago = '';
  protected pagoEm = hoje();
  protected somarJuros = true;

  protected formAberto = signal(false);
  protected fixaSel = signal<Recorrencia | null>(null);
  protected sugestao = signal<CompraRecorrente | null>(null);

  /** data do recebimento: 05/12 */
  protected dm = (d: string) => d.slice(8) + '/' + d.slice(5, 7);
  protected nomeRec = (g: Recebimento) => (g.util ? `${g.dia}º dia útil · ` : '') + g.nome + (g.mes !== this.s.mes() ? ` de ${nomeMes(g.mes, true)}` : '');

  protected recebimentos = this.s.recebimentos;
  protected nomesReservas = (g: Recebimento) => g.reservas.map((r) => `${r.nome} ${moeda(r.valor)}`).join(', ');
  /** Reserva de orçamento ainda não gasta por cartão (soma na fatura prevista) */
  protected reservaCartao = computed(() => {
    const m = new Map<string, number>();
    for (const o of this.s.orcamentosStatus())
      if (o.reservado && o.orcamento.forma === 'cartao' && o.orcamento.cartao_id) m.set(o.orcamento.cartao_id, (m.get(o.orcamento.cartao_id) ?? 0) + o.reservado);
    return m;
  });
  protected temReserva = computed(() => this.recebimentos().some((g) => g.reservado > 0));
  /** Reservas dos orçamentos na lista: do recebimento escolhido ou do mês todo */
  protected reservasLista = computed(() => {
    const g = this.recebimentos().find((x) => x.data === this.diaSel());
    if (g) return g.reservas;
    const m = new Map<string, { nome: string; valor: number }>();
    for (const r of this.s.reservasDia()) {
      const a = m.get(r.orcamento_id) ?? { nome: r.nome, valor: 0 };
      a.valor += r.valor;
      m.set(r.orcamento_id, a);
    }
    return [...m.entries()].map(([orcamento_id, a]) => ({ orcamento_id, nome: a.nome, valor: Math.round(a.valor * 100) / 100 }));
  });
  protected diaSel = signal<string | null>(null);
  /** Contas do recebimento escolhido ou do mês, já na ordem escolhida (sort estável mantém o vencimento no empate) */
  protected contasBase = computed(() => {
    const l = [...(this.recebimentos().find((g) => g.data === this.diaSel())?.contas ?? this.s.contasMes())];
    return this.ordem() === 'valor' ? l.sort((a, b) => b.valor - a.valor) : l;
  });
  protected abertas = computed(() => this.contasBase().filter((c) => !c.pago));
  protected pagas = computed(() => this.contasBase().filter((c) => c.pago));
  private vencidas = computed(() => this.abertas().filter((c) => diffDias(hoje(), c.vencimento) < 0));
  protected totalPagas = computed(() => soma(this.pagas(), (c) => c.valor));

  protected filtro = signal<'todas' | 'abrir' | 'vencidas' | 'pagas'>('todas');
  protected ordem = signal<'venc' | 'valor'>('venc');
  protected opcoes = computed(() => [
    { k: 'todas' as const, r: 'Todas', n: null },
    { k: 'abrir' as const, r: 'A pagar', n: this.abertas().length },
    { k: 'vencidas' as const, r: 'Vencidas', n: this.vencidas().length },
    { k: 'pagas' as const, r: 'Pagas', n: this.pagas().length },
  ]);
  /** Em "Todas" as pagas ficam num grupo recolhível no fim */
  protected visiveis = computed(() => ({ todas: this.abertas(), abrir: this.abertas(), vencidas: this.vencidas(), pagas: this.pagas() })[this.filtro()]);
  protected mostraReservas = computed(() => this.filtro() === 'todas' || this.filtro() === 'abrir');
  protected progresso = computed(() => {
    const base = this.contasBase().filter((c) => !c.beneficio_id);
    const total = soma(base, (c) => c.valor);
    const pago = soma(base.filter((c) => c.pago), (c) => c.valor);
    return { total, pago, pct: total ? Math.min(100, Math.round((pago / total) * 100)) : 0 };
  });

  protected vista = signal(localStorage.getItem('cfp.contas.vista') === 'quadro' ? 'quadro' : 'lista');
  protected quadro = computed(() => this.vista() === 'quadro' && this.contasBase().length > 0);
  trocarVista(v: 'lista' | 'quadro') {
    this.vista.set(v);
    localStorage.setItem('cfp.contas.vista', v);
    this.selecionando.set(false);
    this.marcadas.set(new Set());
  }
  /** Atrasada/7 dias/Depois são calculadas: só recebem o que sai de Paga (desfaz) */
  protected colunasQuadro = computed<ColunaQuadro<ContaMes>[]>(() => {
    const atrasada: ContaMes[] = [], semana: ContaMes[] = [], depois: ContaMes[] = [];
    for (const c of this.abertas()) {
      const d = diffDias(hoje(), c.vencimento);
      (d < 0 ? atrasada : d <= 7 ? semana : depois).push(c);
    }
    const volta = ['paga'];
    return [
      { id: 'atrasada', titulo: 'Atrasada', icone: 'warning', cor: 'var(--danger)', aceita: volta, itens: atrasada },
      { id: 'semana', titulo: 'Vence em 7 dias', icone: 'schedule', cor: 'var(--warn)', aceita: volta, itens: semana },
      { id: 'depois', titulo: 'Depois', icone: 'event', cor: 'var(--info)', aceita: volta, itens: depois },
      { id: 'paga', titulo: 'Paga', icone: 'task_alt', cor: 'var(--ok)', itens: this.pagas() },
    ];
  });
  protected totalColuna = (l: ContaMes[]) => (privado() ? 'R$ •••' : moeda(soma(l, (c) => c.valor)));
  /** Soltar em Paga: variável abre o detalhe para informar o valor; sair de Paga desfaz */
  moverQuadro({ item: c, de, para }: MoverQuadro<ContaMes>) {
    if (para === 'paga') return this.variavel(c) ? this.abrir(c) : this.pagarRapido(c);
    if (de === 'paga') return this.desfazer(c);
  }

  protected verPagas = signal(localStorage.getItem('cfp.contas.pagas') === '1');
  alternarPagas() {
    this.verPagas.update((v) => !v);
    localStorage.setItem('cfp.contas.pagas', this.verPagas() ? '1' : '0');
  }

  protected selecionando = signal(false);
  protected marcadas = signal(new Set<string>());
  protected pagando = signal(false);
  protected chave = (c: ContaMes) => c.tipo + ':' + c.ref_id + ':' + c.mes;
  protected totalMarcadas = computed(() => soma(this.abertas().filter((c) => this.marcadas().has(this.chave(c))), (c) => c.valor));
  alternarSelecao() {
    this.selecionando.update((v) => !v);
    this.marcadas.set(new Set());
  }
  marcar(c: ContaMes) {
    const m = new Set(this.marcadas());
    const k = this.chave(c);
    if (!m.delete(k)) m.add(k);
    this.marcadas.set(m);
  }
  /** Paga as marcadas com o valor previsto e a data de hoje; desfazer volta todas */
  async pagarMarcadas() {
    const l = this.abertas().filter((c) => this.marcadas().has(this.chave(c)));
    const ids: string[] = [];
    this.pagando.set(true);
    try {
      for (const c of l) ids.push(await this.s.pagar(c.tipo, c.ref_id, c.valor, hoje(), c.mes));
      this.toast.feito(`${ids.length} ${ids.length === 1 ? 'conta paga' : 'contas pagas'}`, async () => {
        for (const id of ids) await this.s.desfazerPagamento(id);
      });
      this.selecionando.set(false);
      this.marcadas.set(new Set());
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.pagando.set(false);
    }
  }

  protected codigo = '';
  protected codigoLido = signal<CodigoLido | null>(null);
  protected lido = (t: string) => lerCodigo(t, hoje());
  codigoFixa(c: ContaMes) {
    return c.tipo === 'recorrencia' ? (this.s.recorrencias().find((r) => r.id === c.ref_id)?.pagamento ?? null) : null;
  }
  lerColado(t: string) {
    const l = lerCodigo(t, hoje());
    this.codigoLido.set(l);
    if (l?.valor) this.valorPago = l.valor.toFixed(2).replace('.', ',');
  }
  async copiar(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      this.toast.ok('Copiado');
    } catch {
      this.toast.erro('Não deu para copiar');
    }
  }
  protected total = computed(() => soma(this.s.contasMes().filter((c) => !c.beneficio_id), (c) => c.valor));
  /** Compras no crédito com data no mês, por cartão (a fatura delas pode ser de outro mês) */
  protected credito = computed(() => {
    const doMes = this.s.gastosMes().filter((g) => g.forma === 'cartao');
    return this.s.cartoes()
      .map((cartao) => {
        const itens = doMes.filter((g) => g.cartao_id === cartao.id);
        const meses = [...new Set(itens.map((g) => g.fatura_mes ?? ''))].filter(Boolean).sort();
        return { cartao, itens, total: soma(itens, (g) => g.valor), faturas: 'fatura ' + meses.map((m) => nomeMes(m, true)).join(' e ') };
      })
      .filter((x) => x.itens.length);
  });
  protected creditoSel = signal<{ cartao: Cartao; itens: Gasto[]; total: number } | null>(null);
  /** reajuste encerra a anterior: as que já terminaram ou foram substituídas ficam escondidas (histórico no reajuste) */
  private todasFixas = computed(() => this.s.recorrencias().filter((r) => r.tipo === 'conta'));
  private substituidas = computed(() => new Set(this.s.recorrencias().map((r) => r.reajuste_de)));
  /** encerrada = fim antes do mês selecionado no topo */
  protected fixas = computed(() => this.todasFixas().filter((r) => (!r.fim || r.fim >= this.s.mes()) && !this.substituidas().has(r.id)));
  protected encerradas = computed(() => this.todasFixas().filter((r) => r.fim && r.fim < this.s.mes()));
  protected proxMes = computed(() => addMeses(this.s.mes(), 1));
  protected verEncerradas = signal(false);
  /** Só as que valem no mês selecionado (ativas, já iniciadas); variável entra pela média */
  protected totalFixas = computed(() => {
    const l = this.fixas().filter((r) => r.ativo && r.inicio < this.proxMes());
    return { n: l.length, valor: soma(l, (r) => this.s.medias().get(r.id) ?? r.valor) };
  });
  protected itensFatura = computed(() => {
    const c = this.sel();
    const cartao = this.s.cartoes().find((x) => x.id === c?.ref_id);
    if (c?.tipo !== 'fatura' || !cartao) return [];
    return [
      ...fixasNaFatura(c.mes, cartao, this.s.recorrenciasPrev()),
      ...this.s.gastos()
        .filter((g) => g.cartao_id === c.ref_id && g.fatura_mes === c.mes)
        .map((g) => ({ ...g, fixa: false })),
    ];
  });

  protected desconsiderarAcao: AcaoDeslizar = { rotulo: 'Desconsiderar sobra', icone: 'block', cor: '#8b5cf6' };

  async desconsiderar(orcamentoId: string, nome: string) {
    try {
      const id = await this.s.desconsiderarSobra(orcamentoId);
      this.toast.feito(`Sobra de ${nome} fora do saldo`, () => this.s.excluir('orcamento_fechados', id));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  protected pagarAcao: AcaoDeslizar = { rotulo: 'Pagar', icone: 'check', cor: 'var(--ok)' };
  protected desfazerAcao: AcaoDeslizar = { rotulo: 'Desfazer', icone: 'undo', cor: 'var(--ink-3)' };

  /** Cofrinhos com prazo: aporte do mês (calculado com o que havia antes dele) e quanto falta guardar */
  protected metas = computed(() => {
    const mes = this.s.mes();
    const l = [];
    for (const c of this.s.cofrinhos()) {
      const movs = this.s.cofrinhoMovs().filter((m) => m.cofrinho_id === c.id);
      const antes = soma(movs.filter((m) => m.data < mes), (m) => m.valor);
      // sem prazo, o plano mensal do cofrinho serve de aporte
      const aporte = aporteMensal(c.meta, antes, c.prazo, mes) ?? (c.frequencia === 'mes' && c.deposito && antes < c.meta ? c.deposito : null);
      if (!aporte) continue;
      const noMesV = soma(movs.filter((m) => noMes(m.data, mes)), (m) => m.valor);
      const meses = c.prazo ? mesesEntre(mes, inicioMes(c.prazo)) + 1 : 0;
      l.push({
        c,
        aporte: Math.round(aporte * 100) / 100,
        falta: Math.max(0, Math.round((aporte - noMesV) * 100) / 100),
        prazo: !c.prazo ? 'plano mensal' : meses > 1 ? `faltam ${meses} meses` : 'último mês da meta',
      });
    }
    return l;
  });

  async guardar(c: Cofrinho, valor: number) {
    try {
      const data = noMes(hoje(), this.s.mes()) ? hoje() : this.s.mes();
      const id = await this.s.salvar('cofrinho_movs', { cofrinho_id: c.id, valor, data, descricao: 'Aporte do mês' });
      this.toast.feito(`${c.nome}: ${moeda(valor)} guardado`, () => this.s.excluir('cofrinho_movs', id));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  /** Deslizar: paga com o valor previsto e a data de hoje */
  async pagarRapido(c: ContaMes) {
    try {
      const id = await this.s.pagar(c.tipo, c.ref_id, c.valor, hoje(), c.mes);
      this.toast.feito(`${c.descricao} paga`, () => this.s.desfazerPagamento(id));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  /** Fatura paga com menos que o total: o resto (e os juros do rotativo, se somados) passa para a seguinte */
  parcial(c: ContaMes) {
    if (c.tipo !== 'fatura') return null;
    const v = parseValor(this.valorPago);
    const resto = Math.round((c.valor - v) * 100) / 100;
    if (!v || resto < 0.01) return null;
    const taxa = parseValor(taxas.rotativo());
    return { resto, proxima: addMeses(c.mes, 1), taxa: taxa.toLocaleString('pt-BR'), juros: Math.round(resto * taxa) / 100 };
  }

  beneficioNome(id: string) {
    return this.s.beneficios().find((b) => b.id === id)?.nome ?? 'Benefício';
  }

  cartaoNome(r: Recorrencia) {
    return this.s.cartoes().find((c) => c.id === r.cartao_id)?.nome ?? '';
  }

  st(c: ContaMes) {
    if (c.pago) return { c: 'ok', r: 'Paga' };
    const d = diffDias(hoje(), c.vencimento);
    if (d < 0) return { c: 'perigo', r: 'Vencida' };
    if (d === 0) return { c: 'alerta', r: 'Vence hoje' };
    if (d <= 3) return { c: 'alerta', r: `Em ${d} dia(s)` };
    return { c: '', r: 'Em aberto' };
  }

  abrir(c: ContaMes) {
    this.sel.set(c);
    this.valorPago = String(c.valor.toFixed(2)).replace('.', ',');
    this.pagoEm = hoje();
    this.somarJuros = true;
    this.codigo = '';
    this.codigoLido.set(null);
    this.detalhe.set(true);
  }

  /** Valores anteriores ao mês da conta (variável): média e as 3 últimas */
  historico(c: ContaMes) {
    const ant = this.s.valoresFixas().filter((v) => v.ref_id === c.ref_id && v.mes < c.mes).sort((a, b) => b.mes.localeCompare(a.mes));
    return { media: mediaContas(ant), ultimas: ant.slice(0, 3) };
  }

  acima(media: number | null) {
    const v = parseValor(this.valorPago);
    return media && v >= media * ACIMA_MEDIA ? Math.round((v / media - 1) * 100) : 0;
  }

  variavel(c: ContaMes) {
    return c.tipo === 'recorrencia' && !!this.s.recorrencias().find((r) => r.id === c.ref_id)?.variavel;
  }

  async pagar(c: ContaMes, soValor = false) {
    try {
      const valor = parseValor(this.valorPago);
      if (soValor) {
        if (!valor) return this.toast.erro('Informe o valor');
        await this.s.pagar(c.tipo, c.ref_id, valor, null, c.mes);
        this.toast.ok(`Valor de ${c.descricao} salvo`);
      } else {
        const p = this.parcial(c);
        const resto = p ? Math.round((p.resto + (this.somarJuros ? p.juros : 0)) * 100) / 100 : 0;
        const id = await this.s.pagar(c.tipo, c.ref_id, valor, this.pagoEm, c.mes, resto);
        this.toast.feito(p ? `${c.descricao}: ${moeda(resto)} para a fatura seguinte` : `${c.descricao} paga`, () => this.s.desfazerPagamento(id));
      }
      this.detalhe.set(false);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  // variável mantém o valor do mês
  async desfazer(c: ContaMes) {
    try {
      if (this.variavel(c)) await this.s.pagar(c.tipo, c.ref_id, c.pago!.valor, null, c.mes);
      else await this.s.desfazerPagamento(c.pago!.id);
      this.detalhe.set(false);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async voltarMedia(c: ContaMes) {
    try {
      await this.s.desfazerPagamento(c.informado!.id);
      this.detalhe.set(false);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  criarSugestao(x: CompraRecorrente) {
    this.fixaSel.set(null);
    this.sugestao.set(x);
    this.formAberto.set(true);
  }

  cartaoNomeId(id: string) {
    return this.s.cartoes().find((c) => c.id === id)?.nome ?? '';
  }

  novaFixa() {
    this.sugestao.set(null);
    this.fixaSel.set(null);
    this.formAberto.set(true);
  }

  editarFixa(r: Recorrencia) {
    this.sugestao.set(null);
    this.fixaSel.set(r);
    this.formAberto.set(true);
  }

  editarFixaId(id: string) {
    const r = this.s.recorrencias().find((x) => x.id === id);
    this.detalhe.set(false);
    if (r) this.editarFixa(r);
  }
}
