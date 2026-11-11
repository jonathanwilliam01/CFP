import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { hoje, mesAtual } from '../core/datas';
import { ativaNoMes, dataEntrada } from '../core/financas';
import { BrlPipe, DiaPipe, parseValor, soma } from '../core/formato';
import { Recorrencia } from '../core/models';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';
import { Reajuste } from '../shared/reajuste';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Moeda } from '../shared/moeda';
import { Autor } from '../shared/autor';

function lerLocal(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

interface FormFixa {
  id?: string;
  descricao: string;
  valor: string;
  dia: number;
  categoria_id: string | null;
  inicio: string;
  fim: string;
  ativo: boolean;
  variavel: boolean;
  dia_util: boolean;
  mes_seguinte: boolean;
}

@Component({
  imports: [NgTemplateOutlet, RouterLink, Moeda, Autor, FormsModule, BrlPipe, DiaPipe, Icon, Sheet, Reajuste],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Entradas</h1>
        @if (aba() === 'mes') {
          <button class="btn sm" (click)="lancar.novo('entrada')"><app-icon name="add" [size]="16" />Entrada</button>
        } @else {
          <button class="btn sm" (click)="nova()"><app-icon name="add" [size]="16" />Entrada fixa</button>
        }
      </div>

      <div class="seg abas" role="tablist" aria-label="Entradas">
        <button type="button" role="tab" [class.on]="aba() === 'mes'" [attr.aria-selected]="aba() === 'mes'" (click)="trocarAba('mes')">Do mês</button>
        <button type="button" role="tab" [class.on]="aba() === 'fixas'" [attr.aria-selected]="aba() === 'fixas'" (click)="trocarAba('fixas')">Fixas</button>
        <a routerLink="/receber" [replaceUrl]="true" title="O que emprestou ou pagou por alguém">A receber</a>
      </div>

      @if (aba() === 'mes') {
        <section class="card resumo">
          <div class="rl">
            <div><div class="small muted">Total do mês</div><b class="grande pos">{{ s.resumo().entradas | brl }}</b></div>
            <div class="small muted dirr">Recebido <b class="pos">{{ prog().recebido | brl }}</b>@if (prog().falta > 0) {<br />falta {{ prog().falta | brl }}}</div>
          </div>
          <div class="barra" role="progressbar" [attr.aria-valuenow]="prog().pct" aria-valuemin="0" aria-valuemax="100"><span [style.width.%]="prog().pct"></span></div>
        </section>

        @if (pendentes().length) {
          <h2>A receber</h2>
          <section class="card list">
            @for (r of pendentes(); track r.id) { <ng-container *ngTemplateOutlet="fixa; context: { $implicit: r }" /> }
          </section>
        }

        <h2>Recebidas</h2>
        <section class="card list">
          @for (r of recebidas(); track r.id) { <ng-container *ngTemplateOutlet="fixa; context: { $implicit: r }" /> }
          @for (e of s.entradasMes(); track e.id) {
            <button class="row" (click)="lancar.editarEntrada(e)">
              <span class="ico"><app-icon [name]="s.catMap().get(e.categoria_id ?? '')?.icone ?? 'attach_money'" /></span>
              <div class="grow"><div class="t">{{ e.descricao }}</div><div class="s">{{ e.data | dia }}</div></div>
              <app-autor [id]="e.criado_por" />
              <span class="v pos">{{ e.valor | brl }}</span>
            </button>
          }
          @if (!recebidas().length && !s.entradasMes().length) {
            <p class="muted small vazio">Nada recebido ainda neste mês.</p>
          }
        </section>
      } @else {
        <section class="card list">
          @for (r of cadastro(); track r.id) {
            <button class="row" (click)="editar(r)">
              <span class="ico"><app-icon [name]="s.catMap().get(r.categoria_id ?? '')?.icone ?? 'work'" /></span>
              <div class="grow">
                <div class="t">{{ r.descricao }}</div>
                <div class="s">{{ r.dia_util ? r.dia + 'º dia útil' : 'Dia ' + r.dia }}{{ r.variavel ? ' · variável' : '' }}{{ r.paga_mes_anterior ? ' · cai no mês seguinte' : '' }}{{ situacao(r) }}</div>
              </div>
              <span class="v" [class.pos]="r.ativo">{{ r.valor | brl }}</span>
            </button>
          } @empty {
            <div class="empty"><app-icon class="big" name="work" [size]="40" />Nenhuma entrada fixa.<br />
              <span class="small">Cadastre salário e outras entradas que se repetem todo mês.</span></div>
          }
        </section>
      }
    </div>

    <ng-template #fixa let-r>
      <div class="row">
        <span class="ico"><app-icon [name]="s.catMap().get(r.categoria_id ?? '')?.icone ?? 'work'" /></span>
        <button class="grow txt" (click)="editar(r)">
          <div class="t">{{ r.descricao }}</div>
          <div class="s">{{ quando(r) }}{{ recebido(r) ? '' : r.variavel ? (s.medias().has(r.id) ? ' · pela média' : ' · variável') : '' }}</div>
        </button>
        <span class="v pos">{{ (recebido(r)?.valor ?? r.valor) | brl }}</span>
        <button class="tog" [class.on]="recebido(r)" (click)="alternar(r)" [attr.aria-label]="recebido(r) ? 'Desmarcar' : 'Marcar recebida'">
          <app-icon name="check" [size]="16" />
        </button>
      </div>
    </ng-template>

    <app-sheet [(open)]="aberto" [titulo]="form.id ? 'Editar entrada fixa' : 'Nova entrada fixa'">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Descrição</span><input name="d" [(ngModel)]="form.descricao" placeholder="Ex.: Salário" /></label>
        <div class="grid2">
          <label class="field"><span>{{ form.variavel ? 'Valor estimado' : 'Valor' }}</span><input name="v" moeda inputmode="numeric" [(ngModel)]="form.valor" /></label>
          <label class="field"><span>{{ form.dia_util ? 'Dia útil (nº)' : 'Dia que cai' }}</span><input name="dia" type="number" min="1" max="31" [(ngModel)]="form.dia" /></label>
        </div>
        @if (form.id) {
          <p class="small muted">Mudar o valor aqui troca todos os meses. Para mudar só a partir de um mês, use o reajuste abaixo.</p>
        }
        <label class="field"><span>Categoria</span>
          <select name="c" [(ngModel)]="form.categoria_id">
            <option [ngValue]="null">Sem categoria</option>
            @for (c of s.catEntrada(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
          </select>
        </label>
        <div class="grid2">
          <label class="field"><span>A partir de</span><input name="i" type="month" [(ngModel)]="form.inicio" /></label>
          <label class="field"><span>Até (opcional)</span><input name="f" type="month" [(ngModel)]="form.fim" /></label>
        </div>
        <label class="check"><input name="du" type="checkbox" [(ngModel)]="form.dia_util" />Contar em dias úteis (5º dia útil: segunda a sábado, sem feriados)</label>
        <label class="check"><input name="ms" type="checkbox" [(ngModel)]="form.mes_seguinte" />Cai no mês seguinte (o salário do mês é pago no outro)</label>
        @if (form.mes_seguinte) {
          <p class="small muted">A entrada conta no mês a que se refere e paga as contas dele. Em Por recebimento, "No mês" mostra o salário do mês anterior que cai neste.</p>
        }
        <label class="check"><input name="var" type="checkbox" [(ngModel)]="form.variavel" />Valor variável (comissão, freela, hora extra)</label>
        @if (form.variavel) {
          <p class="small muted">Ao marcar como recebida você informa quanto veio. Com 3 meses ou mais, a previsão passa a ser a média dos últimos 12.</p>
        }
        <label class="check"><input name="a" type="checkbox" [(ngModel)]="form.ativo" />Ativa</label>
        @if (editando(); as r) {
          <app-reajuste [rec]="r" (feito)="aberto.set(false)" />
        }
        <button class="btn block" type="submit">Salvar</button>
        @if (form.id) {
          <button class="btn danger block" type="button" (click)="excluir()">Excluir</button>
        }
      </form>
    </app-sheet>

    <app-sheet [open]="!!recebendo()" (openChange)="recebendo.set(null)" [titulo]="'Quanto veio de ' + (recebendo()?.descricao ?? '')">
      @if (recebendo(); as r) {
        <form class="form" (ngSubmit)="receber(r)">
          <label class="field"><span>Valor recebido</span><input name="vr" moeda inputmode="numeric" [(ngModel)]="valorRecebido" /></label>
          @if (s.medias().get(r.id); as m) { <p class="small muted">Média dos últimos meses: {{ m | brl }}</p> }
          <button class="btn block">Marcar como recebida</button>
        </form>
      }
    </app-sheet>
  `,
  styles: `
    .list { padding-top: 4px; padding-bottom: 4px; }
    .row { cursor: default; }
    .txt { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .tog {
      width: 34px; height: 34px; border-radius: 50%; border: 2px solid var(--line); background: none;
      color: transparent; display: grid; place-items: center; cursor: pointer; flex-shrink: 0;
    }
    .tog.on { background: var(--ok); border-color: var(--ok); color: #fff; }
    .vazio { padding: 10px 0; }
    .abas > a { display: inline-flex; justify-content: center; align-items: center; text-decoration: none; }
    .barra { height: 8px; border-radius: 99px; background: var(--line); overflow: hidden; }
    .barra span { display: block; height: 100%; background: var(--ok); border-radius: inherit; transition: width 0.4s ease; }
    .v:not(.pos) { color: var(--ink-3); }
  `,
})
export default class Entradas {
  protected s = inject(Store);
  protected lancar = inject(Lancar);
  private toast = inject(Toast);

  protected aberto = signal(false);
  protected form: FormFixa = this.vazio();
  protected editando = signal<Recorrencia | null>(null);

  /** com a média no lugar do valor nas variáveis */
  protected fixas = computed(() => this.s.recorrenciasPrev().filter((r) => r.tipo === 'entrada' && ativaNoMes(r, this.s.mes())));
  protected pendentes = computed(() => this.fixas().filter((r) => !this.recebido(r)));
  protected recebidas = computed(() => this.fixas().filter((r) => this.recebido(r)));
  protected prog = computed(() => {
    const recebido = soma(this.recebidas(), (r) => this.recebido(r)!.valor) + soma(this.s.entradasMes(), (e) => e.valor);
    const falta = soma(this.pendentes(), (r) => r.valor);
    return { recebido, falta, pct: recebido + falta ? Math.round((recebido / (recebido + falta)) * 100) : 0 };
  });
  /** cadastro: todas as fixas de entrada, ativas primeiro */
  protected cadastro = computed(() => {
    const l = this.s.recorrencias().filter((r) => r.tipo === 'entrada');
    // versão antiga de um reajuste some (a nova segue no lugar)
    const velhas = new Set(l.map((r) => r.reajuste_de).filter(Boolean));
    return l.filter((r) => !velhas.has(r.id)).sort((a, b) => +b.ativo - +a.ativo || a.dia - b.dia || a.descricao.localeCompare(b.descricao));
  });
  situacao(r: Recorrencia) {
    if (!r.ativo) return ' · inativa';
    if (r.fim && r.fim < this.s.mes()) return ' · encerrada';
    if (r.inicio > this.s.mes()) return ' · começa depois';
    return '';
  }

  /** Do mês (receber) ou Fixas (cadastro) */
  protected aba = signal<'mes' | 'fixas'>(lerLocal('cfp.entradas.aba') === 'fixas' ? 'fixas' : 'mes');
  trocarAba(a: 'mes' | 'fixas') {
    this.aba.set(a);
    try {
      localStorage.setItem('cfp.entradas.aba', a);
    } catch {}
  }
  protected recebendo = signal<Recorrencia | null>(null);
  protected valorRecebido = '';

  /** "5º dia útil · cai 07/12" */
  quando(r: Recorrencia) {
    const d = dataEntrada(r, this.s.mes());
    return `${r.dia_util ? `${r.dia}º dia útil` : `Dia ${r.dia}`}${r.dia_util || r.paga_mes_anterior ? ` · cai ${d.slice(8)}/${d.slice(5, 7)}` : ''}`;
  }

  recebido(r: Recorrencia) {
    return this.s.pagamentos().find((p) => p.tipo === 'recorrencia' && p.ref_id === r.id && p.mes === this.s.mes()) ?? null;
  }

  async alternar(r: Recorrencia) {
    try {
      const p = this.recebido(r);
      if (p) await this.s.desfazerPagamento(p.id);
      else if (r.variavel) {
        this.valorRecebido = String(r.valor).replace('.', ',');
        this.recebendo.set(r);
      } else await this.receber(r, r.valor);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async receber(r: Recorrencia, valor = parseValor(this.valorRecebido)) {
    if (!valor) return this.toast.erro('Informe o valor');
    try {
      const dia = dataEntrada(r, this.s.mes());
      const id = await this.s.pagar('recorrencia', r.id, valor, dia < hoje() ? dia : hoje());
      this.recebendo.set(null);
      this.toast.feito(`${r.descricao} recebida`, () => this.s.desfazerPagamento(id));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  private vazio(): FormFixa {
    return { descricao: '', valor: '', dia: 5, categoria_id: this.s.catEntrada()[0]?.id ?? null, inicio: mesAtual().slice(0, 7), fim: '', ativo: true, variavel: false, dia_util: false, mes_seguinte: false };
  }

  nova() {
    this.editando.set(null);
    this.form = this.vazio();
    this.aberto.set(true);
  }

  editar(r: Recorrencia) {
    // cadastro cru (a lista mostra a média no valor das variáveis)
    r = this.s.recorrencias().find((x) => x.id === r.id) ?? r;
    this.editando.set(r);
    this.form = {
      id: r.id, descricao: r.descricao, valor: String(r.valor).replace('.', ','), dia: r.dia, categoria_id: r.categoria_id,
      inicio: r.inicio.slice(0, 7), fim: r.fim?.slice(0, 7) ?? '', ativo: r.ativo, variavel: r.variavel,
      dia_util: !!r.dia_util, mes_seguinte: r.paga_mes_anterior,
    };
    this.aberto.set(true);
  }

  async salvar() {
    const f = this.form;
    if (!f.descricao.trim() || !parseValor(f.valor)) return this.toast.erro('Preencha descrição e valor');
    try {
      await this.s.salvar('recorrencias', {
        id: f.id, tipo: 'entrada', descricao: f.descricao.trim(), valor: parseValor(f.valor), dia: f.dia || 1,
        categoria_id: f.categoria_id, inicio: `${f.inicio || mesAtual().slice(0, 7)}-01`, fim: f.fim ? `${f.fim}-01` : null, ativo: f.ativo, variavel: f.variavel,
        dia_util: f.dia_util, paga_mes_anterior: f.mes_seguinte,
      });
      this.toast.ok('Entrada fixa salva');
      this.aberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  excluir() {
    this.s.excluirAdiado('recorrencias', this.form.id!, 'Entrada fixa excluída');
    this.aberto.set(false);
  }
}
