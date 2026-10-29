import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { addMeses, diasNoMes, hoje, nomeMes } from '../core/datas';
import { StatusOrcamento, ajusteOrcamento, ritmoMes } from '../core/financas';
import { BrlPipe, MesPipe, soma } from '../core/formato';
import { Insights } from '../core/insights';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

type Aplicar = 'mes' | 'meses' | 'sempre';

interface FormOrcamento {
  id?: string;
  categoria_id: string | null;
  valor: number | null;
  alerta_pct: number;
  aplicar: Aplicar;
  /** 'YYYY-MM' */
  inicio: string;
  meses: number;
  /** '' qualquer, 'debito' ou id do cartão */
  pagamento: string;
  reserva: boolean;
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
          @if (s.resumo().reservado) {
            <div class="stat"><div class="l">Reservado no saldo</div><div class="v">{{ s.resumo().reservado | brl }}</div></div>
          }
        </div>
      }

      <section class="card">
        <div class="card-head">
          <h2>Limites de {{ s.mes() | mes }}</h2>
        </div>
        @if (ritmo() !== null && s.orcamentosStatus().length) {
          <p class="small muted">Dia {{ dia }} de {{ diasMes() }}: a marca na barra mostra onde o gasto deveria estar hoje ({{ ritmo() }}% do mês).</p>
        }
        @for (o of s.orcamentosStatus(); track o.orcamento.id) {
          <button type="button" class="item" (click)="editar(o)">
            <div class="lin">
              <span class="ico" [style.background]="o.cor + '22'" [style.color]="o.cor"><app-icon [name]="o.icone" /></span>
              <span class="grow">
                <span class="t">{{ o.nome }}@if (o.pagamento) { <span class="pg">· {{ o.pagamento }}</span> }</span>
                <span class="s num">{{ o.gasto | brl }} de {{ o.orcamento.valor | brl }}@if (padrao(o); as p) { · <span class="aj">ajustado (padrão {{ p | brl }})</span>}</span>
              </span>
              <span class="badge" [class.ok]="o.nivel === 'ok'" [class.alerta]="o.nivel === 'alerta'" [class.perigo]="o.nivel === 'estourado'">{{ o.pct }}%</span>
            </div>
            <div class="ritmo">
              <div class="bar" [class.alerta]="o.nivel === 'alerta'" [class.estourado]="o.nivel === 'estourado'">
                <i [style.width.%]="o.pct > 100 ? 100 : o.pct"></i>
              </div>
              @if (ritmo() !== null) { <i class="marca" [style.left.%]="ritmo()"></i> }
            </div>
            <span class="s small muted">
              @if (o.gasto <= o.orcamento.valor) { Resta {{ o.orcamento.valor - o.gasto | brl }} } @else { Passou {{ o.gasto - o.orcamento.valor | brl }} }
              @if (o.reservado) { · <span class="res">{{ o.reservado | brl }} reservado no saldo</span> }
              @if (ritmo() !== null && o.nivel !== 'estourado') {
                · <span [class.adiantado]="o.pct > ritmo()! + 10">{{ o.pct > ritmo()! + 10 ? 'acima do ritmo' : 'no ritmo' }}</span>
              }
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
        <div class="field">
          <span>Pagamento</span>
          <div class="chips wrap">
            <button type="button" class="chip" [class.on]="!f.pagamento" (click)="f.pagamento = ''">Qualquer</button>
            @for (c of s.cartoesAtivos(); track c.id) {
              <button type="button" class="chip" [class.on]="f.pagamento === c.id" (click)="f.pagamento = c.id"><i class="dot" [style.background]="c.cor"></i>{{ c.nome }}</button>
            }
            <button type="button" class="chip" [class.on]="f.pagamento === 'debito'" (click)="f.pagamento = 'debito'"><app-icon name="payments" [size]="18" />Pix/Débito</button>
          </div>
          @if (f.pagamento) {
            <label class="check"><input type="checkbox" name="reserva" [(ngModel)]="f.reserva" />Contar como gasto previsto no saldo</label>
            <p class="small muted">
              {{ f.pagamento === 'debito' ? 'Só gastos no Pix/débito contam neste orçamento.' : 'Só compras neste cartão contam, pela fatura que entra nas contas do mês.' }}
              @if (f.reserva) { O que faltar do limite entra nas saídas do mês, como se já estivesse gasto; cada compra lançada só ocupa o lugar dele. }
            </p>
          }
        </div>
        <div class="grid2">
          <label class="field"><span>{{ f.id ? 'Novo limite' : 'Limite mensal' }}</span>
            <input name="valor" type="number" inputmode="decimal" step="0.01" [(ngModel)]="f.valor" /></label>
          <label class="field"><span>Avisar em (%)</span>
            <input name="alerta" type="number" inputmode="numeric" min="1" max="100" [(ngModel)]="f.alerta_pct" /></label>
        </div>
        @if (f.id) {
          <div class="field">
            <span>Aplicar o limite</span>
            <div class="seg">
              <button type="button" [class.on]="f.aplicar === 'mes'" (click)="f.aplicar = 'mes'">Só um mês</button>
              <button type="button" [class.on]="f.aplicar === 'meses'" (click)="f.aplicar = 'meses'">Por meses</button>
              <button type="button" [class.on]="f.aplicar === 'sempre'" (click)="f.aplicar = 'sempre'">Daí em diante</button>
            </div>
          </div>
          <div class="grid2">
            <label class="field"><span>{{ f.aplicar === 'mes' ? 'Mês' : 'A partir de' }}</span>
              <input name="inicio" type="month" [(ngModel)]="f.inicio" /></label>
            @if (f.aplicar === 'meses') {
              <label class="field"><span>Quantos meses</span>
                <input name="meses" type="number" inputmode="numeric" min="2" max="36" [(ngModel)]="f.meses" /></label>
            }
          </div>
          <p class="small muted">{{ explicar() }}</p>
          @if (ajusteSel(); as a) {
            <div class="aviso info">
              <app-icon class="i" name="tune" />
              <div><div class="t">{{ s.mes() | mes }}: {{ a.valor | brl }}</div>
                <div class="s">Limite ajustado {{ a.ate === a.mes ? 'só neste mês' : a.ate ? 'até ' + (a.ate | mes: true) : 'daí em diante' }}. Padrão: {{ base()?.valor | brl }}.</div>
                <button class="btn ghost sm volta" type="button" (click)="usarPadrao()">Usar o padrão neste mês</button>
              </div>
            </div>
          }
        }
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
    .adiantado { color: var(--warn); font-weight: 700; }
    .s { font-size: 0.8rem; color: var(--ink-2); }
    .aj { color: var(--primary); font-weight: 600; }
    .pg { color: var(--ink-2); font-weight: 500; }
    .res { color: #8b5cf6; font-weight: 600; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .volta { margin-top: 8px; }
  `,
})
export default class Orcamentos {
  protected s = inject(Store);
  private insights = inject(Insights);
  private toast = inject(Toast);
  protected aberto = signal(false);
  protected salvando = signal(false);
  f: FormOrcamento = this.vazio();

  protected dia = Number(hoje().slice(8));
  protected ritmo = computed(() => ritmoMes(this.s.mes(), hoje()));
  protected diasMes = computed(() => diasNoMes(this.s.mes()));
  protected bandeiras = computed(() => this.insights.avisos().filter((a) => a.nivel === 'perigo' || a.nivel === 'alerta'));
  private porCategoria = computed(() => this.s.orcamentosStatus().filter((o) => o.orcamento.categoria_id));
  protected orcado = computed(() => soma(this.porCategoria(), (o) => o.orcamento.valor));
  protected gasto = computed(() => soma(this.porCategoria(), (o) => o.gasto));

  private vazio(): FormOrcamento {
    return { categoria_id: null, valor: null, alerta_pct: 80, aplicar: 'mes', inicio: this.s.mes().slice(0, 7), meses: 3, pagamento: '', reserva: true };
  }

  /** Limite do cadastro, quando o do mês vem de um ajuste */
  padrao(o: StatusOrcamento) {
    const b = this.s.orcamentos().find((x) => x.id === o.orcamento.id);
    return b && b.valor !== o.orcamento.valor ? b.valor : null;
  }

  protected base = computed(() => this.s.orcamentos().find((o) => o.id === this.sel()) ?? null);
  private sel = signal<string | null>(null);
  protected ajusteSel = computed(() => {
    const b = this.base();
    return b ? ajusteOrcamento(b, this.s.orcamentoValores(), this.s.mes()) ?? null : null;
  });

  private periodo() {
    const mes = `${this.f.inicio || this.s.mes().slice(0, 7)}-01`;
    const n = Math.min(36, Math.max(2, Math.round(this.f.meses) || 2));
    return { mes, ate: this.f.aplicar === 'mes' ? mes : this.f.aplicar === 'meses' ? addMeses(mes, n - 1) : null };
  }

  explicar() {
    const { mes, ate } = this.periodo();
    const nome = (m: string) => nomeMes(m);
    if (!ate) return `Vale de ${nome(mes)} em diante. Meses anteriores continuam com o limite que tinham.`;
    return `${mes === ate ? `Vale só em ${nome(mes)}` : `Vale de ${nome(mes)} até ${nome(ate)}`}; depois volta ao limite que valia antes.`;
  }

  novo() {
    this.f = this.vazio();
    const usadas = new Set(this.s.orcamentos().map((o) => o.categoria_id));
    this.f.categoria_id = this.s.catGasto().find((c) => !usadas.has(c.id))?.id ?? null;
    this.aberto.set(true);
  }

  editar(o: StatusOrcamento) {
    const b = o.orcamento;
    this.f = {
      ...this.vazio(), id: b.id, categoria_id: b.categoria_id, valor: b.valor, alerta_pct: b.alerta_pct,
      pagamento: b.forma === 'cartao' ? b.cartao_id ?? '' : b.forma === 'debito' ? 'debito' : '', reserva: !!b.reserva || !b.forma,
    };
    this.sel.set(o.orcamento.id);
    this.aberto.set(true);
  }

  /** Colunas da forma de pagamento (migration 022); qualquer forma não reserva */
  private pagamento() {
    const p = this.f.pagamento;
    return {
      forma: (p === 'debito' ? 'debito' : p ? 'cartao' : null) as 'debito' | 'cartao' | null,
      cartao_id: p && p !== 'debito' ? p : null,
      reserva: !!p && this.f.reserva,
    };
  }

  async usarPadrao() {
    const b = this.base();
    if (!b) return;
    try {
      await this.s.ajustarOrcamento(b.id, b.valor, this.s.mes(), this.s.mes());
      this.toast.ok('Limite padrão neste mês');
      this.aberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async salvar() {
    const f = this.f;
    if (!f.valor || f.valor <= 0) return this.toast.erro('Informe o limite');
    const pg = this.pagamento();
    if (this.s.orcamentos().some((o) => o.categoria_id === f.categoria_id && (o.forma ?? null) === pg.forma && (o.cartao_id ?? null) === pg.cartao_id && o.id !== f.id))
      return this.toast.erro('Já existe orçamento para essa categoria e pagamento');
    this.salvando.set(true);
    try {
      const alerta_pct = Math.min(100, Math.max(1, f.alerta_pct || 80));
      if (!f.id) {
        await this.s.salvar('orcamentos', { categoria_id: f.categoria_id, valor: f.valor, alerta_pct, ...(pg.forma ? pg : {}) });
        this.toast.ok('Orçamento salvo');
      } else {
        const b = this.base()!;
        const mudouPg = (b.forma ?? null) !== pg.forma || (b.cartao_id ?? null) !== pg.cartao_id || !!b.reserva !== pg.reserva;
        if (b.categoria_id !== f.categoria_id || b.alerta_pct !== alerta_pct || mudouPg)
          await this.s.salvar('orcamentos', { id: f.id, categoria_id: f.categoria_id, alerta_pct, ...(mudouPg ? pg : {}) });
        const { mes, ate } = this.periodo();
        const vigente = ajusteOrcamento(b, this.s.orcamentoValores(), mes)?.valor ?? b.valor;
        if (f.valor !== vigente || f.aplicar !== 'mes') await this.s.ajustarOrcamento(f.id, f.valor, mes, ate);
        this.toast.ok('Orçamento salvo');
      }
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
