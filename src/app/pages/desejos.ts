import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { hoje } from '../core/datas';
import { BrlPipe, DiaPipe, parseValor, pct, soma } from '../core/formato';
import { Desejo } from '../core/models';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';
import { Moeda } from '../shared/moeda';

interface FormDesejo {
  id?: string;
  descricao: string;
  valor: string;
  prioridade: 1 | 2 | 3;
  link: string;
  cofrinho_id: string | null;
}

const PRIORIDADES = [
  { v: 1, r: 'Alta', cor: 'var(--danger)' },
  { v: 2, r: 'Média', cor: 'var(--warn)' },
  { v: 3, r: 'Baixa', cor: 'var(--ink-3)' },
] as const;

/** O que o casal quer comprar: prioridade, quanto já tem guardado e se cabe no planejamento */
@Component({
  imports: [Moeda, FormsModule, BrlPipe, DiaPipe, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Lista de desejos</h1>
        <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" />Desejo</button>
      </div>

      @if (pendentes().length) {
        <div class="stats">
          <div class="stat"><div class="l">Tudo da lista</div><div class="v">{{ total() | brl }}</div></div>
          <div class="stat"><div class="l">Sobra prevista do mês</div><div class="v" [class.neg]="s.resumo().saldo < 0">{{ s.resumo().saldo | brl }}</div></div>
        </div>
      }

      @for (d of pendentes(); track d.d.id) {
        <article class="card desejo">
          <button type="button" class="cab" (click)="editar(d.d)">
            <i class="pri" [style.background]="d.pri.cor" [title]="'Prioridade ' + d.pri.r"></i>
            <span class="grow"><b>{{ d.d.descricao }}</b><span class="small muted">Prioridade {{ d.pri.r.toLowerCase() }}{{ d.cofrinho ? ' · ' + d.cofrinho : '' }}</span></span>
            <b class="num">{{ d.d.valor | brl }}</b>
          </button>
          @if (d.guardado !== null) {
            <div class="bar"><i [style.width.%]="d.pct > 100 ? 100 : d.pct"></i></div>
            <p class="small muted">{{ d.guardado | brl }} guardado ({{ d.pct }}%)</p>
          }
          @if (d.meses !== null) {
            <p class="small muted">{{ d.meses === 0 ? 'Já dá para comprar com o guardado.' : 'Com a sobra prevista deste mês, junta em ' + d.meses + (d.meses === 1 ? ' mês.' : ' meses.') }}</p>
          }
          <div class="bts">
            @if (d.d.link) { <a class="btn ghost sm" [href]="d.d.link" target="_blank" rel="noopener"><app-icon name="open_in_new" [size]="16" />Ver</a> }
            <button type="button" class="btn ghost sm" (click)="simular(d.d)"><app-icon name="query_stats" [size]="16" />Posso comprar?</button>
            <button type="button" class="btn sm" (click)="comprei(d.d)"><app-icon name="shopping_bag" [size]="16" />Comprei</button>
          </div>
        </article>
      } @empty {
        <div class="card empty">
          <app-icon class="big" name="favorite" [size]="40" />
          <p>Anote o que querem comprar, com prioridade e preço. O CFP mostra quando cabe no orçamento.</p>
          <button class="btn sm" type="button" (click)="novo()">Adicionar desejo</button>
        </div>
      }

      @if (comprados().length) {
        <details class="card">
          <summary class="small"><b>Comprados ({{ comprados().length }})</b></summary>
          @for (d of comprados(); track d.id) {
            <button type="button" class="row" (click)="editar(d)">
              <div class="grow"><div class="t">{{ d.descricao }}</div><div class="s">comprado {{ d.comprado_em! | dia }}</div></div>
              <span class="v">{{ d.valor | brl }}</span>
            </button>
          }
        </details>
      }
    </div>

    <app-sheet [(open)]="aberto" [titulo]="f.id ? 'Editar desejo' : 'Novo desejo'">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>O que é</span><input name="d" [(ngModel)]="f.descricao" placeholder="Ex.: Geladeira nova" /></label>
        <label class="field"><span>Preço</span><input name="v" moeda inputmode="numeric" [(ngModel)]="f.valor" placeholder="0,00" /></label>
        <div class="field">
          <span>Prioridade</span>
          <div class="seg">
            @for (p of prioridades; track p.v) {
              <button type="button" [class.on]="f.prioridade === p.v" (click)="f.prioridade = p.v">{{ p.r }}</button>
            }
          </div>
        </div>
        <label class="field"><span>Link (opcional)</span><input name="l" type="url" [(ngModel)]="f.link" placeholder="https://" /></label>
        <label class="field"><span>Guardando no cofrinho (opcional)</span>
          <select name="c" [(ngModel)]="f.cofrinho_id">
            <option [ngValue]="null">Nenhum</option>
            @for (c of s.cofrinhos(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
          </select>
        </label>
        <button class="btn block" [disabled]="salvando()">Salvar</button>
        @if (f.id) { <button class="btn danger block" type="button" (click)="excluir()">Excluir</button> }
      </form>
    </app-sheet>
  `,
  styles: `
    .desejo { display: flex; flex-direction: column; gap: 8px; }
    .cab { display: flex; align-items: center; gap: 10px; background: none; border: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; padding: 0; width: 100%; }
    .cab .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .pri { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .bar { height: 6px; }
    .bts { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
    .bts app-icon { margin-right: 4px; }
    p { margin: 0; }
    summary { cursor: pointer; }
    .row { background: none; border: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; width: 100%; }
  `,
})
export default class Desejos {
  protected s = inject(Store);
  private toast = inject(Toast);
  private lancar = inject(Lancar);
  private router = inject(Router);
  protected prioridades = PRIORIDADES;
  protected aberto = signal(false);
  protected salvando = signal(false);
  f: FormDesejo = this.vazio();

  protected pendentes = computed(() => {
    const sobra = this.s.resumo().saldo;
    return this.s
      .desejos()
      .filter((d) => !d.comprado_em)
      .sort((a, b) => a.prioridade - b.prioridade || a.valor - b.valor)
      .map((d) => {
        const guardado = d.cofrinho_id ? (this.s.guardadoPorCofrinho().get(d.cofrinho_id) ?? 0) : null;
        const falta = Math.max(0, d.valor - (guardado ?? 0));
        return {
          d,
          pri: PRIORIDADES[d.prioridade - 1],
          cofrinho: d.cofrinho_id ? this.s.cofrinhos().find((c) => c.id === d.cofrinho_id)?.nome : undefined,
          guardado,
          pct: pct(guardado ?? 0, d.valor),
          meses: !falta ? 0 : sobra > 0 ? Math.ceil(falta / sobra) : null,
        };
      });
  });
  protected comprados = computed(() => this.s.desejos().filter((d) => d.comprado_em).sort((a, b) => b.comprado_em!.localeCompare(a.comprado_em!)));
  protected total = computed(() => soma(this.pendentes(), (d) => d.d.valor));

  private vazio(): FormDesejo {
    return { descricao: '', valor: '', prioridade: 2, link: '', cofrinho_id: null };
  }

  novo() {
    this.f = this.vazio();
    this.aberto.set(true);
  }

  editar(d: Desejo) {
    this.f = { id: d.id, descricao: d.descricao, valor: String(d.valor).replace('.', ','), prioridade: d.prioridade, link: d.link ?? '', cofrinho_id: d.cofrinho_id };
    this.aberto.set(true);
  }

  async salvar() {
    if (!this.f.descricao.trim()) return this.toast.erro('Informe o que é');
    this.salvando.set(true);
    try {
      const { id, descricao, prioridade, link, cofrinho_id } = this.f;
      await this.s.salvar('desejos', { id, descricao: descricao.trim(), valor: parseValor(this.f.valor), prioridade, link: link.trim() || null, cofrinho_id });
      this.aberto.set(false);
      this.toast.ok('Salvo');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  excluir() {
    if (!this.f.id) return;
    this.s.excluirAdiado('desejos', this.f.id, 'Desejo excluído');
    this.aberto.set(false);
  }

  simular(d: Desejo) {
    this.router.navigate(['/planejamento'], { queryParams: { comprar: d.valor } });
  }

  /** Marca como comprado e abre o lançamento já preenchido */
  async comprei(d: Desejo) {
    try {
      await this.s.salvar('desejos', { id: d.id, comprado_em: hoje() });
      this.toast.feito(`${d.descricao} comprado`, () => this.s.salvar('desejos', { id: d.id, comprado_em: null }));
      this.lancar.novo('gasto');
      this.lancar.texto.set(`${d.descricao} ${String(d.valor).replace('.', ',')}`);
    } catch (e) {
      this.toast.erro(e);
    }
  }
}
