import { ChangeDetectionStrategy, Component, Directive, ElementRef, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrlPipe, parseValor } from '../core/formato';
import { Gasto } from '../core/models';
import { Store } from '../core/store';
import { Autor } from './autor';
import { Icon } from './icon';
import { Moeda } from './moeda';
import { Toast } from './toast';

type Coluna = 'data' | 'descricao' | 'categoria' | 'pagamento' | 'pessoa' | 'valor';
type Campo = 'descricao' | 'categoria_id' | 'valor';

/** Nome da forma de pagamento do gasto (cartão, benefício, cofrinho ou à vista) */
export function formaGasto(s: Store, g: Gasto) {
  if (g.forma === 'cartao') return s.cartoes().find((c) => c.id === g.cartao_id)?.nome ?? 'Cartão';
  if (g.forma === 'beneficio') return s.beneficios().find((b) => b.id === g.beneficio_id)?.nome ?? 'Benefício';
  if (g.cofrinho_id) return 'Cofrinho ' + (s.cofrinhos().find((c) => c.id === g.cofrinho_id)?.nome ?? '');
  return 'À vista';
}

/** Foca (e seleciona) o campo ao aparecer: autofocus não vale para elemento criado depois da carga */
@Directive({ selector: '[foco]' })
class Foco {
  constructor() {
    const el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      el.focus();
      el.select?.();
    });
  }
}

