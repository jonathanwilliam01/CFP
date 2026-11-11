import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { iso, nomeMes } from '../core/datas';
import { BrlPipe, DiaPipe } from '../core/formato';
import { Atividade } from '../core/models';
import { Store } from '../core/store';
import { supabase } from '../core/supabase';
import { Autor } from '../shared/autor';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';

const PAGINA = 50;

const TIPOS = [
  { id: 'gastos', r: 'Gastos', tabelas: ['gastos', 'parcelamentos'] },
  { id: 'entradas', r: 'Entradas', tabelas: ['entradas'] },
  { id: 'contas', r: 'Contas', tabelas: ['pagamentos', 'recorrencias', 'cartoes'] },
  { id: 'cofrinhos', r: 'Cofrinhos', tabelas: ['cofrinhos', 'cofrinho_movs'] },
  { id: 'metas', r: 'Metas', tabelas: ['metas', 'meta_checkins', 'fechamentos'] },
  { id: 'outros', r: 'Outros', tabelas: [] as string[] },
] as const;
const CONHECIDAS = TIPOS.flatMap((t) => t.tabelas);

/** artigo + nome no singular e plural de cada tabela */
const NOMES: Record<string, [string, string]> = {
  gastos: ['o gasto', 'gastos'], parcelamentos: ['a compra parcelada', 'compras parceladas'], entradas: ['a entrada', 'entradas'],
  pagamentos: ['o pagamento de', 'pagamentos'], recorrencias: ['a conta fixa', 'contas fixas'], cartoes: ['o cartão', 'cartões'],
  cofrinhos: ['o cofrinho', 'cofrinhos'], cofrinho_movs: ['uma movimentação de', 'movimentações de cofrinho'], metas: ['a meta', 'metas'],
  meta_checkins: ['um check-in', 'check-ins'], fechamentos: ['o combinado', 'combinados'], orcamentos: ['o orçamento', 'orçamentos'],
  desejos: ['o desejo', 'desejos'], dividas: ['a dívida', 'dívidas'], receber: ['o valor a receber', 'valores a receber'], acertos: ['um acerto', 'acertos'],
};
const VERBOS = { insert: 'criou', update: 'editou', delete: 'excluiu' } as const;
const LANCOU = ['gastos', 'parcelamentos', 'entradas'];

interface Frase { a: string; v: number | null; b: string }

