import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { diffDias, hoje } from '../core/datas';
import { porCategoria } from '../core/financas';
import { BrlPipe, DiaPipe, parseValor, pct, soma } from '../core/formato';
import { Gasto, Viagem } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { normalizar } from '../core/texto';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';
import { Moeda } from '../shared/moeda';

interface FormViagem {
  id?: string;
  nome: string;
  inicio: string;
  fim: string;
  orcamento: string;
  moeda: string;
  cotacao: string;
  iof: string;
  ativa: boolean;
}

/** Marcador sem acento nem espaço a partir do nome */
const tagDe = (nome: string) => normalizar(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'viagem';

/** Modo viagem: com uma viagem ativa, os gastos lançados ganham o marcador dela; aqui o total, o orçamento e por categoria */
@Component({
  imports: [Moeda, FormsModule, BrlPipe, DiaPipe, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Viagens</h1>
        <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" />Viagem</button>
      </div>
      <p class="muted small">Com a viagem ativa, todo gasto lançado ganha o marcador dela (dá para tirar no lançamento) e, com moeda estrangeira, o lançamento converte com cotação e IOF.</p>

      <div class="grade-cards">
      @for (v of s.viagens(); track v.id) {
        <article class="card viagem" [class.on]="v.ativa">
          <div class="cab">
            <span class="ico"><app-icon name="flight" /></span>
            <button type="button" class="grow tit-v" (click)="sel.set(sel() === v.id ? null : v.id)">
              <b>{{ v.nome }}</b>
              <span class="small muted">{{ v.inicio | dia }}{{ v.fim ? ' a ' + (v.fim | dia) : '' }} · #{{ v.tag }}{{ v.moeda ? ' · ' + v.moeda : '' }}</span>
            </button>
            <label class="sw" [title]="v.ativa ? 'Desligar' : 'Ativar'">
              <input type="checkbox" [checked]="v.ativa" (change)="ativar(v)" [disabled]="ocupado()" />
              <span>{{ v.ativa ? 'Ativa' : 'Ativar' }}</span>
            </label>
          </div>

          @if (sel() === v.id) {
            @if (resumo(); as r) {
              <div class="stats">
                <div class="stat"><div class="l">Gasto</div><div class="v">{{ r.total | brl }}</div></div>
                <div class="stat"><div class="l">Por dia</div><div class="v">{{ r.porDia | brl }}</div></div>
              </div>
              @if (v.orcamento) {
                <div class="bar" [class.alerta]="r.pct >= 80" [class.estourado]="r.pct >= 100"><i [style.width.%]="r.pct > 100 ? 100 : r.pct"></i></div>
                <p class="small muted">{{ r.pct }}% do orçamento de {{ v.orcamento | brl }} · {{ v.orcamento - r.total >= 0 ? 'restam ' : 'passou ' }}<b class="num">{{ abs(v.orcamento - r.total) | brl }}</b></p>
              }
              @for (c of r.cats; track c.id) {
                <div class="row">
                  <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
                  <div class="grow"><div class="t">{{ c.nome }}</div><div class="bar fina"><i [style.width.%]="c.pct" [style.background]="c.cor"></i></div></div>
                  <span class="v">{{ c.total | brl }}</span>
                </div>
              } @empty {
                <p class="small muted">Nenhum gasto com #{{ v.tag }} ainda.</p>
              }
            } @else {
              <span class="esqueleto"></span>
            }
            <div class="bts">
              <button type="button" class="btn ghost sm" (click)="editar(v)"><app-icon name="edit" [size]="16" />Editar</button>
              <button type="button" class="btn sm" (click)="lancar.novo('gasto')"><app-icon name="add" [size]="16" />Gasto</button>
            </div>
          }
        </article>
      } @empty {
        <div class="card empty">
          <app-icon class="big" name="flight_takeoff" [size]="40" />
          <p>Cadastre a próxima viagem para separar os gastos dela sem esforço.</p>
          <button class="btn sm" type="button" (click)="novo()">Nova viagem</button>
        </div>
      }
      </div>
    </div>

    <app-sheet [(open)]="aberto" [titulo]="f.id ? 'Editar viagem' : 'Nova viagem'">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Nome</span><input name="n" [(ngModel)]="f.nome" placeholder="Ex.: Chile 2027" /></label>
        <div class="grid2">
          <label class="field"><span>Início</span><input name="i" type="date" [(ngModel)]="f.inicio" /></label>
          <label class="field"><span>Fim (opcional)</span><input name="f" type="date" [(ngModel)]="f.fim" /></label>
        </div>
        <label class="field"><span>Orçamento em reais (opcional)</span><input name="o" moeda inputmode="numeric" [(ngModel)]="f.orcamento" placeholder="0,00" /></label>
        <div class="grid3">
          <label class="field"><span>Moeda</span><input name="m" [(ngModel)]="f.moeda" placeholder="USD" maxlength="5" /></label>
          <label class="field"><span>Cotação</span><input name="c" inputmode="decimal" [(ngModel)]="f.cotacao" placeholder="5,40" /></label>
          <label class="field"><span>IOF (%)</span><input name="iof" inputmode="decimal" [(ngModel)]="f.iof" /></label>
        </div>
        <label class="check"><input type="checkbox" name="a" [(ngModel)]="f.ativa" /> Ativa (marca os gastos lançados)</label>
        <button class="btn block" [disabled]="ocupado()">Salvar</button>
        @if (f.id) { <button class="btn danger block" type="button" (click)="excluir()">Excluir</button> }
      </form>
    </app-sheet>
  `,
  styles: `
    .viagem { display: flex; flex-direction: column; gap: 10px; }
    .viagem.on { border-color: color-mix(in srgb, var(--primary) 50%, var(--line)); }
    .viagem.on .cab .ico { background: var(--primary-soft); color: var(--primary); }
    .cab { display: flex; align-items: center; gap: 12px; }
    .tit-v { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; background: none; border: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; padding: 0; }
    .sw { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; font-weight: 700; color: var(--ink-2); cursor: pointer; }
    .bar { height: 7px; }
    .bar.fina { height: 5px; margin-top: 5px; }
    .bts { display: flex; gap: 6px; justify-content: flex-end; }
    .bts app-icon { margin-right: 4px; }
    .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    p { margin: 0; }
  `,
})
export default class Viagens {
  protected s = inject(Store);
  protected lancar = inject(Lancar);
  private toast = inject(Toast);
  protected aberto = signal(false);
  protected ocupado = signal(false);
  protected sel = signal<string | null>(this.s.viagemAtiva()?.id ?? null);
  protected abs = Math.abs;
  private gastos = signal<Gasto[] | null>(null);
  f: FormViagem = this.vazio();

  protected resumo = computed(() => {
    const g = this.gastos();
    const v = this.s.viagens().find((x) => x.id === this.sel());
    if (!g || !v) return null;
    const total = soma(g, (x) => x.valor);
    const ate = [v.fim ?? hoje(), hoje()].sort()[0];
    const dias = Math.max(1, diffDias(v.inicio, ate) + 1);
    return { total, porDia: total / dias, pct: v.orcamento ? pct(total, v.orcamento) : 0, cats: porCategoria(g, this.s.catMap()) };
  });

  constructor() {
    effect(() => {
      const v = this.s.viagens().find((x) => x.id === this.sel());
      this.s.mudou();
      this.gastos.set(null);
      if (v) untracked(() => this.carregar(v));
    });
  }

  /** Todos os gastos com o marcador, de qualquer mês */
  private async carregar(v: Viagem) {
    try {
      const l = await q<Gasto[]>(supabase.from('gastos').select('*').eq('carteira_id', this.s.carteiraId()!).contains('tags', [v.tag]));
      if (this.sel() === v.id) this.gastos.set(l);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  private vazio(): FormViagem {
    return { nome: '', inicio: hoje(), fim: '', orcamento: '', moeda: '', cotacao: '', iof: '3,5', ativa: true };
  }

  novo() {
    this.f = this.vazio();
    this.aberto.set(true);
  }

  editar(v: Viagem) {
    const t = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
    this.f = { id: v.id, nome: v.nome, inicio: v.inicio, fim: v.fim ?? '', orcamento: t(v.orcamento), moeda: v.moeda ?? '', cotacao: t(v.cotacao), iof: t(v.iof), ativa: v.ativa };
    this.aberto.set(true);
  }

  /** Só uma viagem ativa por vez */
  private async desligarOutras(id: string) {
    const outras = this.s.viagens().filter((x) => x.ativa && x.id !== id).map((x) => x.id);
    if (outras.length) await q(supabase.from('viagens').update({ ativa: false }).in('id', outras));
  }

  async salvar() {
    const f = this.f;
    if (!f.nome.trim()) return this.toast.erro('Informe o nome');
    const num = (s: string) => (s.trim() ? parseValor(s) : null);
    this.ocupado.set(true);
    try {
      const antiga = f.id ? this.s.viagens().find((x) => x.id === f.id) : undefined;
      const id = await this.s.salvar('viagens', {
        id: f.id, nome: f.nome.trim(), tag: antiga?.tag ?? tagDe(f.nome), inicio: f.inicio || hoje(), fim: f.fim || null,
        orcamento: num(f.orcamento), moeda: f.moeda.trim().toUpperCase() || null, cotacao: num(f.cotacao), iof: num(f.iof) ?? 0, ativa: f.ativa,
      });
      if (f.ativa) {
        await this.desligarOutras(id);
        await this.s.recarregar('viagens');
      }
      this.sel.set(id);
      this.aberto.set(false);
      this.toast.ok(f.ativa ? 'Viagem ativa: gastos novos ganham o marcador' : 'Viagem salva');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  async ativar(v: Viagem) {
    this.ocupado.set(true);
    try {
      if (!v.ativa) await this.desligarOutras(v.id);
      await this.s.salvar('viagens', { id: v.id, ativa: !v.ativa });
      this.toast.ok(v.ativa ? 'Modo viagem desligado' : `Modo viagem: ${v.nome}`);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  excluir() {
    if (!this.f.id) return;
    this.s.excluirAdiado('viagens', this.f.id, 'Viagem excluída (os gastos ficam)');
    this.aberto.set(false);
  }
}
