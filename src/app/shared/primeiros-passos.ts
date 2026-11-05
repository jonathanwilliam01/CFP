import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { diffDias, hoje } from '../core/datas';
import { Store } from '../core/store';
import { Icon } from './icon';
import { Lancar } from './lancar';
import { Tour } from './tour';

/** Checklist do Início para carteira nova: some ao completar ou ao ocultar */
@Component({
  selector: 'app-primeiros-passos',
  host: { '[style.display]': "visivel() ? 'block' : 'none'" },
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visivel()) {
      <section class="card passos">
        <div class="card-head">
          <h2>Primeiros passos</h2>
          <span class="small muted">{{ feitos() }}/{{ itens().length }}</span>
        </div>
        <div class="barra"><i [style.width.%]="(feitos() / itens().length) * 100"></i></div>
        @for (i of itens(); track i.id) {
          @if (i.lancar) {
            <button type="button" class="item" [class.ok]="i.ok" (click)="lancar.novo('gasto')">
              <app-icon [name]="i.ok ? 'check_circle' : 'radio_button_unchecked'" [size]="22" [fill]="i.ok" /><span>{{ i.texto }}</span>
            </button>
          } @else {
            <a class="item" [class.ok]="i.ok" [routerLink]="i.rota">
              <app-icon [name]="i.ok ? 'check_circle' : 'radio_button_unchecked'" [size]="22" [fill]="i.ok" /><span>{{ i.texto }}</span>
              <app-icon class="seta" name="chevron_right" [size]="18" />
            </a>
          }
        }
        <div class="bts">
          <button type="button" class="btn ghost sm" (click)="tour.iniciar()"><app-icon name="tour" [size]="16" />Ver o passo a passo</button>
          <button type="button" class="btn ghost sm" (click)="ocultar()">Ocultar</button>
        </div>
      </section>
    }
  `,
  styles: `
    .passos { display: flex; flex-direction: column; gap: 4px; }
    .barra { height: 6px; border-radius: 3px; background: var(--card-2); overflow: hidden; margin-bottom: 6px; }
    .barra i { display: block; height: 100%; background: var(--primary); transition: width 0.3s; }
    .item {
      display: flex; align-items: center; gap: 10px; padding: 9px 4px; border: 0; background: none; font: inherit; color: var(--ink);
      text-align: left; cursor: pointer; border-radius: 10px; width: 100%;
    }
    .item app-icon { color: var(--ink-3); flex-shrink: 0; }
    .item.ok span { color: var(--ink-3); text-decoration: line-through; }
    .item.ok app-icon { color: var(--ok); }
    .item span { flex: 1; min-width: 0; }
    .bts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; margin-top: 6px; }
  `,
})
export class PrimeirosPassos {
  private s = inject(Store);
  protected lancar = inject(Lancar);
  protected tour = inject(Tour);
  private chave = computed(() => `cfp.passos.${this.s.carteiraId()}`);
  private oculto = signal(false);

  protected itens = computed(() => {
    const s = this.s;
    const rec = s.recorrencias();
    return [
      { id: 'cartao', texto: 'Cadastrar os cartões de crédito', rota: '/cartoes', ok: s.cartoes().length > 0 },
      { id: 'entrada', texto: 'Cadastrar o salário (entrada fixa)', rota: '/entradas', ok: rec.some((r) => r.tipo === 'entrada') },
      { id: 'conta', texto: 'Cadastrar as contas fixas (luz, aluguel...)', rota: '/contas', ok: rec.some((r) => r.tipo === 'conta') },
      { id: 'gasto', texto: 'Lançar o primeiro gasto', rota: '', lancar: true, ok: s.recentes().length > 0 || s.gastos().length > 0 },
      { id: 'orcamento', texto: 'Definir um orçamento por categoria', rota: '/orcamentos', ok: s.orcamentos().length > 0 },
      { id: 'convite', texto: 'Convidar quem divide as contas (opcional)', rota: '/config', ok: s.membros().length > 1 },
    ];
  });
  protected feitos = computed(() => this.itens().filter((i) => i.ok).length);

  /** só carteira criada há até 30 dias, com algo pendente e sem ocultar */
  protected visivel = computed(() => {
    const c = this.s.carteira();
    if (!this.s.pronto() || !c || this.oculto() || localStorage.getItem(this.chave()) === '1') return false;
    const nova = !c.criado_em || diffDias(c.criado_em.slice(0, 10), hoje()) <= 30;
    return nova && this.feitos() < this.itens().length;
  });

  protected ocultar() {
    localStorage.setItem(this.chave(), '1');
    this.oculto.set(true);
  }
}