/** Feed do que cada um fez na carteira (tabela atividades, migration 045) */
@Component({
  imports: [BrlPipe, DiaPipe, Icon, Autor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Histórico</h1></div>

      @if (semTabela()) {
        <div class="card empty"><app-icon class="big" name="history" [size]="40" /><p>O histórico ainda não está disponível nesta versão do banco. Assim que for atualizado, o que cada um fizer aparece aqui.</p></div>
      } @else {
        @if (s.membros().length > 1) {
          <div class="chips">
            <button type="button" class="chip" [class.on]="!pessoa()" (click)="pessoa.set(null)">Todos</button>
            @for (m of s.membros(); track m.user_id) {
              <button type="button" class="chip" [class.on]="pessoa() === m.user_id" (click)="pessoa.set(m.user_id)">{{ m.nome }}</button>
            }
          </div>
        }
        <div class="chips">
          <button type="button" class="chip" [class.on]="!tipo()" (click)="tipo.set(null)">Tudo</button>
          @for (t of tipos; track t.id) {
            <button type="button" class="chip" [class.on]="tipo() === t.id" (click)="tipo.set(t.id)">{{ t.r }}</button>
          }
        </div>

        @for (g of dias(); track g.dia) {
          <h2 class="day-label">{{ g.dia | dia }}</h2>
          <div class="card list">
            @for (l of g.itens; track l.a.id) {
              <div class="lin">
                @if (l.a.user_id) { <app-autor [id]="l.a.user_id" [size]="26" /> } @else { <span class="sis"><app-icon name="smart_toy" [size]="16" /></span> }
                <span class="grow small"><b>{{ l.nome }}</b> {{ l.f.a }}@if (l.f.v !== null) {<span class="num">{{ l.f.v | brl }}</span>}{{ l.f.b }}</span>
                <span class="hora small muted">{{ l.hora }}</span>
              </div>
            }
          </div>
        } @empty {
          @if (!carregando()) { <div class="card empty"><app-icon class="big" name="history" [size]="40" /><p>Nada por aqui ainda.</p></div> }
        }
        @if (carregando()) {
          <p class="small muted centro">Carregando...</p>
        } @else if (temMais()) {
          <button class="btn ghost block" type="button" (click)="carregar(false)">Carregar mais</button>
        }
      }
    </div>
  `,
  styles: `
    .chips { margin-bottom: 8px; }
    .lin { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line); }
    .lin:last-child { border-bottom: 0; }
    .grow { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .hora { flex-shrink: 0; font-variant-numeric: tabular-nums; }
    .sis { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--card-2); color: var(--ink-2); flex-shrink: 0; }
    .centro { text-align: center; }
  `,
})
export default class Historico {
  protected s = inject(Store);
  private toast = inject(Toast);
  protected tipos = TIPOS;
  protected pessoa = signal<string | null>(null);
  protected tipo = signal<string | null>(null);
  private lista = signal<Atividade[]>([]);
  protected carregando = signal(false);
  protected temMais = signal(false);
  protected semTabela = signal(false);
  private req = 0;

  protected dias = computed(() => {
    const grupos: { dia: string; itens: { a: Atividade; nome: string; hora: string; f: Frase }[] }[] = [];
    for (const a of this.lista()) {
      const d = new Date(a.criado_em);
      const dia = iso(d);
      if (grupos.at(-1)?.dia !== dia) grupos.push({ dia, itens: [] });
      grupos.at(-1)!.itens.push({
        a,
        nome: a.user_id ? this.s.nomeAutor(a.user_id) : 'Sistema',
        hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        f: this.frase(a),
      });
    }
    return grupos;
  });

  constructor() {
    effect(() => {
      this.s.carteiraId();
      this.pessoa();
      this.tipo();
      this.s.mudou();
      untracked(() => this.carregar(true));
    });
  }

  async carregar(doZero: boolean) {
    const id = this.s.carteiraId();
    if (!id) return;
    const r = ++this.req;
    const ini = doZero ? 0 : this.lista().length;
    this.carregando.set(true);
    let c = supabase.from('atividades').select('*').eq('carteira_id', id);
    const p = this.pessoa();
    if (p) c = c.eq('user_id', p);
    const t = TIPOS.find((x) => x.id === this.tipo());
    if (t) c = t.id === 'outros' ? c.not('tabela', 'in', `(${CONHECIDAS.join(',')})`) : c.in('tabela', [...t.tabelas]);
    const { data, error } = await c.order('criado_em', { ascending: false }).order('id', { ascending: false }).range(ini, ini + PAGINA - 1);
    if (r !== this.req) return;
    this.carregando.set(false);
    if (error) {
      if (['42P01', 'PGRST205'].includes(error.code) || /could not find the table|does not exist/i.test(error.message)) this.semTabela.set(true);
      else this.toast.erro(error.message);
      return;
    }
    const novos = (data ?? []) as Atividade[];
    this.lista.update((l) => (doZero ? novos : [...l, ...novos]));
    this.temMais.set(novos.length === PAGINA);
  }

  /** Frase da linha: "lançou 5 gastos · R$ 120,00", "pagou Luz · R$ 180,00", "guardou R$ 200,00 em Reserva" */
  private frase(a: Atividade): Frase {
    const v = a.valor;
    const desc = a.descricao?.trim() || '';
    const lote = a.qtd > 1;
    const [um, varios] = NOMES[a.tabela] ?? ['um registro', 'registros'];
    const sep = (txt: string): Frase => (v != null ? { a: txt + ' · ', v: Math.abs(v), b: '' } : { a: txt, v: null, b: '' });
    const alvo = lote ? `${a.qtd} ${varios}` : a.tabela === 'gastos' && !desc ? 'um gasto do dinheiro livre' : `${um}${desc ? ' ' + desc : ''}`;

    if (a.tabela === 'cofrinho_movs' && a.acao === 'insert' && !lote && v != null)
      return { a: v >= 0 ? 'guardou ' : 'retirou ', v: Math.abs(v), b: desc ? (v >= 0 ? ' em ' : ' de ') + desc : '' };
    if (a.tabela === 'pagamentos' && !lote) {
      const nome = desc || 'uma conta';
      if (a.acao === 'insert') return sep(`pagou ${nome}`);
      if (a.acao === 'delete') return sep(`desfez o pagamento de ${nome}`);
      return sep(`editou o pagamento de ${nome}`);
    }
    if (a.tabela === 'meta_checkins' && a.acao === 'insert' && !lote) {
      const meta = this.metaDoCheckin(a.ref_id);
      return sep(meta ? `fez check-in em ${meta}` : 'fez um check-in');
    }
    if (a.tabela === 'fechamentos' && !lote) {
      const mes = this.s.fechamentos().find((f) => f.id === a.ref_id)?.mes;
      const txt = `o combinado ${mes ? 'de ' + nomeMes(mes).split(' ')[0] : 'do mês'}`;
      return sep(`${a.acao === 'delete' ? 'apagou' : a.acao === 'insert' ? 'registrou' : 'atualizou'} ${txt}`);
    }
    const verbo = a.acao === 'insert' && LANCOU.includes(a.tabela) ? 'lançou' : VERBOS[a.acao];
    return sep(`${verbo} ${alvo}`);
  }

  private metaDoCheckin(id: string | null) {
    const metaId = this.s.metaCheckins().find((c) => c.id === id)?.meta_id;
    return metaId ? this.s.metas().find((m) => m.id === metaId)?.titulo : undefined;
  }
}
