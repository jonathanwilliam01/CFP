import { ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addDias, hoje, mesFatura } from '../core/datas';
import { inicioFixa } from '../core/financas';
import { BrlPipe, MesPipe, moeda, parseValor } from '../core/formato';
import { Entrada, Forma, Gasto } from '../core/models';
import { Store } from '../core/store';
import { Fila, ItemFila, semRede } from '../core/fila';
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
  /** abre com "Repete todo mês" marcado */
  readonly fixa = signal(false);

  /** Sem modo abre no último tipo lançado */
  novo(modo?: Modo, fixa = false) {
    this.gasto.set(null);
    this.entrada.set(null);
    this.fixa.set(fixa);
    this.modo.set(modo ?? ((localStorage.getItem('cfp.lancar') as Modo) || 'gasto'));
    this.aberto.set(true);
  }

  editarGasto(g: Gasto) {
    this.fixa.set(false);
    this.entrada.set(null);
    this.gasto.set(g);
    this.modo.set('gasto');
    this.aberto.set(true);
  }

  editarEntrada(e: Entrada) {
    this.fixa.set(false);
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
  /** vira conta/entrada fixa */
  repete: boolean;
  variavel: boolean;
  anterior: boolean;
  fim: string;
  /** data já passou: marca o primeiro mês como pago/recebido */
  jaPago: boolean;
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
  private fila = inject(Fila);
  /** formulário do próximo abrir (lançar de novo) */
  private proxima: FormLanc | null = null;

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

  protected podeRepetir = computed(() => !this.editando() && this.l.modo() !== 'parcelado');
  protected repete = computed(() => this.podeRepetir() && this.f().repete);
  /** cartão da conta fixa (entrada não tem pagamento) */
  protected cartaoFixa = computed(() => (this.l.modo() === 'gasto' ? this.s.cartoes().find((c) => c.id === this.f().pagamento) : undefined));
  /** fixa no cartão é paga com a fatura */
  protected podeJaPago = computed(() => this.repete() && !this.cartaoFixa() && this.f().data <= this.hoje);
  private fixa = computed(() => inicioFixa(this.f().data, this.cartaoFixa()));
  protected inicioFixa = computed(() => this.fixa().inicio);
  protected diaFixa = computed(() => this.fixa().dia);

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
      untracked(() => {
        this.f.set(g ? this.deGasto(g) : e ? this.deEntrada(e) : (this.proxima ?? this.vazio()));
        this.proxima = null;
      });
    });
  }

  private pagamentoPadrao() {
    return this.s.cartaoPadrao()?.id ?? 'debito';
  }

  private vazio(): FormLanc {
    return {
      valor: '', descricao: '', categoria_id: null, data: hoje(), pagamento: this.pagamentoPadrao(), parcelas: 2, valorEhTotal: true,
      repete: this.l.fixa(), variavel: false, anterior: false, fim: '', jaPago: true,
    };
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

  /** Lançamento novo como item da fila (vai direto ou fica no aparelho sem internet) */
  private novoItem(f: FormLanc, valor: number): ItemFila {
    const modo = this.l.modo();
    const descricao = f.descricao.trim();
    if (this.repete()) {
      const entrada = modo === 'entrada';
      const cartao = this.cartaoFixa();
      const benef = !entrada && f.pagamento.startsWith('b:') ? f.pagamento.slice(2) : null;
      const inicio = this.inicioFixa();
      return {
        tipo: 'fixa',
        dados: {
          id: crypto.randomUUID(), tipo: entrada ? 'entrada' : 'conta', descricao, categoria_id: f.categoria_id, valor, dia: this.diaFixa(),
          inicio, fim: f.fim ? `${f.fim}-01` : null, ativo: true, cartao_id: cartao?.id ?? null,
          variavel: !entrada && f.variavel, paga_mes_anterior: !entrada && !cartao && !benef && f.anterior, beneficio_id: benef,
        },
        pago: this.podeJaPago() && f.jaPago ? { mes: inicio, valor, pago_em: f.data } : null,
      };
    }
    if (modo === 'entrada')
      return { tipo: 'inserir', tabela: 'entradas', dados: { id: crypto.randomUUID(), descricao, categoria_id: f.categoria_id, valor, data: f.data } };
    if (modo === 'parcelado') {
      const cartao = f.pagamento === 'debito' || f.pagamento.startsWith('b:') ? null : f.pagamento;
      // valor total: a última parcela leva a sobra dos centavos (100 em 3x = 33,33 + 33,33 + 33,34)
      const parcela = Math.round(this.valorParcela() * 100) / 100;
      const ultima = f.valorEhTotal ? Math.round((valor - parcela * (f.parcelas - 1)) * 100) / 100 : null;
      return {
        tipo: 'parcelamento',
        params: { p_descricao: descricao, p_categoria: f.categoria_id, p_cartao: cartao, p_valor_parcela: parcela, p_num: f.parcelas, p_primeira: f.data, p_valor_ultima: ultima },
      };
    }
    return { tipo: 'inserir', tabela: 'gastos', dados: { id: crypto.randomUUID(), ...this.dadosGasto(f, valor) } };
  }

  private dadosGasto(f: FormLanc, valor: number) {
    const forma: Forma = f.pagamento === 'debito' ? 'debito' : f.pagamento.startsWith('b:') ? 'beneficio' : 'cartao';
    return {
      descricao: f.descricao.trim(), categoria_id: f.categoria_id, valor, data: f.data, forma,
      cartao_id: forma === 'cartao' ? f.pagamento : null,
      beneficio_id: forma === 'beneficio' ? f.pagamento.slice(2) : null,
    };
  }

  async salvar(continuar = false) {
    const f = this.f();
    const valor = parseValor(f.valor);
    if (!valor || valor <= 0) return this.toast.erro('Informe o valor');
    if (!f.descricao.trim()) return this.toast.erro('Informe a descrição');
    const modo = this.l.modo();
    const item = this.editando() ? null : this.novoItem(f, valor);
    this.salvando.set(true);
    try {
      if (!item) {
        const e = this.l.entrada();
        if (e) await this.s.salvar('entradas', { id: e.id, descricao: f.descricao.trim(), categoria_id: f.categoria_id, valor, data: f.data });
        else await this.s.salvar('gastos', { id: this.l.gasto()!.id, ...this.dadosGasto(f, valor) });
        this.toast.ok('Salvo');
      } else if (!navigator.onLine) {
        return void this.offline(item, continuar, f);
      } else {
        try {
          await this.fila.executar(item);
        } catch (e) {
          if (!semRede(e)) throw e;
          return void this.offline(item, continuar, f);
        }
        this.toast.ok(
          item.tipo === 'fixa' ? (modo === 'entrada' ? 'Entrada fixa criada' : 'Conta fixa criada')
          : item.tipo === 'parcelamento' ? `${f.parcelas}x de ${moeda(this.valorParcela())} lançadas` : 'Salvo',
        );
      }
      this.depois(continuar, f);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  private offline(item: ItemFila, continuar: boolean, f: FormLanc) {
    this.fila.guardar(item);
    this.toast.ok('Sem internet: guardado no aparelho, envia quando a conexão voltar');
    this.depois(continuar, f);
  }

  private depois(continuar: boolean, f: FormLanc) {
    if (!this.editando()) localStorage.setItem('cfp.lancar', this.l.modo());
    if (continuar) this.f.set({ ...this.vazio(), data: f.data, pagamento: f.pagamento, repete: f.repete });
    else this.l.aberto.set(false);
  }

  /** Abre um lançamento novo igual ao que está sendo editado, com a data de hoje */
  lancarDeNovo() {
    this.proxima = { ...this.f(), data: hoje() };
    this.l.gasto.set(null);
    this.l.entrada.set(null);
  }

  excluir(todas = false) {
    const g = this.l.gasto();
    const e = this.l.entrada();
    if (g && todas && g.parcelamento_id) this.s.excluirAdiado('parcelamentos', g.parcelamento_id, 'Parcelas excluídas');
    else if (g) this.s.excluirAdiado('gastos', g.id, 'Gasto excluído');
    else if (e) this.s.excluirAdiado('entradas', e.id, 'Entrada excluída');
    this.l.aberto.set(false);
  }
}
