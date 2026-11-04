import { ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addDias, diffDias, hoje, inicioFatura, inicioMes, mesFatura } from '../core/datas';
import { inicioFixa, saldoBeneficio } from '../core/financas';
import { BrlPipe, MesPipe, moeda, parseValor } from '../core/formato';
import { Entrada, Forma, Gasto } from '../core/models';
import { Chat } from '../core/chat';
import { Recente, Store } from '../core/store';
import { lerComprovante, lerTags, lerTexto, regraPara } from '../core/texto';
import { Auth } from '../core/auth';
import { Fila, ItemFila, semRede } from '../core/fila';
import { guardarArquivo } from '../core/arquivos';
import { ePdf, enviarComprovante, linkComprovante, prepararComprovante, removerComprovante } from '../core/comprovante';
import { Icon } from './icon';
import { Sheet } from './sheet';
import { Visor } from './visor';
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
  /** texto que já abre aplicado no lançamento rápido (compartilhado com o app ou atalho) */
  readonly texto = signal('');
  /** comprovante que já abre anexado (foto ou PDF compartilhado com o app) */
  readonly arquivo = signal<Blob | null>(null);

  /** Texto compartilhado: comprovante vira "valor data pix nome", senão vai como veio */
  deTexto(t: string, arquivo: Blob | null = null) {
    this.novo('gasto');
    this.arquivo.set(arquivo);
    this.texto.set(t ? (lerComprovante(t) ?? t.replace(/\s+/g, ' ').trim()) : '');
  }

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

/** Web Speech API (sem tipos no lib.dom) */
interface Reconhecimento {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void;
  onerror: (e: { error: string }) => void;
  onend: () => void;
  start(): void;
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
  /** marcadores separados por espaço ou vírgula */
  tags: string;
  /** acerto entre membros (carteira com divisão) */
  pagoPor: string;
  dividido: boolean;
  /** gasto com valor negativo: abate a fatura ou o mês */
  estorno: boolean;
}

