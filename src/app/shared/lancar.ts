import { ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addDias, hoje, mesFatura } from '../core/datas';
import { BrlPipe, MesPipe, moeda, parseValor } from '../core/formato';
import { Entrada, Forma, Gasto } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Icon } from './icon';
import { Sheet } from './sheet';
import { Toast } from './toast';

export type Modo = 'gasto' | 'entrada' | 'parcelado';

/** Abre o painel de lançamento rápido de qualquer tela */
@Injectable({ providedIn: 'root' })
export class Lancar {
  readonly aberto = signal(false);
  readonly modo = signal<Modo>('gasto');
  readonly gasto = signal<Gasto | null>(null);
  readonly entrada = signal<Entrada | null>(null);

  novo(modo: Modo = 'gasto') {
    this.gasto.set(null);
    this.entrada.set(null);
    this.modo.set(modo);
    this.aberto.set(true);
  }

  editarGasto(g: Gasto) {
    this.entrada.set(null);
    this.gasto.set(g);
    this.modo.set('gasto');
    this.aberto.set(true);
  }

  editarEntrada(e: Entrada) {
    this.gasto.set(null);
    this.entrada.set(e);
    this.modo.set('entrada');
    this.aberto.set(true);
  }
}

interface FormLanc {
  valor: string;
  descricao: string;
  categoria_id: string | null;
  data: string;
  pagamento: string;
  parcelas: number;
  valorEhTotal: boolean;
}

@Component({
  selector: 'app-lancar',
  imports: [Sheet, FormsModule, BrlPipe, MesPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lancar.html',
  styleUrl: './lancar.scss',
})
export class LancarSheet {
  protected l = inject(Lancar);
  protected s = inject(Store);
  private toast = inject(Toast);

  protected f = signal<FormLanc>(this.vazio());
  protected salvando = signal(false);
  protected hoje = hoje();
  protected ontem = addDias(hoje(), -1);

  protected editando = computed(() => !!(this.l.gasto() || this.l.entrada()));
  protected cats = computed(() => (this.l.modo() === 'entrada' ? this.s.catEntrada() : this.s.catGasto()));
  protected titulo = computed(() => {
    const e = this.editando();
    return { gasto: e ? 'Editar gasto' : 'Novo gasto', entrada: e ? 'Editar entrada' : 'Nova entrada', parcelado: 'Compra parcelada' }[this.l.modo()];
  });

  protected valorParcela = computed(() => {
    const f = this.f();
    const v = parseValor(f.valor);
    return f.valorEhTotal ? v / Math.max(1, f.parcelas) : v;
  });

  /** Fatura em que a compra (ou 1ª parcela) vai cair */
  protected fatura = computed(() => {
    const f = this.f();
    const c = this.s.cartoes().find((x) => x.id === f.pagamento);
    return c ? mesFatura(f.data, c.fechamento_dia, c.vencimento_dia) : null;
  });

  constructor() {
    effect(() => {
      if (!this.l.aberto()) return;
      const g = this.l.gasto();
      const e = this.l.entrada();
      this.l.modo();
      untracked(() => this.f.set(g ? this.deGasto(g) : e ? this.deEntrada(e) : this.vazio()));
    });
  }

  private pagamentoPadrao() {
    return this.s.cartaoPadrao()?.id ?? 'debito';
  }

  private vazio(): FormLanc {
    return { valor: '', descricao: '', categoria_id: null, data: hoje(), pagamento: this.pagamentoPadrao(), parcelas: 2, valorEhTotal: true };
  }

  private deGasto(g: Gasto): FormLanc {
    const pagamento = g.forma === 'cartao' ? g.cartao_id! : g.forma === 'beneficio' ? `b:${g.beneficio_id}` : 'debito';
    return { ...this.vazio(), valor: String(g.valor).replace('.', ','), descricao: g.descricao, categoria_id: g.categoria_id, data: g.data, pagamento };
  }

  private deEntrada(e: Entrada): FormLanc {
    return { ...this.vazio(), valor: String(e.valor).replace('.', ','), descricao: e.descricao, categoria_id: e.categoria_id, data: e.data };
  }

  set<K extends keyof FormLanc>(k: K, v: FormLanc[K]) {
    this.f.update((f) => ({ ...f, [k]: v }));
  }

  /** Sugere categoria pelo histórico ao digitar descrição já usada */
  sugerir(desc: string) {
    this.set('descricao', desc);
    if (this.l.modo() === 'entrada') return;
    const r = this.s.recentes().find((x) => x.descricao.trim().toLowerCase() === desc.trim().toLowerCase());
    if (r?.categoria_id) this.set('categoria_id', r.categoria_id);
  }

  async salvar(continuar = false) {
    const f = this.f();
    const valor = parseValor(f.valor);
    if (!valor || valor <= 0) return this.toast.erro('Informe o valor');
    if (!f.descricao.trim()) return this.toast.erro('Informe a descrição');
    this.salvando.set(true);
    try {
      const modo = this.l.modo();
      if (modo === 'entrada') {
        await this.s.salvar('entradas', { id: this.l.entrada()?.id, descricao: f.descricao.trim(), categoria_id: f.categoria_id, valor, data: f.data });
      } else if (modo === 'parcelado') {
        const cartao = f.pagamento === 'debito' || f.pagamento.startsWith('b:') ? null : f.pagamento;
        // valor total: a última parcela leva a sobra dos centavos (100 em 3x = 33,33 + 33,33 + 33,34)
        const parcela = Math.round(this.valorParcela() * 100) / 100;
        const ultima = f.valorEhTotal ? Math.round((valor - parcela * (f.parcelas - 1)) * 100) / 100 : null;
        await q(supabase.rpc('criar_parcelamento', {
          p_carteira: this.s.carteiraId(), p_descricao: f.descricao.trim(), p_categoria: f.categoria_id, p_cartao: cartao,
          p_valor_parcela: parcela, p_num: f.parcelas, p_primeira: f.data, p_valor_ultima: ultima,
        }));
        await this.s.depois('gastos');
      } else {
        const forma: Forma = f.pagamento === 'debito' ? 'debito' : f.pagamento.startsWith('b:') ? 'beneficio' : 'cartao';
        await this.s.salvar('gastos', {
          id: this.l.gasto()?.id,
          descricao: f.descricao.trim(),
          categoria_id: f.categoria_id,
          valor,
          data: f.data,
          forma,
          cartao_id: forma === 'cartao' ? f.pagamento : null,
          beneficio_id: forma === 'beneficio' ? f.pagamento.slice(2) : null,
        });
      }
      this.toast.ok(modo === 'parcelado' ? `${f.parcelas}x de ${moeda(this.valorParcela())} lançadas` : 'Salvo');
      if (continuar) this.f.set({ ...this.vazio(), data: f.data, pagamento: f.pagamento });
      else this.l.aberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  async excluir(todas = false) {
    const g = this.l.gasto();
    const e = this.l.entrada();
    if (!confirm(todas ? 'Excluir todas as parcelas desta compra?' : 'Excluir este lançamento?')) return;
    try {
      if (g && todas && g.parcelamento_id) await this.s.excluir('parcelamentos', g.parcelamento_id);
      else if (g) await this.s.excluir('gastos', g.id);
      else if (e) await this.s.excluir('entradas', e.id);
      this.toast.ok('Excluído');
      this.l.aberto.set(false);
    } catch (err) {
      this.toast.erro(err);
    }
  }
}
