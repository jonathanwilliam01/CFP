import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addDias, diffDias, hoje } from '../core/datas';
import { BrlPipe, DiaPipe, parseValor, pct, soma } from '../core/formato';
import { Desafio, Gasto } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { normalizar } from '../core/texto';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

type G = Pick<Gasto, 'descricao' | 'categoria_id' | 'valor' | 'data'>;

/** Base para a economia: média diária dos 90 dias antes do desafio */
const BASE = 90;

const MODELOS = [
  { descricao: 'Semana sem delivery', termo: 'ifood', dias: 7 },
  { descricao: 'Quinzena sem Uber', termo: 'uber', dias: 14 },
  { descricao: 'Mês sem compras online', termo: 'shopee', dias: 30 },
];

interface FormDesafio {
  id?: string;
  descricao: string;
  categoria_id: string | null;
  termo: string;
  limite: string;
  inicio: string;
  dias: number;
}

@Component({
  imports: [FormsModule, BrlPipe, DiaPipe, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Desafios</h1>
        <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" />Novo</button>
      </div>
      <p class="muted small">Fique sem gastar (ou abaixo de um limite) numa categoria ou loja por um tempo. A economia compara com a média dos 90 dias anteriores.</p>

      @if (economiaTotal() > 0) {
        <div class="stats">
          <div class="stat"><div class="l">Economizado nos desafios</div><div class="v pos">{{ economiaTotal() | brl }}</div></div>
        </div>
      }

      @for (d of lista(); track d.d.id) {
        <article class="card">
          <div class="cab">
            <span class="ico" [class.ok]="d.status === 'concluido'" [class.ruim]="d.status === 'falhou'">
              <app-icon [name]="d.status === 'concluido' ? 'emoji_events' : d.status === 'falhou' ? 'sentiment_dissatisfied' : 'local_fire_department'" />
            </span>
            <button type="button" class="grow txt" (click)="editar(d.d)">
              <b>{{ d.d.descricao }}</b>
              <span class="small muted">{{ d.alvo }} · {{ d.d.limite ? 'até ' : '' }}{{ d.d.limite ? (d.d.limite | brl) : 'nada' }} · {{ d.d.inicio | dia }} a {{ d.d.fim | dia }}</span>
            </button>
          </div>
          <div class="bar" [class.ruim]="d.status === 'falhou'"><i [style.width.%]="d.pct"></i></div>
          <div class="info small">
            <span class="muted">
              @switch (d.status) {
                @case ('concluido') { Concluído! }
                @case ('falhou') { Passou do limite: gastou {{ d.gasto | brl }} }
                @case ('futuro') { Começa {{ d.d.inicio | dia }} }
                @default { Dia {{ d.decorridos }} de {{ d.total }} · gastou {{ d.gasto | brl }} }
              }
            </span>
            @if (d.economia > 0) { <span class="pos">economia {{ d.economia | brl }}</span> }
          </div>
        </article>
      } @empty {
        <div class="card empty">
          <app-icon class="big" name="local_fire_department" [size]="40" />
          <p>Nenhum desafio ainda.</p>
          <div class="chips wrap">
            @for (m of modelos; track m.descricao) {
              <button type="button" class="chip" (click)="novo(m)">{{ m.descricao }}</button>
            }
          </div>
        </div>
      }
    </div>

    <app-sheet [(open)]="aberto" [titulo]="f.id ? 'Editar desafio' : 'Novo desafio'">
      <form class="form" (ngSubmit)="salvar()">
        @if (!f.id) {
          <div class="chips wrap">
            @for (m of modelos; track m.descricao) {
              <button type="button" class="chip" (click)="usarModelo(m)">{{ m.descricao }}</button>
            }
          </div>
        }
        <label class="field"><span>Nome</span><input name="d" [(ngModel)]="f.descricao" placeholder="Ex.: Semana sem delivery" /></label>
        <label class="field"><span>Categoria</span>
          <select name="c" [(ngModel)]="f.categoria_id">
            <option [ngValue]="null">Qualquer (usa o termo abaixo)</option>
            @for (c of s.catGasto(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
          </select>
        </label>
        <label class="field"><span>Ou gasto que contém</span><input name="t" [(ngModel)]="f.termo" placeholder="Ex.: ifood, uber" /></label>
        <div class="grid2">
          <label class="field"><span>Gastar no máximo</span><input name="l" inputmode="decimal" [(ngModel)]="f.limite" placeholder="0 = nada" /></label>
          <label class="field"><span>Dias</span><input name="n" type="number" min="1" max="365" [(ngModel)]="f.dias" /></label>
        </div>
        <label class="field"><span>Começa em</span><input name="i" type="date" [(ngModel)]="f.inicio" /></label>
        <button class="btn block" [disabled]="salvando()">Salvar</button>
        @if (f.id) {
          <button class="btn danger block" type="button" (click)="excluir()">Excluir</button>
        }
      </form>
    </app-sheet>
  `,
  styles: `
    .cab { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .ico { background: var(--warn-soft); color: var(--warn); }
    .ico.ok { background: var(--ok-soft); color: var(--ok); }
    .ico.ruim { background: var(--danger-soft); color: var(--danger); }
    .bar.ruim i { background: var(--danger); }
    .txt { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; display: flex; flex-direction: column; min-width: 0; }
    .info { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
    .empty .chips { justify-content: center; }
  `,
})
export default class Desafios {
  protected s = inject(Store);
  private toast = inject(Toast);

  protected modelos = MODELOS;
  protected aberto = signal(false);
  protected salvando = signal(false);
  private gastos = signal<G[]>([]);
  f: FormDesafio = this.vazio();

  protected lista = computed(() => {
    const h = hoje();
    return this.s.desafios()
      .map((d) => {
        const casa = (g: G) =>
          (d.categoria_id ? g.categoria_id === d.categoria_id : true) && (!d.termo || normalizar(g.descricao).includes(normalizar(d.termo)));
        const ate = d.fim < h ? d.fim : h;
        const doPeriodo = this.gastos().filter((g) => casa(g) && g.data >= d.inicio && g.data <= ate);
        const antes = this.gastos().filter((g) => casa(g) && g.data >= addDias(d.inicio, -BASE) && g.data < d.inicio);
        const gasto = soma(doPeriodo, (g) => g.valor);
        const total = diffDias(d.inicio, d.fim) + 1;
        const decorridos = Math.max(0, Math.min(total, diffDias(d.inicio, h) + 1));
        const status = gasto > d.limite + 0.004 ? 'falhou' : h < d.inicio ? 'futuro' : h > d.fim ? 'concluido' : 'andamento';
        const cat = d.categoria_id ? this.s.catMap().get(d.categoria_id)?.nome : null;
        return {
          d, gasto, total, decorridos, status,
          pct: status === 'falhou' ? 100 : pct(decorridos, total),
          economia: Math.max(0, Math.round(((soma(antes, (g) => g.valor) / BASE) * decorridos - gasto) * 100) / 100),
          alvo: [cat, d.termo ? `"${d.termo}"` : null].filter(Boolean).join(' · ') || 'Todos os gastos',
        };
      })
      .sort((a, b) => b.d.inicio.localeCompare(a.d.inicio));
  });
  protected economiaTotal = computed(() => soma(this.lista().filter((x) => x.status !== 'falhou'), (x) => x.economia));

  constructor() {
    effect(() => {
      const l = this.s.desafios();
      this.s.mudou();
      if (l.length) untracked(() => this.carregar(l));
    });
  }

  private async carregar(l: Desafio[]) {
    const ini = addDias(l.map((d) => d.inicio).sort()[0], -BASE);
    const fim = l.map((d) => d.fim).sort().at(-1)!;
    try {
      this.gastos.set(
        await q<G[]>(supabase.from('gastos').select('descricao, categoria_id, valor, data').eq('carteira_id', this.s.carteiraId()!).gte('data', ini).lte('data', fim)),
      );
    } catch (e) {
      this.toast.erro(e);
    }
  }

  private vazio(): FormDesafio {
    return { descricao: '', categoria_id: null, termo: '', limite: '', inicio: hoje(), dias: 7 };
  }

  novo(m?: (typeof MODELOS)[number]) {
    this.f = this.vazio();
    if (m) this.usarModelo(m);
    this.aberto.set(true);
  }

  usarModelo(m: (typeof MODELOS)[number]) {
    this.f = { ...this.f, descricao: m.descricao, termo: m.termo, dias: m.dias };
  }

  editar(d: Desafio) {
    this.f = {
      id: d.id, descricao: d.descricao, categoria_id: d.categoria_id, termo: d.termo ?? '', limite: d.limite ? String(d.limite).replace('.', ',') : '',
      inicio: d.inicio, dias: diffDias(d.inicio, d.fim) + 1,
    };
    this.aberto.set(true);
  }

  async salvar() {
    const f = this.f;
    const dias = Math.round(+f.dias);
    if (!f.descricao.trim() || !f.inicio || !(dias > 0)) return this.toast.erro('Preencha nome, início e dias');
    if (!f.categoria_id && !f.termo.trim()) return this.toast.erro('Escolha uma categoria ou um termo');
    this.salvando.set(true);
    try {
      await this.s.salvar('desafios', {
        id: f.id, descricao: f.descricao.trim(), categoria_id: f.categoria_id, termo: f.termo.trim() || null, limite: parseValor(f.limite),
        inicio: f.inicio, fim: addDias(f.inicio, dias - 1),
      });
      this.aberto.set(false);
      this.toast.ok('Desafio salvo');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  excluir() {
    if (!this.f.id) return;
    this.s.excluirAdiado('desafios', this.f.id, 'Desafio excluído');
    this.aberto.set(false);
  }
}
