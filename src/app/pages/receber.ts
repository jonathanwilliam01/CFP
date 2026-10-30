import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { hoje } from '../core/datas';
import { BrlPipe, DiaPipe, parseValor, soma } from '../core/formato';
import { Receber as ItemReceber } from '../core/models';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

interface FormReceber {
  id?: string;
  descricao: string;
  pessoa: string;
  valor: string;
  data: string;
}

/** Valores que alguém vai devolver (empréstimo, conta dividida com amigo) */
@Component({
  imports: [FormsModule, BrlPipe, DiaPipe, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>A receber</h1>
        <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" />Novo</button>
      </div>
      <p class="muted small">O que emprestou ou pagou por alguém. Ao receber, pode lançar como entrada.</p>

      <div class="stats">
        <div class="stat"><div class="l">Pendente</div><div class="v">{{ total() | brl }}</div></div>
        <div class="stat"><div class="l">Pessoas</div><div class="v">{{ porPessoa().length }}</div></div>
      </div>

      @if (porPessoa().length) {
        <section class="card">
          <div class="card-head"><h2>Por pessoa</h2></div>
          @for (p of porPessoa(); track p.nome) {
            <div class="lin"><span>{{ p.nome }}</span><b class="num">{{ p.valor | brl }}</b></div>
          }
        </section>
      }

      <div class="seg">
        <button type="button" [class.on]="!verRecebidos()" (click)="verRecebidos.set(false)">Pendentes ({{ pendentes().length }})</button>
        <button type="button" [class.on]="verRecebidos()" (click)="verRecebidos.set(true)">Recebidos ({{ recebidos().length }})</button>
      </div>

      <section class="card list">
        @for (r of verRecebidos() ? recebidos() : pendentes(); track r.id) {
          <div class="row">
            <span class="ico"><app-icon [name]="r.recebido_em ? 'check_circle' : 'schedule'" /></span>
            <button type="button" class="grow txt" (click)="editar(r)">
              <div class="t">{{ r.descricao }}</div>
              <div class="s">{{ r.pessoa || 'Sem nome' }} · {{ r.data | dia }}@if (r.recebido_em) { · recebido {{ r.recebido_em | dia }} }</div>
            </button>
            <div class="v">
              <b class="num">{{ r.valor | brl }}</b>
              @if (!r.recebido_em) {
                <button class="btn ghost sm" type="button" (click)="receber(r)">Recebi</button>
              } @else {
                <button class="btn ghost sm" type="button" (click)="desfazer(r)">Desfazer</button>
              }
            </div>
          </div>
        } @empty {
          <p class="muted small vazio">{{ verRecebidos() ? 'Nada recebido ainda.' : 'Ninguém te deve nada.' }}</p>
        }
      </section>
    </div>

    <app-sheet [(open)]="aberto" [titulo]="f.id ? 'Editar' : 'Novo valor a receber'">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Descrição</span><input name="d" [(ngModel)]="f.descricao" placeholder="Ex.: Empréstimo, ingresso do show" /></label>
        <label class="field"><span>Quem vai devolver</span><input name="p" list="pessoas" [(ngModel)]="f.pessoa" />
          <datalist id="pessoas">@for (p of nomes(); track p) { <option [value]="p"></option> }</datalist>
        </label>
        <div class="grid2">
          <label class="field"><span>Valor</span><input name="v" inputmode="decimal" [(ngModel)]="f.valor" placeholder="0,00" /></label>
          <label class="field"><span>Data</span><input name="dt" type="date" [(ngModel)]="f.data" /></label>
        </div>
        <button class="btn block" [disabled]="salvando()">Salvar</button>
        @if (f.id) {
          <button class="btn danger block" type="button" (click)="excluir()">Excluir</button>
        }
      </form>
    </app-sheet>
  `,
  styles: `
    .lin { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 0.92rem; }
    .lin:last-child { border-bottom: 0; }
    .txt { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .v { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .vazio { padding: 12px 0; margin: 0; }
  `,
})
export default class Receber {
  protected s = inject(Store);
  private toast = inject(Toast);

  protected aberto = signal(false);
  protected salvando = signal(false);
  protected verRecebidos = signal(false);
  f: FormReceber = this.vazio();

  protected pendentes = computed(() => this.s.receber().filter((r) => !r.recebido_em));
  protected recebidos = computed(() => this.s.receber().filter((r) => r.recebido_em).sort((a, b) => b.recebido_em!.localeCompare(a.recebido_em!)));
  protected total = computed(() => soma(this.pendentes(), (r) => r.valor));
  protected nomes = computed(() => [...new Set(this.s.receber().map((r) => r.pessoa).filter((p): p is string => !!p))]);
  protected porPessoa = computed(() => {
    const m = new Map<string, number>();
    for (const r of this.pendentes()) m.set(r.pessoa || 'Sem nome', (m.get(r.pessoa || 'Sem nome') ?? 0) + r.valor);
    return [...m].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  });

  private vazio(): FormReceber {
    return { descricao: '', pessoa: '', valor: '', data: hoje() };
  }

  novo() {
    this.f = this.vazio();
    this.aberto.set(true);
  }

  editar(r: ItemReceber) {
    this.f = { id: r.id, descricao: r.descricao, pessoa: r.pessoa ?? '', valor: String(r.valor).replace('.', ','), data: r.data };
    this.aberto.set(true);
  }

  async salvar() {
    const valor = parseValor(this.f.valor);
    if (!this.f.descricao.trim() || !valor) return this.toast.erro('Preencha descrição e valor');
    this.salvando.set(true);
    try {
      await this.s.salvar('receber', { id: this.f.id, descricao: this.f.descricao.trim(), pessoa: this.f.pessoa.trim() || null, valor, data: this.f.data });
      this.aberto.set(false);
      this.toast.ok('Salvo');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  async receber(r: ItemReceber) {
    try {
      await this.s.salvar('receber', { id: r.id, recebido_em: hoje() });
      if (confirm('Lançar como entrada de hoje?'))
        await this.s.salvar('entradas', { descricao: `${r.descricao}${r.pessoa ? ' (' + r.pessoa + ')' : ''}`, valor: r.valor, data: hoje() });
      this.toast.ok('Recebido');
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async desfazer(r: ItemReceber) {
    try {
      await this.s.salvar('receber', { id: r.id, recebido_em: null });
    } catch (e) {
      this.toast.erro(e);
    }
  }

  excluir() {
    if (!this.f.id) return;
    this.s.excluirAdiado('receber', this.f.id, 'Excluído');
    this.aberto.set(false);
  }
}
