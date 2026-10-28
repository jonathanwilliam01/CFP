import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { diaNoMes, hoje, mesAtual } from '../core/datas';
import { ativaNoMes } from '../core/financas';
import { BrlPipe, DiaPipe, parseValor } from '../core/formato';
import { Recorrencia } from '../core/models';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';
import { Reajuste } from '../shared/reajuste';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

interface FormFixa {
  id?: string;
  descricao: string;
  valor: string;
  dia: number;
  categoria_id: string | null;
  inicio: string;
  fim: string;
  ativo: boolean;
}

@Component({
  imports: [FormsModule, BrlPipe, DiaPipe, Icon, Sheet, Reajuste],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Entradas</h1>
        <button class="btn sm" (click)="lancar.novo('entrada')"><app-icon name="add" [size]="16" />Entrada</button>
      </div>

      <div class="stats">
        <div class="stat"><div class="l">Total do mês</div><div class="v pos">{{ s.resumo().entradas | brl }}</div></div>
        <div class="stat"><div class="l">Fixas</div><div class="v">{{ s.resumo().entradasFixas | brl }}</div></div>
      </div>

      <div class="card-head"><h2>Entradas fixas</h2><button class="btn ghost sm" (click)="nova()">+ Fixa</button></div>
      <section class="card list">
        @for (r of fixas(); track r.id) {
          <div class="row">
            <span class="ico"><app-icon [name]="s.catMap().get(r.categoria_id ?? '')?.icone ?? 'work'" /></span>
            <button class="grow txt" (click)="editar(r)">
              <div class="t">{{ r.descricao }}</div>
              <div class="s">Dia {{ r.dia }} · {{ recebido(r) ? 'recebida' : 'prevista' }}</div>
            </button>
            <span class="v pos">{{ (recebido(r)?.valor ?? r.valor) | brl }}</span>
            <button class="tog" [class.on]="recebido(r)" (click)="alternar(r)" [attr.aria-label]="recebido(r) ? 'Desmarcar' : 'Marcar recebida'">
              <app-icon name="check" [size]="16" />
            </button>
          </div>
        } @empty {
          <p class="muted small vazio">Cadastre salário e outras entradas que se repetem todo mês.</p>
        }
      </section>

      <h2>Outras entradas do mês</h2>
      <section class="card list">
        @for (e of s.entradasMes(); track e.id) {
          <button class="row" (click)="lancar.editarEntrada(e)">
            <span class="ico"><app-icon [name]="s.catMap().get(e.categoria_id ?? '')?.icone ?? 'attach_money'" /></span>
            <div class="grow"><div class="t">{{ e.descricao }}</div><div class="s">{{ e.data | dia }}</div></div>
            <span class="v pos">{{ e.valor | brl }}</span>
          </button>
        } @empty {
          <p class="muted small vazio">Nenhuma entrada avulsa neste mês.</p>
        }
      </section>
    </div>

    <app-sheet [(open)]="aberto" [titulo]="form.id ? 'Editar entrada fixa' : 'Nova entrada fixa'">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Descrição</span><input name="d" [(ngModel)]="form.descricao" placeholder="Ex.: Salário" /></label>
        <div class="grid2">
          <label class="field"><span>Valor</span><input name="v" inputmode="decimal" [(ngModel)]="form.valor" /></label>
          <label class="field"><span>Dia que cai</span><input name="dia" type="number" min="1" max="31" [(ngModel)]="form.dia" /></label>
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
  `,
})
export default class Entradas {
  protected s = inject(Store);
  protected lancar = inject(Lancar);
  private toast = inject(Toast);

  protected aberto = signal(false);
  protected form: FormFixa = this.vazio();
  protected editando = signal<Recorrencia | null>(null);

  protected fixas = computed(() => this.s.recorrencias().filter((r) => r.tipo === 'entrada' && ativaNoMes(r, this.s.mes())));

  recebido(r: Recorrencia) {
    return this.s.pagamentos().find((p) => p.tipo === 'recorrencia' && p.ref_id === r.id && p.mes === this.s.mes()) ?? null;
  }

  async alternar(r: Recorrencia) {
    try {
      const p = this.recebido(r);
      if (p) await this.s.desfazerPagamento(p.id);
      else {
        const dia = diaNoMes(this.s.mes(), r.dia);
        const id = await this.s.pagar('recorrencia', r.id, r.valor, dia < hoje() ? dia : hoje());
        this.toast.feito(`${r.descricao} recebida`, () => this.s.desfazerPagamento(id));
      }
    } catch (e) {
      this.toast.erro(e);
    }
  }

  private vazio(): FormFixa {
    return { descricao: '', valor: '', dia: 5, categoria_id: this.s.catEntrada()[0]?.id ?? null, inicio: mesAtual().slice(0, 7), fim: '', ativo: true };
  }

  nova() {
    this.editando.set(null);
    this.form = this.vazio();
    this.aberto.set(true);
  }

  editar(r: Recorrencia) {
    this.editando.set(r);
    this.form = {
      id: r.id, descricao: r.descricao, valor: String(r.valor).replace('.', ','), dia: r.dia, categoria_id: r.categoria_id,
      inicio: r.inicio.slice(0, 7), fim: r.fim?.slice(0, 7) ?? '', ativo: r.ativo,
    };
    this.aberto.set(true);
  }

  async salvar() {
    const f = this.form;
    if (!f.descricao.trim() || !parseValor(f.valor)) return this.toast.erro('Preencha descrição e valor');
    try {
      await this.s.salvar('recorrencias', {
        id: f.id, tipo: 'entrada', descricao: f.descricao.trim(), valor: parseValor(f.valor), dia: f.dia || 1,
        categoria_id: f.categoria_id, inicio: `${f.inicio || mesAtual().slice(0, 7)}-01`, fim: f.fim ? `${f.fim}-01` : null, ativo: f.ativo,
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