@Component({
  selector: 'app-lancar',
  imports: [Sheet, FormsModule, BrlPipe, MesPipe, Icon, Visor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lancar.html',
  styleUrl: './lancar.scss',
})
export class LancarSheet {
  protected l = inject(Lancar);
  protected s = inject(Store);
  private toast = inject(Toast);
  private fila = inject(Fila);
  private chat = inject(Chat);
  private auth = inject(Auth);
  /** formulário do próximo abrir (lançar de novo) */
  private proxima: FormLanc | null = null;

  protected f = signal<FormLanc>(this.vazio());
  protected salvando = signal(false);
  /** "mercado 120 nubank ontem" vira o formulário */
  protected rapido = signal('');
  protected comentario = signal('');
  protected comentarios = computed(() => {
    const id = this.l.gasto()?.id;
    return id ? this.chat.mensagens().filter((m) => m.gasto_id === id) : [];
  });
  /** comprovante novo escolhido (vai junto ao salvar) e pedido de tirar o atual */
  protected arquivo = signal<Blob | null>(null);
  protected tirar = signal(false);
  protected comprovante = computed(() => (this.tirar() ? null : (this.l.gasto()?.comprovante ?? null)));
  protected verUrl = signal<string | null>(null);
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

  /** Saldo do benefício escolhido no mês da data, devolvendo o próprio gasto na edição; meses depois do carregado ficam sem conta */
  protected saldoBenef = computed(() => {
    const f = this.f();
    if (this.l.modo() !== 'gasto' || this.repete() || !f.pagamento.startsWith('b:')) return null;
    const b = this.s.beneficios().find((x) => x.id === f.pagamento.slice(2));
    const mes = inicioMes(f.data);
    if (!b || mes > this.s.mes()) return null;
    const g = this.l.gasto();
    const gm = g ? inicioMes(g.data) : '';
    const proprio = g?.forma === 'beneficio' && g.beneficio_id === b.id && (b.acumula ? gm <= mes : gm === mes) ? g.valor : 0;
    return { nome: b.nome, saldo: saldoBeneficio(b, this.s.usoBeneficios(), mes, this.s.cobrancasBeneficio()).saldo + proprio };
  });
  protected parseValor = parseValor;

  /** viagem ativa com moeda: digita no valor de lá e converte com cotação + IOF */
  protected estrangeiro = signal('');
  protected cambio = computed(() => {
    const v = this.s.viagemAtiva();
    return v?.moeda && v.cotacao && this.l.modo() !== 'entrada' && !this.editando() ? v : null;
  });
  converter(t: string) {
    this.estrangeiro.set(t);
    const v = this.cambio();
    const x = parseValor(t);
    if (v && x > 0) this.set('valor', (Math.round(x * v.cotacao! * (1 + v.iof / 100) * 100) / 100).toFixed(2).replace('.', ','));
  }

  /** Fatura em que a compra (ou 1ª parcela) vai cair */
  protected fatura = computed(() => {
    const f = this.f();
    const c = this.s.cartoes().find((x) => x.id === f.pagamento);
    return c ? mesFatura(f.data, c) : null;
  });

  /** limite livre do cartão escolhido (só cartão com limite) e se a compra cai logo após o fechamento */
  protected livre = signal<number | null>(null);
  private pagamentoSel = computed(() => this.f().pagamento);
  protected melhorDia = computed(() => {
    const c = this.s.cartoes().find((x) => x.id === this.f().pagamento);
    if (!c) return false;
    const data = this.f().data;
    return diffDias(inicioFatura(mesFatura(data, c), c), data) <= 2;
  });

  constructor() {
    effect(() => {
      const c = this.l.aberto() && this.l.modo() !== 'entrada' ? this.s.cartoes().find((x) => x.id === this.pagamentoSel()) : undefined;
      this.livre.set(null);
      if (!c?.limite) return;
      const g = untracked(() => this.l.gasto());
      const proprio = g?.cartao_id === c.id ? g.valor : 0;
      this.s.limiteUsado(c.id).then((u) => untracked(this.pagamentoSel) === c.id && this.livre.set(c.limite! - u + proprio), () => undefined);
    });
    effect(() => {
      if (!this.l.aberto()) return;
      const g = this.l.gasto();
      const e = this.l.entrada();
      this.l.modo();
      untracked(() => {
        this.f.set(g ? this.deGasto(g) : e ? this.deEntrada(e) : (this.proxima ?? this.vazio()));
        this.proxima = null;
        this.estrangeiro.set('');
        this.arquivo.set(this.l.arquivo());
        this.l.arquivo.set(null);
        this.tirar.set(false);
        const t = this.l.texto();
        if (t) {
          this.l.texto.set('');
          this.rapido.set(t);
          this.aplicarTexto();
        }
      });
    });
  }

  private pagamentoPadrao() {
    return this.s.cartaoPadrao()?.id ?? 'debito';
  }

  private vazio(): FormLanc {
    return {
      valor: '', descricao: '', categoria_id: null, data: hoje(), pagamento: this.pagamentoPadrao(), parcelas: 2, valorEhTotal: true,
      repete: this.l.fixa(), variavel: false, anterior: false, fim: '', jaPago: true, tags: this.l.modo() !== 'entrada' ? (this.s.viagemAtiva()?.tag ?? '') : '',
      pagoPor: this.auth.user()?.id ?? '', dividido: true, estorno: false,
    };
  }

  private deGasto(g: Gasto): FormLanc {
    const pagamento = g.forma === 'cartao' ? g.cartao_id! : g.forma === 'beneficio' ? `b:${g.beneficio_id}` : 'debito';
    return { ...this.vazio(), valor: String(Math.abs(g.valor)).replace('.', ','), descricao: g.descricao, categoria_id: g.categoria_id, data: g.data, pagamento, tags: (g.tags ?? []).join(' '),
      pagoPor: g.pago_por ?? g.criado_por ?? '', dividido: g.dividido ?? true, estorno: g.valor < 0 };
  }

  private deEntrada(e: Entrada): FormLanc {
    return { ...this.vazio(), valor: String(e.valor).replace('.', ','), descricao: e.descricao, categoria_id: e.categoria_id, data: e.data };
  }

  set<K extends keyof FormLanc>(k: K, v: FormLanc[K]) {
    this.f.update((f) => ({ ...f, [k]: v }));
  }

  private recente(desc: string) {
    const d = desc.trim().toLowerCase();
    return d ? this.s.recentes().find((x) => x.descricao.trim().toLowerCase() === d) : undefined;
  }

  /** Pagamento usado da última vez, se o cartão ou benefício ainda está ativo (parcelado: só cartão ou débito) */
  private pagamentoDe(r: Recente) {
    if (r.forma === 'cartao') return this.s.cartoesAtivos().some((c) => c.id === r.cartao_id) ? r.cartao_id : null;
    if (r.forma === 'beneficio') return this.l.modo() === 'gasto' && this.s.beneficiosAtivos().some((b) => b.id === r.beneficio_id) ? `b:${r.beneficio_id}` : null;
    return 'debito';
  }

  /** Descrição já usada: repete a categoria e, em lançamento novo, o pagamento da última vez */
  sugerir(desc: string) {
    this.set('descricao', desc);
    if (this.l.modo() === 'entrada') return;
    const r = this.recente(desc);
    if (!r) {
      const regra = regraPara(desc, this.s.regras());
      if (regra?.categoria_id && !this.f().categoria_id) this.set('categoria_id', regra.categoria_id);
      return;
    }
    if (r.categoria_id) this.set('categoria_id', r.categoria_id);
    const pg = this.editando() ? null : this.pagamentoDe(r);
    if (pg) this.set('pagamento', pg);
  }

  protected podeFalar = !!(globalThis as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition
    || !!(globalThis as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  protected ouvindo = signal(false);

  /** Fala "mercado 120 no nubank" e aplica como o texto rápido */
  falar() {
    const g = globalThis as unknown as Record<string, new () => Reconhecimento>;
    const r = new (g['SpeechRecognition'] ?? g['webkitSpeechRecognition'])();
    r.lang = 'pt-BR';
    r.interimResults = false;
    r.onresult = (e) => {
      this.rapido.set(e.results[0][0].transcript);
      this.aplicarTexto();
    };
    r.onerror = (e) => e.error !== 'no-speech' && e.error !== 'aborted' && this.toast.erro('Não consegui ouvir: ' + e.error);
    r.onend = () => this.ouvindo.set(false);
    this.ouvindo.set(true);
    r.start();
  }

  /** Só o valor no texto rápido vai direto para o campo, sem precisar de Preencher */
  protected soValor = (t: string) => /^\s*\d[\d.]*(,\d{0,2})?\s*$/.test(t);
  digitar(t: string) {
    this.rapido.set(t);
    if (this.soValor(t)) this.set('valor', t.trim());
  }

  /** Preenche o formulário a partir do texto livre; parcelas (10x) passam para Parcelado */
  aplicarTexto() {
    const t = lerTexto(this.rapido(), { cartoes: this.s.cartoes(), beneficios: this.s.beneficios(), categorias: this.s.categorias(), hoje: hoje() });
    const a = this.f();
    const modo = t.parcelas && this.l.modo() === 'gasto' ? 'parcelado' : this.l.modo();
    if (modo === 'entrada') t.categoria_id = null;
    const f: FormLanc = {
      ...a,
      valor: t.valor != null ? String(t.valor).replace('.', ',') : a.valor,
      descricao: t.descricao || a.descricao,
      data: t.data ?? a.data,
      pagamento: t.pagamento ?? a.pagamento,
      categoria_id: t.categoria_id ?? a.categoria_id,
      parcelas: t.parcelas ?? a.parcelas,
      tags: t.tags.length ? t.tags.join(' ') : a.tags,
    };
    const r = modo === 'entrada' ? undefined : this.recente(f.descricao);
    if (r && !t.categoria_id && r.categoria_id) f.categoria_id = r.categoria_id;
    if (r && !t.pagamento) f.pagamento = this.pagamentoDe(r) ?? f.pagamento;
    this.rapido.set('');
    if (modo === this.l.modo()) return this.f.set(f);
    this.proxima = f;
    this.l.modo.set(modo);
  }

  async escolher(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const arq = input.files?.[0];
    input.value = '';
    if (!arq) return;
    try {
      this.arquivo.set(await prepararComprovante(arq));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  async verComprovante(caminho: string) {
    try {
      const url = await linkComprovante(caminho);
      if (ePdf(caminho)) window.open(url, '_blank');
      else this.verUrl.set(url);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  /** Na edição: sobe o novo (apagando o antigo se mudou de tipo) ou tira o atual */
  private async comprovanteEdicao(id: string) {
    const antigo = this.l.gasto()?.comprovante;
    const arq = this.arquivo();
    if (arq) {
      const caminho = await enviarComprovante(this.s.carteiraId()!, id, arq);
      if (antigo && antigo !== caminho) await removerComprovante(antigo);
      return { comprovante: caminho };
    }
    if (this.tirar() && antigo) {
      await removerComprovante(antigo);
      return { comprovante: null };
    }
    return {};
  }

  /** Gasto novo já gravado: sobe o arquivo; falha aqui não desfaz o gasto */
  private async comprovanteNovo(id: string, arq: Blob) {
    try {
      await this.s.salvar('gastos', { id, comprovante: await enviarComprovante(this.s.carteiraId()!, id, arq) });
    } catch (e) {
      this.toast.erro('Gasto salvo, mas o comprovante não subiu: ' + (e instanceof Error ? e.message : e));
    }
  }

  async comentar() {
    const g = this.l.gasto();
    const t = this.comentario().trim();
    if (!g || !t) return;
    try {
      await this.chat.enviar(t, g.id);
      this.comentario.set('');
    } catch (e) {
      this.toast.erro(e);
    }
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
      const tags = lerTags(f.tags);
      return {
        tipo: 'parcelamento',
        params: {
          p_descricao: descricao, p_categoria: f.categoria_id, p_cartao: cartao, p_valor_parcela: parcela, p_num: f.parcelas, p_primeira: f.data, p_valor_ultima: ultima,
          // p_tags só com marcador: banco sem a migration 024 segue aceitando
          ...(tags.length ? { p_tags: tags } : {}),
        },
      };
    }
    return { tipo: 'inserir', tabela: 'gastos', dados: { id: crypto.randomUUID(), ...this.dadosGasto(f, valor) } };
  }

  private dadosGasto(f: FormLanc, valor: number) {
    const forma: Forma = f.pagamento === 'debito' ? 'debito' : f.pagamento.startsWith('b:') ? 'beneficio' : 'cartao';
    const tags = lerTags(f.tags);
    return {
      descricao: f.descricao.trim(), categoria_id: f.categoria_id, valor: f.estorno && this.l.modo() === 'gasto' ? -valor : valor, data: f.data, forma,
      cartao_id: forma === 'cartao' ? f.pagamento : null,
      beneficio_id: forma === 'beneficio' ? f.pagamento.slice(2) : null,
      // só manda a coluna quando há marcador: banco sem a migration 020 segue aceitando o lançamento
      ...(tags.length || this.l.gasto()?.tags?.length ? { tags } : {}),
      ...(this.s.divisao() ? { pago_por: f.pagoPor || null, dividido: f.dividido } : {}),
    };
  }

  async salvar(continuar = false) {
    // texto rápido não aplicado entra antes de salvar; se virou parcelado, mostra o formulário novo
    if (this.soValor(this.rapido())) this.rapido.set('');
    else if (this.rapido().trim()) {
      const modo = this.l.modo();
      this.aplicarTexto();
      if (this.l.modo() !== modo) return;
    }
    const f = this.f();
    const valor = parseValor(f.valor);
    if (!valor || valor <= 0) return this.toast.erro('Informe o valor');
    if (!f.descricao.trim()) return this.toast.erro('Informe a descrição');
    const sb = this.saldoBenef();
    if (sb && !f.estorno && valor > sb.saldo + 0.005) return this.toast.erro(`Saldo do ${sb.nome} insuficiente: resta ${moeda(Math.max(0, sb.saldo))}`);
    const modo = this.l.modo();
    const item = this.editando() ? null : this.novoItem(f, valor);
    this.salvando.set(true);
    try {
      if (!item) {
        const e = this.l.entrada();
        if (e) await this.s.salvar('entradas', { id: e.id, descricao: f.descricao.trim(), categoria_id: f.categoria_id, valor, data: f.data });
        else {
          const id = this.l.gasto()!.id;
          await this.s.salvar('gastos', { id, ...this.dadosGasto(f, valor), ...(await this.comprovanteEdicao(id)) });
        }
        this.toast.ok('Salvo');
      } else if (!navigator.onLine) {
        return void (await this.offline(item, continuar, f));
      } else {
        try {
          await this.fila.executar(item);
        } catch (e) {
          if (!semRede(e)) throw e;
          return void (await this.offline(item, continuar, f));
        }
        const arq = this.arquivo();
        if (arq && item.tipo === 'inserir' && item.tabela === 'gastos') await this.comprovanteNovo(item.dados['id'] as string, arq);
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

  private async offline(item: ItemFila, continuar: boolean, f: FormLanc) {
    const arq = this.arquivo();
    let perdeu = false;
    if (arq && item.tipo === 'inserir' && item.tabela === 'gastos') {
      try {
        await guardarArquivo(item.dados['id'] as string, arq);
        item.comprovante = true;
      } catch {
        perdeu = true;
      }
    }
    this.fila.guardar(item);
    this.toast.ok(`Sem internet: guardado no aparelho, envia quando a conexão voltar${perdeu ? ' (o comprovante não coube no aparelho)' : ''}`);
    this.depois(continuar, f);
  }

  private depois(continuar: boolean, f: FormLanc) {
    if (!this.editando()) localStorage.setItem('cfp.lancar', this.l.modo());
    this.arquivo.set(null);
    if (continuar) this.f.set({ ...this.vazio(), data: f.data, pagamento: f.pagamento, repete: f.repete, tags: f.tags });
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