/** Gastos em tabela (computador): ordena pelo cabeçalho e edita descrição, categoria e valor na célula */
@Component({
  selector: 'app-tabela-gastos',
  imports: [FormsModule, BrlPipe, Autor, Icon, Moeda, Foco],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card tab">
      <table>
        <thead>
          <tr>
            @if (marca()) { <th class="mc"></th> }
            @for (c of colunas; track c.k) {
              <th [class.dir]="c.k === 'valor'" [attr.aria-sort]="ordem().col === c.k ? (ordem().asc ? 'ascending' : 'descending') : null">
                <button type="button" (click)="ordenar(c.k)">{{ c.r }}@if (ordem().col === c.k) {<app-icon [name]="ordem().asc ? 'arrow_upward' : 'arrow_downward'" [size]="14" />}</button>
              </th>
            }
            <th class="mc"></th>
          </tr>
        </thead>
        <tbody>
          @for (g of linhas(); track g.id) {
            @let oculto = s.livreDeOutro(g);
            @let pode = !oculto && !g.parcelamento_id;
            <tr [class.sel]="marca() === 'sel' && marcados().has(g.id)">
              @if (marca()) {
                <td class="mc">
                  @if (!oculto) {
                    <button type="button" class="ic" [class.on]="marca() === 'sel' ? marcados().has(g.id) : g.conferido" (click)="tocar.emit(g)">
                      <app-icon [name]="marca() === 'sel' ? (marcados().has(g.id) ? 'check_box' : 'check_box_outline_blank') : g.conferido ? 'task_alt' : 'radio_button_unchecked'" [size]="18" />
                    </button>
                  }
                </td>
              }
              <td class="num">{{ g.data.slice(8, 10) }}/{{ g.data.slice(5, 7) }}</td>
              <td class="desc">
                @if (oculto) {
                  <span class="muted"><app-icon name="lock" [size]="14" /> Dinheiro livre de {{ s.nomeAutor(g.criado_por) }}</span>
                } @else if (aberto(g, 'descricao')) {
                  <input foco [ngModel]="rascunho()" (ngModelChange)="rascunho.set($event)" (keydown.enter)="gravar(g)" (keydown.escape)="cancelar()" (blur)="gravar(g)" />
                } @else {
                  <span [class.ed]="pode" (click)="pode && abrir(g, 'descricao', g.descricao)">{{ g.descricao }}</span>
                  @if (g.livre) { <span class="selo">livre</span> }
                  @if (g.parcelamento_id) { <app-icon class="muted" name="splitscreen" [size]="14" /> }
                }
              </td>
              <td>
                @if (oculto) {
                  <span class="muted">—</span>
                } @else if (aberto(g, 'categoria_id')) {
                  <select foco [ngModel]="g.categoria_id" (ngModelChange)="rascunho.set($event); gravar(g)" (keydown.escape)="cancelar()" (blur)="cancelar()">
                    <option [ngValue]="null">Sem categoria</option>
                    @for (c of s.catGasto(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
                  </select>
                } @else {
                  <span [class.ed]="pode" (click)="pode && abrir(g, 'categoria_id', g.categoria_id)"><i class="dot" [style.background]="cat(g)?.cor ?? '#94a3b8'"></i>{{ cat(g)?.nome ?? 'Sem categoria' }}</span>
                }
              </td>
              <td>{{ forma(g) }}</td>
              <td><span class="pes"><app-autor [id]="g.criado_por" [size]="16" />{{ s.nomeAutor(g.criado_por) }}</span></td>
              <td class="dir num">
                @if (aberto(g, 'valor')) {
                  <input moeda inputmode="numeric" foco [ngModel]="rascunho()" (ngModelChange)="rascunho.set($event)" (keydown.enter)="gravar(g)" (keydown.escape)="cancelar()" (blur)="gravar(g)" />
                } @else {
                  <span [class.ed]="pode" [class.benef]="g.forma === 'beneficio'" (click)="pode && abrir(g, 'valor', g.valor)">{{ g.valor | brl }}</span>
                }
              </td>
              <td class="mc">
                @if (!oculto) {
                  <button type="button" class="ic" aria-label="Abrir o gasto" (click)="abrirGasto.emit(g)"><app-icon name="open_in_new" [size]="16" /></button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .tab { padding: 0; max-height: calc(100dvh - 200px); overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
    th { position: sticky; top: 0; z-index: 1; background: var(--card); border-bottom: 1px solid var(--line); text-align: left; padding: 0; }
    th button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 2px; padding: 8px; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-3); }
    td { padding: 4px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; max-width: 260px; overflow: hidden; text-overflow: ellipsis; height: 34px; }
    tr:hover td { background: var(--card-2); }
    tr.sel td { background: color-mix(in srgb, var(--primary) 10%, transparent); }
    .dir { text-align: right; }
    .dir button { flex-direction: row-reverse; }
    .mc { width: 30px; padding: 0 4px; }
    .ic { all: unset; cursor: pointer; display: grid; place-items: center; color: var(--ink-3); }
    .ic.on { color: var(--primary); }
    .ed { cursor: text; border-radius: 6px; padding: 2px 4px; margin: 0 -4px; }
    .ed:hover { outline: 1px dashed var(--line); }
    td input, td select { padding: 3px 6px; min-height: 0; font-size: 0.86rem; }
    td.dir input { text-align: right; width: 110px; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
    .pes { display: inline-flex; align-items: center; gap: 6px; }
    .selo { margin-left: 6px; font-size: 0.7rem; font-weight: 700; color: var(--primary); }
    .benef { color: var(--ink-3); }
  `,
})
export class TabelaGastos {
  protected s = inject(Store);
  private toast = inject(Toast);
  readonly gastos = input.required<Gasto[]>();
  /** coluna de marcação: seleção em massa ou conferência da fatura */
  readonly marca = input<'sel' | 'conf' | null>(null);
  readonly marcados = input(new Set<string>());
  readonly tocar = output<Gasto>();
  readonly abrirGasto = output<Gasto>();

  protected colunas: { k: Coluna; r: string }[] = [
    { k: 'data', r: 'Data' },
    { k: 'descricao', r: 'Descrição' },
    { k: 'categoria', r: 'Categoria' },
    { k: 'pagamento', r: 'Pagamento' },
    { k: 'pessoa', r: 'Pessoa' },
    { k: 'valor', r: 'Valor' },
  ];
  protected ordem = signal<{ col: Coluna; asc: boolean }>({ col: 'data', asc: false });

  protected linhas = computed(() => {
    const { col, asc } = this.ordem();
    const chave = (g: Gasto): string | number => {
      const oculto = this.s.livreDeOutro(g);
      switch (col) {
        case 'data': return g.data;
        case 'valor': return g.valor;
        case 'descricao': return oculto ? '' : g.descricao.toLowerCase();
        case 'categoria': return oculto ? '' : (this.cat(g)?.nome ?? '');
        case 'pagamento': return this.forma(g);
        case 'pessoa': return this.s.nomeAutor(g.criado_por);
      }
    };
    return [...this.gastos()].sort((a, b) => {
      const x = chave(a);
      const y = chave(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR');
      return asc ? r : -r;
    });
  });

  ordenar(col: Coluna) {
    this.ordem.update((o) => ({ col, asc: o.col === col ? !o.asc : col !== 'data' && col !== 'valor' }));
  }

  // edição na célula
  private edicao = signal<{ id: string; campo: Campo } | null>(null);
  protected rascunho = signal<unknown>(null);
  protected aberto = (g: Gasto, campo: Campo) => this.edicao()?.id === g.id && this.edicao()?.campo === campo;

  abrir(g: Gasto, campo: Campo, valor: unknown) {
    this.rascunho.set(campo === 'valor' ? String(valor).replace('.', ',') : valor);
    this.edicao.set({ id: g.id, campo });
  }

  cancelar() {
    this.edicao.set(null);
  }

  async gravar(g: Gasto) {
    const e = this.edicao();
    if (!e || e.id !== g.id) return;
    this.edicao.set(null);
    const v = this.rascunho();
    try {
      if (e.campo === 'descricao') {
        const d = String(v ?? '').trim();
        if (!d) return this.toast.erro('Informe a descrição');
        if (d !== g.descricao) await this.s.salvar('gastos', { id: g.id, descricao: d });
      } else if (e.campo === 'categoria_id') {
        const c = (v as string | null) ?? null;
        if (c !== g.categoria_id) await this.s.salvar('gastos', { id: g.id, categoria_id: c });
      } else {
        const n = parseValor(String(v ?? ''));
        if (!n || (n < 0 && g.valor > 0)) return this.toast.erro('Informe o valor');
        if (n !== g.valor) await this.s.salvar('gastos', { id: g.id, valor: n });
      }
    } catch (err) {
      this.toast.erro(err);
    }
  }

  protected cat(g: Gasto) {
    return g.categoria_id ? this.s.catMap().get(g.categoria_id) : undefined;
  }

  protected forma(g: Gasto) {
    return formaGasto(this.s, g);
  }
}
