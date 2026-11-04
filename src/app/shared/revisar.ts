import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '../core/auth';
import { palpiteCategoria } from '../core/extrato';
import { BrlPipe, DiaPipe } from '../core/formato';
import { Gasto } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { normalizar, regraPara } from '../core/texto';
import { Icon } from './icon';
import { Sheet } from './sheet';
import { Toast } from './toast';

const VISTOS = 'cfp.revisados';

/** Revisão no aparelho: gastos já vistos e desde quando contam os lançados pelo outro membro */
function lerRevisao(carteira: string) {
  try {
    const v = JSON.parse(localStorage.getItem(`${VISTOS}.${carteira}`) ?? 'null');
    if (v?.desde) return v as { desde: string; vistos: string[] };
  } catch {
    // formato inválido: recomeça
  }
  const novo = { desde: new Date().toISOString(), vistos: [] };
  localStorage.setItem(`${VISTOS}.${carteira}`, JSON.stringify(novo));
  return novo;
}

/** Gasto sem categoria ou lançado pelo outro membro depois da última revisão, ainda não visto aqui */
export function paraRevisar(gastos: Gasto[], eu: string | undefined, rev: { desde: string; vistos: string[] }) {
  const vistos = new Set(rev.vistos);
  return gastos.filter(
    (g) => !vistos.has(g.id) && g.valor > 0 && (!g.categoria_id || (!!g.criado_por && g.criado_por !== eu && (g.criado_em ?? '') > rev.desde)),
  );
}

/** Um gasto por vez: confirma ou troca a categoria, e pode virar regra da carteira */
@Component({
  selector: 'app-revisar',
  imports: [FormsModule, BrlPipe, DiaPipe, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet [(open)]="open" titulo="Revisar gastos">
      @if (atual(); as g) {
        <p class="small muted">{{ i() + 1 }} de {{ fila().length }}</p>
        <div class="card gasto">
          <b class="desc">{{ g.descricao }}</b>
          <b class="num valor">{{ g.valor | brl }}</b>
          <span class="small muted">{{ g.data | dia }} · {{ forma(g) }}{{ quem(g) }}</span>
        </div>
        <div class="chips">
          @for (c of opcoes(); track c.id) {
            <button type="button" class="chip" [class.on]="cat() === c.id" (click)="cat.set(c.id)">
              <app-icon [name]="c.icone" [size]="16" [style.color]="c.cor" />{{ c.nome }}
            </button>
          }
        </div>
        <select aria-label="Outra categoria" [ngModel]="cat()" (ngModelChange)="cat.set($event)">
          <option [ngValue]="null">Sem categoria</option>
          @for (c of s.catGasto(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
        </select>
        @if (cat()) {
          <label class="check"><input type="checkbox" [checked]="sempre()" (change)="sempre.set(!sempre())" />Sempre usar para "{{ termo(g) }}"</label>
        }
        <div class="bts">
          <button type="button" class="btn ghost" (click)="proximo()">Pular</button>
          <button type="button" class="btn" [disabled]="salvando()" (click)="confirmar(g)">Confirmar</button>
        </div>
      } @else {
        <div class="empty"><app-icon class="big" name="task_alt" [size]="40" />Tudo revisado.</div>
      }
    </app-sheet>
  `,
  styles: `
    .gasto { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; margin: 6px 0 12px; }
    .desc { font-size: 1.05rem; }
    .valor { font-size: 1.15rem; grid-row: span 2; align-self: center; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .chip app-icon { margin-right: 4px; }
    .check { margin-top: 10px; }
    .bts { display: grid; grid-template-columns: 1fr 2fr; gap: 8px; margin-top: 14px; }
  `,
})
export class Revisar {
  readonly open = model(false);
  protected s = inject(Store);
  private auth = inject(Auth);
  private toast = inject(Toast);

  protected fila = signal<Gasto[]>([]);
  protected i = signal(0);
  protected atual = computed(() => this.fila()[this.i()] ?? null);
  protected cat = signal<string | null>(null);
  protected sempre = signal(false);
  protected salvando = signal(false);

  /** as mais usadas no mês, com a sugerida primeiro */
  protected opcoes = computed(() => {
    const uso = new Map<string, number>();
    for (const g of this.s.gastosMes()) if (g.categoria_id) uso.set(g.categoria_id, (uso.get(g.categoria_id) ?? 0) + 1);
    const g = this.atual();
    const sug = g ? this.sugestao(g) : null;
    const ids = [...new Set([...(sug ? [sug] : []), ...[...uso.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)])].slice(0, 8);
    return ids.map((id) => this.s.catMap().get(id)).filter((c) => !!c);
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        const rev = lerRevisao(this.s.carteiraId()!);
        this.fila.set(paraRevisar(this.s.gastosMes(), this.auth.user()?.id, rev));
        this.i.set(0);
        this.preparar();
      });
    });
  }

  private sugestao(g: Gasto) {
    const d = normalizar(g.descricao);
    return (
      g.categoria_id ??
      regraPara(g.descricao, this.s.regras())?.categoria_id ??
      this.s.recentes().find((r) => r.categoria_id && normalizar(r.descricao) === d)?.categoria_id ??
      palpiteCategoria(g.descricao, this.s.catGasto())
    );
  }

  private preparar() {
    const g = this.atual();
    this.cat.set(g ? this.sugestao(g) : null);
    this.sempre.set(false);
  }

  protected termo = (g: Gasto) => normalizar(g.descricao);

  private marcar(id: string) {
    const k = `${VISTOS}.${this.s.carteiraId()}`;
    const rev = lerRevisao(this.s.carteiraId()!);
    localStorage.setItem(k, JSON.stringify({ ...rev, vistos: [...rev.vistos, id].slice(-500) }));
  }

  proximo() {
    const g = this.atual();
    if (g) this.marcar(g.id);
    this.i.update((i) => i + 1);
    this.preparar();
  }

  async confirmar(g: Gasto) {
    this.salvando.set(true);
    try {
      const cat = this.cat();
      if (cat !== g.categoria_id) await this.s.atualizarGastos([g.id], { categoria_id: cat });
      if (cat && this.sempre()) {
        await q(supabase.from('regras').upsert({ carteira_id: this.s.carteiraId(), termo: this.termo(g), categoria_id: cat }, { onConflict: 'carteira_id,termo' }));
        await this.s.recarregar('regras');
      }
      this.proximo();
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  forma(g: Gasto) {
    if (g.forma === 'cartao') return this.s.cartoes().find((c) => c.id === g.cartao_id)?.nome ?? 'Cartão';
    if (g.forma === 'beneficio') return this.s.beneficios().find((b) => b.id === g.beneficio_id)?.nome ?? 'Benefício';
    return 'À vista';
  }

  quem(g: Gasto) {
    return this.s.membros().length > 1 && g.criado_por ? ' · ' + (this.s.membroMap().get(g.criado_por) ?? '') : '';
  }
}

/** Quantos esperam revisão no mês (badge em Gastos); lê o aparelho a cada mudança dos gastos */
export function contarRevisao(s: Store, eu: string | undefined) {
  const id = s.carteiraId();
  return id ? paraRevisar(s.gastosMes(), eu, lerRevisao(id)).length : 0;
}
