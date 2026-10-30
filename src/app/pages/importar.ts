import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { inicioFatura, mesFatura, nomeMes } from '../core/datas';
import { ItemExtrato, Origem, lerExtrato, palpiteCategoria } from '../core/extrato';
import { BrlPipe, DiaPipe, soma } from '../core/formato';
import { Store } from '../core/store';
import { lerTags } from '../core/texto';
import { q, supabase } from '../core/supabase';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';

interface Linha extends ItemExtrato {
  ok: boolean;
  categoria_id: string | null;
  /** já existe gasto com o mesmo valor na mesma fatura (cartão) ou no mesmo dia (débito) */
  dup: boolean;
  /** parcela: lançar também as próximas */
  proximas: boolean;
}

type Memoria = Record<string, { descricao: string; categoria_id: string | null }>;
const MEMORIA = 'cfp.nubank';
const DEBITO = 'debito';

@Component({
  imports: [FormsModule, RouterLink, BrlPipe, DiaPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Importar fatura ou extrato</h1></div>

      <section class="card intro">
        <p class="small muted">
          Fatura do cartão ou extrato da conta em CSV (Nubank e outros bancos) ou OFX. Pagamentos, estornos e créditos ficam de fora
          e o que já foi lançado no CFP vem desmarcado.
        </p>
        <label class="btn ghost block">
          <app-icon name="upload_file" [size]="20" />{{ arquivo() || 'Escolher arquivo CSV ou OFX' }}
          <input type="file" accept=".csv,.ofx,text/csv,application/x-ofx" hidden (change)="abrir($event)" />
        </label>
      </section>

      @if (linhas().length) {
        <div class="field">
          <span>Lançar como</span>
          <div class="chips wrap">
            @for (c of s.cartoesAtivos(); track c.id) {
              <button type="button" class="chip" [class.on]="destino() === c.id" (click)="escolher(c.id)">
                <i class="dot" [style.background]="c.cor"></i>{{ c.nome }}
              </button>
            }
            <button type="button" class="chip" [class.on]="destino() === debito" (click)="escolher(debito)">
              <app-icon name="payments" [size]="18" />Pix/Débito
            </button>
          </div>
          @if (!s.cartoesAtivos().length) {
            <p class="small muted">Para fatura de cartão, <a routerLink="/cartoes">cadastre o cartão</a> antes.</p>
          }
          @if (faturas(); as f) { <p class="small muted">Fatura de {{ f }}</p> }
        </div>

        <div class="total card">
          <span class="muted small">
            {{ marcadas().length }} de {{ linhas().length }} marcados
            @if (ignorados()) { · {{ ignorados() }} pagamento(s)/crédito(s) ignorado(s) }
          </span>
          <b class="num">{{ total() | brl }}</b>
        </div>

        <label class="field">
          <span>Marcadores para todos (opcional)</span>
          <input name="tags" autocomplete="off" placeholder="Ex.: viagem, reforma" [(ngModel)]="tags" />
        </label>

        <div class="chips">
          <button type="button" class="chip" (click)="marcar(true)">Marcar todos</button>
          <button type="button" class="chip" (click)="marcar(false)">Desmarcar todos</button>
        </div>

        <section class="card list">
          @for (x of linhas(); track $index) {
            <div class="item" [class.off]="!x.ok">
              <input type="checkbox" [checked]="x.ok" (change)="alterar($index, 'ok', $any($event.target).checked)" [attr.aria-label]="'Importar ' + x.titulo" />
              <div class="grow">
                <div class="cab">
                  <span class="s">{{ dataDe(x) | dia }} · {{ x.titulo }}</span>
                  <b class="num">{{ x.valor | brl }}</b>
                </div>
                @if (x.dup) { <span class="badge alerta">Parece já lançado</span> }
                <div class="campos">
                  <input [ngModel]="x.descricao" (ngModelChange)="alterar($index, 'descricao', $event)" aria-label="Descrição" />
                  <select [ngModel]="x.categoria_id" (ngModelChange)="alterar($index, 'categoria_id', $event)" aria-label="Categoria">
                    <option [ngValue]="null">Sem categoria</option>
                    @for (c of s.catGasto(); track c.id) { <option [ngValue]="c.id">{{ c.nome }}</option> }
                  </select>
                </div>
                @if (noCartao() && x.parcela && x.parcelas && x.parcela < x.parcelas) {
                  <label class="check small">
                    <input type="checkbox" [checked]="x.proximas" (change)="alterar($index, 'proximas', $any($event.target).checked)" />
                    Parcela {{ x.parcela }}/{{ x.parcelas }}: lançar também as próximas {{ x.parcelas - x.parcela }}
                  </label>
                }
              </div>
            </div>
          }
        </section>

        <button class="btn block" type="button" [disabled]="salvando() || !marcadas().length || !destino()" (click)="importar()">
          Importar {{ marcadas().length }} gasto(s)
        </button>
      }
    </div>
  `,
  styles: `
    .intro { display: flex; flex-direction: column; gap: 12px; }
    .total { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 12px 14px; }
    .total b { font-size: 1.15rem; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .item { display: flex; gap: 10px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid var(--line); }
    .item:last-child { border-bottom: 0; }
    .item > input { margin-top: 2px; }
    .off { opacity: 0.5; }
    .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .cab { display: flex; justify-content: space-between; gap: 8px; width: 100%; }
    .cab .s { font-size: 0.8rem; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .campos { display: grid; grid-template-columns: 1fr; gap: 6px; width: 100%; }
    .campos input, .campos select { min-height: 38px; padding: 7px 10px; }
    @media (min-width: 720px) { .campos { grid-template-columns: 1fr 200px; } }
  `,
})
export default class Importar {
  protected s = inject(Store);
  private toast = inject(Toast);

  protected debito = DEBITO;
  protected arquivo = signal('');
  protected linhas = signal<Linha[]>([]);
  protected ignorados = signal(0);
  protected salvando = signal(false);
  tags = '';
  private origem = signal<Origem>('nubank');
  private escolhido = signal<string | null>(null);

  /** Cartão (id) ou débito: escolha do usuário; senão extrato de conta vai para débito e fatura para o cartão Nu/padrão */
  protected destino = computed(() => {
    const l = this.s.cartoesAtivos();
    const e = this.escolhido();
    if (e === DEBITO || l.some((c) => c.id === e)) return e;
    if (this.origem() === 'ofx-conta' || this.origem() === 'csv') return DEBITO;
    return (l.find((c) => /\bnu/i.test(c.nome)) ?? this.s.cartaoPadrao() ?? l.at(0))?.id ?? DEBITO;
  });
  protected cartao = computed(() => this.s.cartoesAtivos().find((c) => c.id === this.destino()) ?? null);
  protected noCartao = computed(() => !!this.cartao());

  protected marcadas = computed(() => this.linhas().filter((x) => x.ok));
  protected total = computed(() => soma(this.marcadas(), (x) => x.valor));
  /** Mês(es) de fatura em que os gastos caem pelo fechamento do cartão escolhido */
  protected faturas = computed(() => {
    const c = this.cartao();
    if (!c) return '';
    return [...new Set(this.linhas().map((x) => mesFatura(this.dataDe(x), c.fechamento_dia, c.vencimento_dia)))].sort().map((m) => nomeMes(m)).join(', ');
  });
  /** Fatura do arquivo: a mais comum entre as compras novas (sem parcela ou 1ª parcela) */
  private alvo = computed(() => {
    const c = this.cartao();
    if (!c) return null;
    const n = new Map<string, number>();
    for (const x of this.linhas()) {
      if ((x.parcela ?? 1) > 1) continue;
      const m = mesFatura(x.data, c.fechamento_dia, c.vencimento_dia);
      n.set(m, (n.get(m) ?? 0) + 1);
    }
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  });

  /** Nubank data as parcelas seguintes no último dia do mês anterior, que pode cair na fatura passada: vão para o início da fatura do arquivo */
  protected dataDe(x: ItemExtrato) {
    const c = this.cartao();
    const alvo = this.alvo();
    if (!c || !alvo || (x.parcela ?? 1) === 1 || mesFatura(x.data, c.fechamento_dia, c.vencimento_dia) >= alvo) return x.data;
    return inicioFatura(alvo, c.fechamento_dia, c.vencimento_dia);
  }

  async abrir(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const { itens, ignorados, origem } = lerExtrato(await f.text());
      if (!itens.length) throw new Error('Nenhum gasto encontrado no arquivo');
      const mem: Memoria = JSON.parse(localStorage.getItem(MEMORIA) ?? '{}');
      const historico = new Map(this.s.recentes().map((r) => [r.descricao.trim().toLowerCase(), r.categoria_id]));
      this.linhas.set(
        itens.map((x) => {
          const m = mem[x.chave];
          const descricao = m?.descricao ?? x.descricao;
          const categoria_id = m ? m.categoria_id : (historico.get(descricao.toLowerCase()) ?? palpiteCategoria(x.descricao, this.s.catGasto()) ?? palpiteCategoria(x.titulo, this.s.catGasto()));
          return { ...x, descricao, categoria_id, ok: true, dup: false, proximas: true };
        }),
      );
      this.ignorados.set(ignorados);
      this.origem.set(origem);
      this.escolhido.set(null);
      this.arquivo.set(f.name);
      await this.checar();
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async escolher(id: string) {
    this.escolhido.set(id);
    await this.checar();
  }

  /** Desmarca o que já tem gasto com o mesmo valor: mesma fatura no cartão, mesmo dia no débito */
  private async checar() {
    const c = this.cartao();
    const linhas = this.linhas();
    if (!linhas.length) return;
    const chave = (x: ItemExtrato) => (c ? mesFatura(this.dataDe(x), c.fechamento_dia, c.vencimento_dia) : x.data);
    try {
      const chaves = [...new Set(linhas.map(chave))];
      const existentes = c
        ? (await q<{ valor: number; fatura_mes: string }[]>(
            supabase.from('gastos').select('valor, fatura_mes').eq('cartao_id', c.id).in('fatura_mes', chaves),
          )).map((e) => ({ valor: e.valor, k: e.fatura_mes }))
        : (await q<{ valor: number; data: string }[]>(
            supabase.from('gastos').select('valor, data').eq('carteira_id', this.s.carteiraId()!).eq('forma', DEBITO).in('data', chaves),
          )).map((e) => ({ valor: e.valor, k: e.data }));
      this.linhas.update((l) =>
        l.map((x) => {
          const i = existentes.findIndex((e) => e.k === chave(x) && Math.abs(e.valor - x.valor) < 0.005);
          if (i >= 0) existentes.splice(i, 1);
          return { ...x, dup: i >= 0, ok: i < 0 };
        }),
      );
    } catch (e) {
      this.toast.erro(e);
    }
  }

  alterar<K extends keyof Linha>(i: number, k: K, v: Linha[K]) {
    this.linhas.update((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  }

  marcar(ok: boolean) {
    this.linhas.update((l) => l.map((x) => ({ ...x, ok })));
  }

  /** Tudo numa transação (RPC importar_gastos): ou entra a importação inteira ou nada */
  async importar() {
    const c = this.cartao();
    const sel = this.marcadas();
    if (!sel.length) return;
    this.salvando.set(true);
    const tags = lerTags(this.tags);
    try {
      const itens = sel.map((x) => {
        const parcelar = !!(c && x.parcela && x.parcelas && x.parcela < x.parcelas && x.proximas);
        const desc = x.descricao.trim() || x.titulo;
        return {
          descricao: parcelar || !x.parcela ? desc : `${desc} (${x.parcela}/${x.parcelas})`,
          categoria_id: x.categoria_id,
          valor: x.valor,
          data: this.dataDe(x),
          forma: c ? 'cartao' : DEBITO,
          cartao_id: c?.id ?? null,
          parcelar,
          parcela: x.parcela,
          parcelas: x.parcelas,
          tags,
        };
      });
      await q(supabase.rpc('importar_gastos', { p_carteira: this.s.carteiraId(), p_itens: itens }));
      this.lembrar(sel);
      await this.s.depois('gastos');
      this.toast.ok(`${sel.length} gasto(s) importado(s)`);
      this.linhas.set([]);
      this.arquivo.set('');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  /** Guarda descrição e categoria escolhidas para as próximas importações */
  private lembrar(sel: Linha[]) {
    const mem: Memoria = JSON.parse(localStorage.getItem(MEMORIA) ?? '{}');
    for (const x of sel) {
      delete mem[x.chave];
      mem[x.chave] = { descricao: x.descricao.trim() || x.titulo, categoria_id: x.categoria_id };
    }
    localStorage.setItem(MEMORIA, JSON.stringify(Object.fromEntries(Object.entries(mem).slice(-500))));
  }
}
