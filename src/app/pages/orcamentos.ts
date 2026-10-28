import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StatusOrcamento } from '../core/financas';
import { BrlPipe, MesPipe, soma } from '../core/formato';
import { Insights } from '../core/insights';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

interface FormOrcamento {
  id?: string;
  categoria_id: string | null;
  valor: number | null;
  alerta_pct: number;
}

@Component({
  imports: [FormsModule, RouterLink, BrlPipe, MesPipe, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Orçamentos</h1>
        <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" />Novo</button>
      </div>

      @if (bandeiras().length) {
        <section class="card">
          <div class="card-head"><h2 class="tit"><app-icon name="flag" [size]="20" />Bandeiras vermelhas</h2></div>
          <div class="avisos">
            @for (a of bandeiras(); track a.id) {
              <a class="aviso" [class]="a.nivel" [routerLink]="a.link">
                <app-icon class="i" [name]="a.icone" />
                <span><span class="t">{{ a.titulo }}</span><br /><span class="s">{{ a.texto }}</span></span>
              </a>
            }
          </div>
        </section>
      }

      @if (s.orcamentosStatus().length) {
        <div class="stats">
          <div class="stat"><div class="l">Orçado (categorias)</div><div class="v">{{ orcado() | brl }}</div></div>
          <div class="stat"><div class="l">Gasto nelas</div><div class="v">{{ gasto() | brl }}</div></div>
        </div>
      }

      <section class="card">
        <div class="card-head">
          <h2>Limites de {{ s.mes() | mes }}</h2>
        </div>
        @for (o of s.orcamentosStatus(); track o.orcamento.id) {
          <button type="button" class="item" (click)="editar(o)">
            <div class="lin">
              <span class="ico" [style.background]="o.cor + '22'" [style.color]="o.cor"><app-icon [name]="o.icone" /></span>
              <span class="grow">
                <span class="t">{{ o.nome }}</span>
                <span class="s num">{{ o.gasto | brl }} de {{ o.orcamento.valor | brl }}</span>
              </span>
              <span class="badge" [class.ok]="o.nivel === 'ok'" [class.alerta]="o.nivel === 'alerta'" [class.perigo]="o.nivel === 'estourado'">{{ o.pct }}%</span>
            </div>
            <div class="bar" [class.alerta]="o.nivel === 'alerta'" [class.estourado]="o.nivel === 'estourado'">
              <i [style.width.%]="o.pct > 100 ? 100 : o.pct"></i>
            </div>
            <span class="s small muted">
              @if (o.gasto <= o.orcamento.valor) { Resta {{ o.orcamento.valor - o.gasto | brl }} } @else { Passou {{ o.gasto - o.orcamento.valor | brl }} }
            </span>
          </button>
        } @empty {
          <div class="empty">
            <app-icon class="big" name="track_changes" [size]="40" />
            <p>Defina limites mensais por categoria. O app avisa quando chegar perto e quando estourar.</p>
            <button class="btn sm" type="button" (click)="novo()">Criar orçamento</button>
          </div>
        }
      </section>
    </div>

    <app-sheet [(open)]="aberto" [titulo]="f.id ? 'Editar orçamento' : 'Novo orçamento'">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Categoria</span>
          <select name="cat" [(ngModel)]="f.categoria_id">
            <option [ngValue]="null">Geral (todos os gastos)</option>
            @for (c of s.catGasto(); track c.id) {
              <option [ngValue]="c.id">{{ c.nome }}</option>
            }
          </select>
        </label>
        <div class="grid2">
          <label class="field"><span>Limite mensal</span>
            <input name="valor" type="number" inputmode="decimal" step="0.01" [(ngModel)]="f.valor" /></label>
          <label class="field"><span>Avisar em (%)</span>
            <input name="alerta" type="number" inputmode="numeric" min="1" max="100" [(ngModel)]="f.alerta_pct" /></label>
        </div>
        <button class="btn block" type="submit" [disabled]="salvando()">Salvar</button>
        @if (f.id) {
          <button class="btn danger block" type="button" (click)="excluir()">Excluir orçamento</button>
        }
      </form>
    </app-sheet>
  `,
  styles: `
    .avisos { display: flex; flex-direction: column; gap: 8px; }
    .item { display: flex; flex-direction: column; gap: 6px; width: 100%; background: none; border: 0; border-bottom: 1px solid var(--line);
      padding: 10px 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .item:last-child { border-bottom: 0; }
    .lin { display: flex; align-items: center; gap: 12px; }
    .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .t { font-weight: 600; }
    .s { font-size: 0.8rem; color: var(--ink-2); }
  `,
})
export default class Orcamentos {
  protected s = inject(Store);
  private insights = inject(Insights);
  private toast = inject(Toast);
  protected aberto = signal(false);
  protected salvando = signal(false);
  f: FormOrcamento = this.vazio();

  protected bandeiras = computed(() => this.insights.avisos().filter((a) => a.nivel === 'perigo' || a.nivel === 'alerta'));
  private porCategoria = computed(() => this.s.orcamentosStatus().filter((o) => o.orcamento.categoria_id));
  protected orcado = computed(() => soma(this.porCategoria(), (o) => o.orcamento.valor));
  protected gasto = computed(() => soma(this.porCategoria(), (o) => o.gasto));

  private vazio(): FormOrcamento {
    return { categoria_id: null, valor: null, alerta_pct: 80 };
  }

  novo() {
    this.f = this.vazio();
    const usadas = new Set(this.s.orcamentos().map((o) => o.categoria_id));
    this.f.categoria_id = this.s.catGasto().find((c) => !usadas.has(c.id))?.id ?? null;
    this.aberto.set(true);
  }

  editar(o: StatusOrcamento) {
    this.f = { id: o.orcamento.id, categoria_id: o.orcamento.categoria_id, valor: o.orcamento.valor, alerta_pct: o.orcamento.alerta_pct };
    this.aberto.set(true);
  }

  async salvar() {
    const f = this.f;
    if (!f.valor || f.valor <= 0) return this.toast.erro('Informe o limite');
    if (this.s.orcamentos().some((o) => o.categoria_id === f.categoria_id && o.id !== f.id))
      return this.toast.erro('Já existe orçamento para essa categoria');
    this.salvando.set(true);
    try {
      await this.s.salvar('orcamentos', { ...f, valor: f.valor, alerta_pct: Math.min(100, Math.max(1, f.alerta_pct || 80)) });
      this.toast.ok('Orçamento salvo');
      this.aberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  excluir() {
    if (!this.f.id) return;
    this.s.excluirAdiado('orcamentos', this.f.id, 'Orçamento excluído');
    this.aberto.set(false);
  }

}
