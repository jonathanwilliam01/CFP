import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BrlPipe, DiaPipe, parseValor, soma } from '../core/formato';
import { Entrada, Gasto } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { normalizar } from '../core/texto';
import { Icon } from './icon';
import { Lancar } from './lancar';

const LIMITE = 100;

/** Busca em todos os meses: gastos, entradas, contas/entradas fixas, cofrinhos e registros */
/** Busca em todos os meses, aberta no topo sem trocar de tela */
@Component({
  selector: 'app-buscador',
  imports: [FormsModule, RouterLink, BrlPipe, DiaPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
      <label class="busca">
        <app-icon name="search" [size]="20" />
        <input type="search" autofocus (keydown.escape)="fechar.emit()" placeholder="Descrição, categoria, #marcador ou valor" [ngModel]="termo()" (ngModelChange)="termo.set($event)" />
      </label>

      @if (termo().trim().length < 2) {
        <p class="small muted dica">Digite ao menos 2 letras. Valor com centavos (49,90) acha o exato, só reais (49) acha de 49,00 a 49,99; #viagem busca pelo marcador.</p>
      } @else {
        @if (gastos().length) {
          <div class="card-head"><h2>Gastos</h2><span class="small muted">{{ gastos().length }}{{ gastos().length === limite ? '+' : '' }} · <b class="num">{{ totalGastos() | brl }}</b></span></div>
          <section class="list">
            @for (g of gastos(); track g.id) {
              <button class="row" (click)="lancar.editarGasto(g); fechar.emit()">
                <span class="ico"><app-icon [name]="s.catMap().get(g.categoria_id ?? '')?.icone ?? 'help'" /></span>
                <div class="grow"><div class="t">{{ g.descricao }}@for (t of g.tags ?? []; track t) {<span class="tag">#{{ t }}</span>}</div>
                  <div class="s">{{ g.data | dia }} · {{ s.catMap().get(g.categoria_id ?? '')?.nome ?? 'Sem categoria' }}</div></div>
                <span class="v">{{ g.valor | brl }}</span>
              </button>
            }
          </section>
        }
        @if (entradas().length) {
          <div class="card-head"><h2>Entradas</h2></div>
          <section class="list">
            @for (e of entradas(); track e.id) {
              <button class="row" (click)="lancar.editarEntrada(e); fechar.emit()">
                <span class="ico"><app-icon name="payments" /></span>
                <div class="grow"><div class="t">{{ e.descricao }}</div><div class="s">{{ e.data | dia }}</div></div>
                <span class="v pos">{{ e.valor | brl }}</span>
              </button>
            }
          </section>
        }
        @if (outros().length) {
          <div class="card-head"><h2>Cadastros</h2></div>
          <section class="list">
            @for (o of outros(); track o.id) {
              <a class="row" [routerLink]="o.link" (click)="fechar.emit()">
                <span class="ico"><app-icon [name]="o.icone" /></span>
                <div class="grow"><div class="t">{{ o.nome }}</div><div class="s">{{ o.tipo }}</div></div>
                @if (o.valor != null) { <span class="v">{{ o.valor | brl }}</span> }
              </a>
            }
          </section>
        }
        @if (!buscando() && !gastos().length && !entradas().length && !outros().length) {
          <div class="empty"><app-icon class="big" name="search_off" [size]="40" />Nada encontrado.</div>
        }
      }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 6px; }
    .dica { padding: 4px 4px 8px; }
    h2 { font-size: 0.9rem; }
    .busca {
      display: flex; align-items: center; gap: 8px; padding: 0 12px; border-radius: 14px;
      background: var(--card); border: 1px solid var(--line); color: var(--ink-2);
    }
    .busca input { flex: 1; border: 0; background: none; min-height: 46px; padding: 0; outline: none; }
    .tag { margin-left: 6px; font-size: 0.72rem; color: var(--primary); font-weight: 600; }
  `,
})
export class Buscador {
  readonly fechar = output();
  protected s = inject(Store);
  protected lancar = inject(Lancar);
  protected limite = LIMITE;

  protected termo = signal('');
  protected buscando = signal(false);
  protected gastos = signal<Gasto[]>([]);
  protected entradas = signal<Entrada[]>([]);
  protected totalGastos = computed(() => soma(this.gastos(), (g) => g.valor));
  private req = 0;
  private timer?: ReturnType<typeof setTimeout>;

  /** Cadastros já carregados no Store, filtrados aqui mesmo */
  protected outros = computed(() => {
    const t = normalizar(this.termo());
    if (t.length < 2) return [];
    const tem = (s: string) => normalizar(s).includes(t);
    return [
      ...this.s.recorrencias().filter((r) => tem(r.descricao)).map((r) => ({
        id: r.id, nome: r.descricao, tipo: (r.tipo === 'conta' ? 'Conta fixa' : 'Entrada fixa') + (r.ativo ? '' : ' · inativa'),
        icone: r.tipo === 'conta' ? 'calendar_month' : 'payments', valor: this.s.medias().get(r.id) ?? r.valor, link: r.tipo === 'conta' ? '/contas' : '/entradas',
      })),
      ...this.s.cofrinhos().filter((c) => tem(c.nome)).map((c) => ({ id: c.id, nome: c.nome, tipo: 'Cofrinho', icone: c.icone, valor: null, link: `/cofrinhos/${c.id}` })),
      ...this.s.registros().filter((r) => tem(r.nome)).map((r) => ({ id: r.id, nome: r.nome, tipo: 'Registro', icone: r.icone, valor: null, link: `/registros/${r.id}` })),
      ...this.s.cartoes().filter((c) => tem(c.nome)).map((c) => ({ id: c.id, nome: c.nome, tipo: 'Cartão', icone: 'credit_card', valor: null, link: '/cartoes' })),
    ];
  });

  constructor() {
    const el = inject(ElementRef<HTMLElement>);
    afterNextRender(() => el.nativeElement.querySelector('input')?.focus());
    effect(() => {
      const t = this.termo().trim();
      this.s.mudou();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => untracked(() => this.buscar(t)), 300);
    });
  }

  private async buscar(t: string) {
    const req = ++this.req;
    if (t.length < 2) {
      this.gastos.set([]);
      this.entradas.set([]);
      return;
    }
    const id = this.s.carteiraId()!;
    // tira o que quebra o filtro do PostgREST
    const limpo = t.replace(/[,()*%\\"]/g, ' ').trim();
    // valor com centavos acha o exato; só reais acha 50,00 a 50,99
    const num = t.replace(/r\$\s*/i, '').trim();
    const valor = /^[\d.,]+$/.test(num) ? parseValor(num) : 0;
    const porValor = !valor ? [] : /[.,]\d{1,2}$/.test(num) ? [`valor.eq.${valor}`] : [`and(valor.gte.${valor},valor.lt.${valor + 1})`];
    const cats = this.s.categorias().filter((c) => normalizar(c.nome).includes(normalizar(limpo))).map((c) => c.id);
    const filtroGasto = limpo.startsWith('#')
      ? `tags.cs.{${normalizar(limpo.slice(1))}}`
      : [`descricao.ilike.*${limpo}*`, ...porValor, ...(cats.length ? [`categoria_id.in.(${cats.join(',')})`] : [])].join(',');
    const filtroEntrada = [`descricao.ilike.*${limpo}*`, ...porValor].join(',');
    this.buscando.set(true);
    try {
      const [g, e] = await Promise.all([
        q<Gasto[]>(supabase.from('gastos').select('*').eq('carteira_id', id).or(filtroGasto).order('data', { ascending: false }).limit(LIMITE)),
        limpo.startsWith('#')
          ? Promise.resolve([])
          : q<Entrada[]>(supabase.from('entradas').select('*').eq('carteira_id', id).or(filtroEntrada).order('data', { ascending: false }).limit(LIMITE)),
      ]);
      if (req !== this.req) return;
      this.gastos.set(g);
      this.entradas.set(e);
    } catch {
      if (req === this.req) this.gastos.set([]);
    } finally {
      if (req === this.req) this.buscando.set(false);
    }
  }
}
