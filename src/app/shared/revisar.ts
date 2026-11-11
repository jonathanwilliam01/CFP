import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '../core/auth';
import { palpiteCategoria } from '../core/extrato';
import { BrlPipe, DiaPipe } from '../core/formato';
import { Gasto } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { normalizar, regraPara } from '../core/texto';
import { Autor } from './autor';
import { Icon } from './icon';
import { ColunaQuadro, MoverQuadro, Quadro } from './quadro';
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
  imports: [FormsModule, BrlPipe, DiaPipe, Icon, Sheet, Quadro, Autor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet [(open)]="open" titulo="Revisar gastos">
      @if (quadro()) {
        <div class="topo"><span class="small muted">Arraste para "Revisado" ou toque para revisar um</span>
          <button type="button" class="btn ghost sm" (click)="quadro.set(false)"><app-icon name="view_agenda" [size]="16" />Um por vez</button></div>
        <app-quadro [colunas]="colunas()" [chave]="chave" vazio="Nenhum" (mover)="mover($event)">
          <ng-template #cartao let-g>
            <button type="button" class="qc" (click)="revisarUm(g)">
              <span class="ql"><b class="qt">{{ g.descricao }}</b><b class="num">{{ g.valor | brl }}</b></span>
              <span class="ql small muted"><app-autor [id]="g.criado_por" [size]="16" /><span class="qt">{{ g.data | dia }} · {{ s.catMap().get(g.categoria_id ?? '')?.nome ?? 'Sem categoria' }}</span></span>
            </button>
          </ng-template>
        </app-quadro>
      } @else if (atual(); as g) {
        <div class="topo"><span class="small muted">{{ i() + 1 }} de {{ fila().length }}</span>
          <button type="button" class="btn ghost sm" (click)="quadro.set(true)"><app-icon name="view_kanban" [size]="16" />Ver em quadro</button></div>
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
        <div class="empty"><app-icon class="big" name="task_alt" [size]="40" />Tudo revisado.
          @if (fila().length) { <button type="button" class="btn ghost sm" (click)="quadro.set(true)"><app-icon name="view_kanban" [size]="16" />Ver em quadro</button> }</div>
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
    .topo { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .qc { display: flex; flex-direction: column; gap: 4px; width: 100%; padding: 9px 0; background: none; border: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; }
    .ql { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .qt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  protected quadro = signal(false);
  /** marcados como vistos nesta abertura */
  private vistosAgora = signal(new Set<string>());
  protected chave = (g: Gasto) => g.id;

  /** Pendentes por motivo (dados atuais do gasto) e os revisados nesta abertura */
  protected colunas = computed<ColunaQuadro<Gasto>[]>(() => {
    const mapa = new Map(this.s.gastosMes().map((g) => [g.id, g]));
    const vistos = this.vistosAgora();
    const sem: Gasto[] = [], outro: Gasto[] = [], feitos: Gasto[] = [];
    for (const f of this.fila()) {
      const g = mapa.get(f.id);
      if (g) (vistos.has(g.id) ? feitos : g.categoria_id ? outro : sem).push(g);
    }
    return [
      { id: 'sem', titulo: 'Sem categoria', icone: 'help', cor: 'var(--warn)', aceita: false, itens: sem },
      { id: 'outro', titulo: 'Do outro', icone: 'group', cor: 'var(--info)', aceita: false, itens: outro },
      { id: 'revisado', titulo: 'Revisado', icone: 'task_alt', cor: 'var(--ok)', itens: feitos },
    ];
  });

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
        this.fila.set(paraRevisar(this.s.gastosMes(), this.auth.user()?.id, rev).filter((g) => !this.s.livreDeOutro(g)));
        this.i.set(0);
        this.quadro.set(false);
        this.vistosAgora.set(new Set());
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
    if (!rev.vistos.includes(id)) localStorage.setItem(k, JSON.stringify({ ...rev, vistos: [...rev.vistos, id].slice(-500) }));
    this.vistosAgora.update((v) => new Set(v).add(id));
  }

  /** avança pulando os já marcados no quadro */
  proximo() {
    const g = this.atual();
    if (g) this.marcar(g.id);
    let i = this.i() + 1;
    while (i < this.fila().length && this.vistosAgora().has(this.fila()[i].id)) i++;
    this.i.set(i);
    this.preparar();
  }

  protected mover({ item, para }: MoverQuadro<Gasto>) {
    if (para === 'revisado') this.marcar(item.id);
  }

  /** do quadro para o um-por-vez, já no gasto tocado */
  protected revisarUm(g: Gasto) {
    const j = this.fila().findIndex((x) => x.id === g.id);
    const i = j >= 0 && j < this.i() ? this.i() - 1 : this.i();
    const l = this.fila().filter((x) => x.id !== g.id);
    l.splice(i, 0, g);
    this.fila.set(l);
    this.i.set(i);
    this.preparar();
    this.quadro.set(false);
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
    return this.s.membros().length > 1 && g.criado_por ? ' · ' + this.s.nomeAutor(g.criado_por) : '';
  }
}

/** Quantos esperam revisão no mês (badge em Gastos); lê o aparelho a cada mudança dos gastos */
export function contarRevisao(s: Store, eu: string | undefined) {
  const id = s.carteiraId();
  return id ? paraRevisar(s.gastosMes(), eu, lerRevisao(id)).filter((g) => !s.livreDeOutro(g)).length : 0;
}
