import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { mesFatura, nomeMes } from '../core/datas';
import { BrlPipe, DiaPipe, soma } from '../core/formato';
import { Cartao } from '../core/models';
import { ItemFatura, lerNubank, palpiteCategoria } from '../core/nubank';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';

interface Linha extends ItemFatura {
  ok: boolean;
  categoria_id: string | null;
  /** já existe gasto com o mesmo valor na mesma fatura */
  dup: boolean;
  /** parcela: lançar também as próximas */
  proximas: boolean;
}

type Memoria = Record<string, { descricao: string; categoria_id: string | null }>;
const MEMORIA = 'cfp.nubank';

@Component({
  imports: [FormsModule, RouterLink, BrlPipe, DiaPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Importar fatura Nubank</h1></div>

      <section class="card intro">
        <p class="small muted">
          Exporte a fatura do cartão em CSV no app ou site do Nubank e escolha o arquivo. Pagamentos da fatura ficam de fora
          e o que já foi lançado no CFP (mesmo valor na mesma fatura) vem desmarcado.
        </p>
        <label class="btn ghost block">
          <app-icon name="upload_file" [size]="20" />{{ arquivo() || 'Escolher arquivo CSV' }}
          <input type="file" accept=".csv,text/csv" hidden (change)="abrir($event)" />
        </label>
      </section>

      @if (linhas().length) {
        <div class="field">
          <span>Cartão</span>
          @if (s.cartoesAtivos().length) {
            <div class="chips wrap">
              @for (c of s.cartoesAtivos(); track c.id) {
                <button type="button" class="chip" [class.on]="cartao()?.id === c.id" (click)="escolher(c)">
                  <i class="dot" [style.background]="c.cor"></i>{{ c.nome }}
                </button>
              }
            </div>
          } @else {
            <p class="small muted">Nenhum cartão cadastrado. <a routerLink="/cartoes">Cadastre o cartão</a> antes de importar.</p>
          }
          @if (faturas(); as f) { <p class="small muted">Fatura de {{ f }}</p> }
        </div>

        <div class="total card">
          <span class="muted small">
            {{ marcadas().length }} de {{ linhas().length }} marcados
            @if (ignorados()) { · {{ ignorados() }} pagamento(s)/estorno(s) ignorado(s) }
          </span>
          <b class="num">{{ total() | brl }}</b>
        </div>

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
                  <span class="s">{{ x.data | dia }} · {{ x.titulo }}</span>
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
                @if (x.parcela && x.parcelas && x.parcela < x.parcelas) {
                  <label class="check small">
                    <input type="checkbox" [checked]="x.proximas" (change)="alterar($index, 'proximas', $any($event.target).checked)" />
                    Parcela {{ x.parcela }}/{{ x.parcelas }}: lançar também as próximas {{ x.parcelas - x.parcela }}
                  </label>
                }
              </div>
            </div>
          }
        </section>

        <button class="btn block" type="button" [disabled]="salvando() || !marcadas().length || !cartao()" (click)="importar()">
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

  protected arquivo = signal('');
  protected linhas = signal<Linha[]>([]);
  protected ignorados = signal(0);
  protected salvando = signal(false);
  private cartaoId = signal<string | null>(null);

  protected cartao = computed(() => {
    const l = this.s.cartoesAtivos();
    return l.find((c) => c.id === this.cartaoId()) ?? l.find((c) => /\bnu/i.test(c.nome)) ?? this.s.cartaoPadrao() ?? l.at(0) ?? null;
  });

  protected marcadas = computed(() => this.linhas().filter((x) => x.ok));
  protected total = computed(() => soma(this.marcadas(), (x) => x.valor));

  /** Mês(es) de fatura em que os gastos caem pelo fechamento do cartão escolhido */
  protected faturas = computed(() => {
    const c = this.cartao();
    if (!c) return '';
    return [...new Set(this.linhas().map((x) => this.fatura(x, c)))].sort().map((m) => nomeMes(m)).join(', ');
  });

  private fatura(x: ItemFatura, c: Cartao) {
    return mesFatura(x.data, c.fechamento_dia, c.vencimento_dia);
  }

  async abrir(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const { itens, ignorados } = lerNubank(await f.text());
      if (!itens.length) throw new Error('Nenhum gasto encontrado no arquivo');
      const mem: Memoria = JSON.parse(localStorage.getItem(MEMORIA) ?? '{}');
      const historico = new Map(this.s.recentes().map((r) => [r.descricao.trim().toLowerCase(), r.categoria_id]));
      this.linhas.set(
        itens.map((x) => {
          const m = mem[x.chave];
          const descricao = m?.descricao ?? x.descricao;
          const categoria_id = m ? m.categoria_id : (historico.get(descricao.toLowerCase()) ?? palpiteCategoria(x.titulo, this.s.catGasto()));
          return { ...x, descricao, categoria_id, ok: true, dup: false, proximas: true };
        }),
      );
      this.ignorados.set(ignorados);
      this.arquivo.set(f.name);
      await this.checar();
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async escolher(c: Cartao) {
    this.cartaoId.set(c.id);
    await this.checar();
  }

  /** Desmarca o que já tem gasto com o mesmo valor na mesma fatura do cartão */
  private async checar() {
    const c = this.cartao();
    const linhas = this.linhas();
    if (!c || !linhas.length) return;
    try {
      const existentes = await q<{ valor: number; fatura_mes: string }[]>(
        supabase.from('gastos').select('valor, fatura_mes').eq('cartao_id', c.id).in('fatura_mes', [...new Set(linhas.map((x) => this.fatura(x, c)))]),
      );
      this.linhas.update((l) =>
        l.map((x) => {
          const fm = this.fatura(x, c);
          const i = existentes.findIndex((e) => e.fatura_mes === fm && Math.abs(e.valor - x.valor) < 0.005);
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

  async importar() {
    const c = this.cartao();
    const sel = this.marcadas();
    if (!c || !sel.length) return;
    const parcelado = (x: Linha) => !!(x.parcela && x.parcelas && x.parcela < x.parcelas && x.proximas);
    this.salvando.set(true);
    try {
      const avulsos = sel.filter((x) => !parcelado(x));
      if (avulsos.length)
        await q(
          supabase.from('gastos').insert(
            avulsos.map((x) => ({
              carteira_id: this.s.carteiraId(),
              descricao: (x.descricao.trim() || x.titulo) + (x.parcela ? ` (${x.parcela}/${x.parcelas})` : ''),
              categoria_id: x.categoria_id,
              valor: x.valor,
              data: x.data,
              forma: 'cartao',
              cartao_id: c.id,
            })),
          ),
        );
      for (const x of sel.filter(parcelado))
        await q(supabase.rpc('criar_parcelamento', {
          p_carteira: this.s.carteiraId(), p_descricao: x.descricao.trim() || x.titulo, p_categoria: x.categoria_id, p_cartao: c.id,
          p_valor_parcela: x.valor, p_num: x.parcelas, p_primeira: x.data, p_ini: x.parcela,
        }));
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
