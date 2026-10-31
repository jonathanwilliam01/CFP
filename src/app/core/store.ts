import { Injectable, WritableSignal, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Auth } from './auth';
import { addMeses, fimMes, hoje, inicioMes, mesAtual } from './datas';
import { GastoHist, Transferencia, acertoMes, cobrancasBeneficio, comprasRecorrentes, contasDoMes, mediasVariaveis, noMes, orcamentosNoMes, reservasPorDia, resumoMes, statusOrcamentos } from './financas';
import { soma } from './formato';
import {
  Acerto, Beneficio, Carteira, Cartao, Categoria, ContaBancaria, Cofrinho, CofrinhoMov, Dados, Desafio, Divida, Entrada, Gasto, Membro, Orcamento, OrcamentoFechado,
  OrcamentoValor, Pagamento, Receber, Recorrencia, Registro, Tabela, UsoBeneficio,
} from './models';
import { Toast } from '../shared/toast';
import { q, supabase } from './supabase';

const CADASTROS = [
  'categorias', 'cartoes', 'beneficios', 'recorrencias', 'orcamentos', 'orcamento_valores', 'orcamento_fechados', 'cofrinhos', 'cofrinho_movs', 'registros',
  'acertos', 'receber', 'dividas', 'desafios', 'contas_bancarias',
] as const;
type Cadastro = (typeof CADASTROS)[number];
const eCadastro = (t: string): t is Cadastro => (CADASTROS as readonly string[]).includes(t);

/** Tabelas que mudam os dados do mês carregados por carregarMes */
const DO_MES = ['gastos', 'entradas', 'pagamentos', 'parcelamentos', 'cartoes', 'recorrencias'];

/** Tabelas com aviso de mudança em tempo real (publication supabase_realtime) */
const TEMPO_REAL = [...CADASTROS, 'gastos', 'entradas', 'pagamentos', 'registro_itens', 'planos', 'parcelamentos', 'carteira_membros'];

export type Recente = Pick<Gasto, 'descricao' | 'categoria_id' | 'forma' | 'cartao_id' | 'beneficio_id'>;

@Injectable({ providedIn: 'root' })
export class Store {
  private auth = inject(Auth);
  private router = inject(Router);
  private toast = inject(Toast);

  readonly carteiras = signal<Carteira[]>([]);
  readonly carteiraId = signal<string | null>(localStorage.getItem('cfp.carteira'));
  readonly carteira = computed(() => this.carteiras().find((c) => c.id === this.carteiraId()) ?? null);
  readonly membros = signal<Membro[]>([]);
  readonly souDono = computed(() => this.membros().find((m) => m.user_id === this.auth.user()?.id)?.papel === 'dono');
  readonly carregando = signal(false);

  readonly mes = signal(mesAtual());
  /** Mês em que começou a usar a carteira: antes dele não se navega nem compara (parcelas antigas seguem valendo) */
  readonly inicio = computed(() => {
    const i = this.carteira()?.inicio;
    return i ? inicioMes(i) : null;
  });

  readonly categorias = signal<Categoria[]>([]);
  readonly cartoes = signal<Cartao[]>([]);
  readonly beneficios = signal<Beneficio[]>([]);
  readonly recorrencias = signal<Recorrencia[]>([]);
  readonly orcamentos = signal<Orcamento[]>([]);
  readonly orcamentoValores = signal<OrcamentoValor[]>([]);
  readonly orcamentoFechados = signal<OrcamentoFechado[]>([]);
  readonly cofrinhos = signal<Cofrinho[]>([]);
  readonly cofrinhoMovs = signal<CofrinhoMov[]>([]);
  readonly registros = signal<Registro[]>([]);
  readonly acertos = signal<Acerto[]>([]);
  readonly receber = signal<Receber[]>([]);
  readonly dividas = signal<Divida[]>([]);
  readonly desafios = signal<Desafio[]>([]);
  readonly contasBancarias = signal<ContaBancaria[]>([]);

  /** Gastos com data no mês anterior/atual ou na fatura do mês */
  readonly gastos = signal<Gasto[]>([]);
  readonly entradas = signal<Entrada[]>([]);
  readonly pagamentos = signal<Pagamento[]>([]);
  /** Uso dos benefícios por mês até o mês selecionado */
  readonly usoBeneficios = signal<UsoBeneficio[]>([]);
  /** Valores pagos/registrados de contas fixas, para a média das variáveis */
  readonly valoresFixas = signal<Pick<Pagamento, 'id' | 'ref_id' | 'mes' | 'valor'>[]>([]);
  /** Últimos gastos à vista ou no cartão, sem repetir descrição: sugestão de categoria e pagamento */
  readonly recentes = signal<Recente[]>([]);
  /** Gastos dos 3 meses antes do selecionado (campos de GastoHist): comparar categorias e achar compras recorrentes */
  readonly gastosAnteriores = signal<GastoHist[]>([]);
  /** Sugestões de conta fixa dispensadas (chave = descrição normalizada), no aparelho */
  readonly fixasIgnoradas = signal<string[]>(JSON.parse(localStorage.getItem('cfp.sugestoes') ?? '[]'));

  readonly catMap = computed(() => new Map(this.categorias().map((c) => [c.id, c])));
  readonly catGasto = computed(() => this.categorias().filter((c) => c.tipo === 'gasto'));
  readonly catEntrada = computed(() => this.categorias().filter((c) => c.tipo === 'entrada'));
  readonly cartoesAtivos = computed(() => this.cartoes().filter((c) => c.ativo));
  readonly cartaoPadrao = computed(() => this.cartoesAtivos().find((c) => c.padrao) ?? null);
  readonly beneficiosAtivos = computed(() => this.beneficios().filter((b) => b.ativo));
  readonly membroMap = computed(() => new Map(this.membros().map((m) => [m.user_id, m.nome])));
  readonly membroPorId = computed(() => new Map(this.membros().map((m) => [m.user_id, m])));

  /** Reserva de emergência: guardado nos cofrinhos marcados e quantos meses de saídas do mês ela cobre */
  readonly reserva = computed(() => {
    const ids = this.cofrinhos().filter((c) => c.emergencia).map((c) => c.id);
    if (!ids.length) return null;
    const guardado = soma(ids, (id) => this.guardadoPorCofrinho().get(id) ?? 0);
    const saidas = this.resumo().saidas;
    return { guardado, meses: saidas > 0 ? Math.floor((guardado / saidas) * 10) / 10 : null };
  });

  /** acerto entre os membros ligado na carteira */
  readonly divisao = computed(() => !!this.carteira()?.divisao);
  readonly acerto = computed(() =>
    this.divisao() ? acertoMes(this.gastos(), this.membros().map((m) => m.user_id), this.acertos(), this.mes()) : null,
  );
  readonly gastosMes = computed(() => this.gastos().filter((g) => noMes(g.data, this.mes())));
  readonly gastosMesAnterior = computed(() => {
    const ant = addMeses(this.mes(), -1);
    return this.antesDoInicio(ant) ? [] : this.gastos().filter((g) => noMes(g.data, ant));
  });
  readonly entradasMes = computed(() => this.entradas().filter((e) => noMes(e.data, this.mes())));

  readonly medias = computed(() => mediasVariaveis(this.recorrencias(), this.valoresFixas()));
  /** Recorrências com o valor previsto (média, nas variáveis) */
  readonly recorrenciasPrev = computed(() =>
    this.recorrencias().map((r) => {
      const m = this.medias().get(r.id);
      return m != null ? { ...r, valor: m } : r;
    }),
  );

  /** Gastos avulsos que se repetem todo mês: sugestão de virar conta fixa */
  readonly sugestoesFixas = computed(() =>
    comprasRecorrentes([...this.gastosAnteriores(), ...this.gastosMes()], this.recorrencias(), this.mes()).filter((c) => !this.fixasIgnoradas().includes(c.chave)),
  );

  ignorarSugestao(chave: string) {
    this.fixasIgnoradas.update((l) => [...l, chave].slice(-200));
    localStorage.setItem('cfp.sugestoes', JSON.stringify(this.fixasIgnoradas()));
  }

  readonly cobrancasBeneficio = computed(() => cobrancasBeneficio(this.recorrenciasPrev(), this.valoresFixas(), this.mes()));

  readonly contasMes = computed(() =>
    contasDoMes(this.mes(), this.recorrenciasPrev(), this.cartoes(), this.gastos(), this.pagamentos(), this.catMap()),
  );

  readonly resumo = computed(() =>
    resumoMes(this.mes(), this.gastos(), soma(this.entradasMes(), (e) => e.valor), this.recorrenciasPrev(), this.contasMes(), this.pagamentos(),
      soma(this.orcamentosStatus(), (o) => o.reservado)),
  );

  /** Orçamentos com o limite do mês selecionado */
  readonly orcamentosMes = computed(() => orcamentosNoMes(this.orcamentos(), this.orcamentoValores(), this.mes(), this.orcamentoFechados()));
  /** Reservas dos orçamentos distribuídas pelos dias do mês (saldo dia a dia e recebimentos) */
  readonly reservasDia = computed(() => reservasPorDia(this.mes(), this.orcamentosStatus(), this.cartoes(), hoje()));
  readonly orcamentosStatus = computed(() => statusOrcamentos(this.orcamentosMes(), this.gastos(), this.mes(), this.catMap(), this.cartoes(), mesAtual()));

  readonly guardadoPorCofrinho = computed(() => {
    const m = new Map<string, number>();
    for (const mv of this.cofrinhoMovs()) m.set(mv.cofrinho_id, (m.get(mv.cofrinho_id) ?? 0) + mv.valor);
    return m;
  });

  private canal: RealtimeChannel | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private reqMes = 0;

  constructor() {
    effect(() => {
      const id = this.auth.user() ? this.carteiraId() : null;
      if (id) localStorage.setItem('cfp.carteira', id);
      untracked(() => {
        this.assinar(id);
        if (id) this.carregarTudo();
      });
    });
    effect(() => {
      this.mes();
      if (this.auth.user() && this.carteiraId()) untracked(() => this.carregarMes());
    });
    effect(() => {
      if (!this.auth.user()) this.limpar();
    });
    effect(() => {
      const ini = this.inicio();
      if (ini && this.mes() < ini) this.mes.set(ini);
    });
  }

  antesDoInicio(mes: string) {
    const ini = this.inicio();
    return !!ini && inicioMes(mes) < ini;
  }

  /** Carrega carteiras do usuário; retorna false se não participa de nenhuma */
  async iniciar() {
    const lista = await q<Carteira[]>(supabase.from('carteiras').select('*').order('criado_em'));
    this.carteiras.set(lista);
    if (!lista.some((c) => c.id === this.carteiraId())) this.carteiraId.set(lista[0]?.id ?? null);
    return lista.length > 0;
  }

  async criarCarteira(nome: string) {
    const id = await q<string>(supabase.rpc('criar_carteira', { p_nome: nome, p_membro: this.auth.nome() }));
    await this.iniciar();
    this.carteiraId.set(id);
  }

  async entrarCarteira(codigo: string) {
    const id = await q<string | null>(supabase.rpc('entrar_carteira', { p_codigo: codigo, p_membro: this.auth.nome() }));
    if (!id) throw new Error('Código inválido');
    await this.iniciar();
    this.carteiraId.set(id);
  }

  async novoCodigo() {
    await q(supabase.rpc('novo_codigo', { p_carteira: this.carteiraId() }));
    await this.iniciar();
  }

  async removerMembro(userId: string) {
    await q(supabase.rpc('remover_membro', { p_carteira: this.carteiraId(), p_user: userId }));
    await this.recarregarMembros();
  }

  /** Sai da carteira atual (ou a exclui, se dono); devolve false se não sobrou carteira */
  async sairCarteira(excluir = false) {
    await q(supabase.rpc(excluir ? 'excluir_carteira' : 'sair_carteira', { p_carteira: this.carteiraId() }));
    return this.iniciar();
  }

  private limpar() {
    this.carteiras.set([]);
    this.membros.set([]);
    const listas: WritableSignal<unknown[]>[] = [this.categorias, this.cartoes, this.beneficios, this.recorrencias, this.orcamentos, this.orcamentoValores, this.orcamentoFechados, this.cofrinhos, this.cofrinhoMovs, this.registros, this.acertos, this.receber, this.dividas, this.desafios, this.contasBancarias, this.gastos, this.entradas, this.pagamentos, this.usoBeneficios, this.valoresFixas, this.recentes, this.gastosAnteriores];
    for (const s of listas) s.set([]);
  }

  private sel<T>(tabela: string, ordem = 'id') {
    return q<T[]>(supabase.from(tabela).select('*').eq('carteira_id', this.carteiraId()!).order(ordem));
  }

  async carregarTudo() {
    this.carregando.set(true);
    try {
      await Promise.all([this.recarregarMembros(), ...CADASTROS.map((t) => this.recarregar(t))]);
    } finally {
      this.carregando.set(false);
    }
  }

  private async recarregarMembros() {
    this.membros.set(await this.sel<Membro>('carteira_membros', 'criado_em'));
  }

  async recarregar(t: Cadastro) {
    const ordem: Record<Cadastro, string> = {
      categorias: 'ordem', cartoes: 'nome', beneficios: 'nome', recorrencias: 'dia', orcamentos: 'valor', orcamento_valores: 'mes', orcamento_fechados: 'mes',
      cofrinhos: 'criado_em', cofrinho_movs: 'data', registros: 'criado_em', acertos: 'criado_em', receber: 'data', dividas: 'criado_em', desafios: 'inicio', contas_bancarias: 'nome',
    };
    const alvo: Record<Cadastro, WritableSignal<any[]>> = {
      categorias: this.categorias, cartoes: this.cartoes, beneficios: this.beneficios, recorrencias: this.recorrencias,
      orcamentos: this.orcamentos, orcamento_valores: this.orcamentoValores, orcamento_fechados: this.orcamentoFechados, cofrinhos: this.cofrinhos, cofrinho_movs: this.cofrinhoMovs, registros: this.registros,
      acertos: this.acertos, receber: this.receber, dividas: this.dividas, desafios: this.desafios, contas_bancarias: this.contasBancarias,
    };
    alvo[t].set(await this.sel(t, ordem[t]));
  }

  async carregarMes() {
    const req = ++this.reqMes;
    const id = this.carteiraId()!;
    const mes = this.mes();
    const ini = addMeses(mes, -1);
    const fim = fimMes(mes);
    const desde = [addMeses(mes, -3), this.inicio() ?? ''].sort()[1];
    const [gastos, entradas, pagamentos, uso, recentes, valores, anteriores] = await Promise.all([
      q<Gasto[]>(
        supabase.from('gastos').select('*').eq('carteira_id', id)
          .or(`and(data.gte.${ini},data.lte.${fim}),fatura_mes.in.(${mes},${addMeses(mes, 1)})`)
          .order('data', { ascending: false }).order('criado_em', { ascending: false }),
      ),
      q<Entrada[]>(supabase.from('entradas').select('*').eq('carteira_id', id).gte('data', mes).lte('data', fim).order('data', { ascending: false })),
      q<Pagamento[]>(supabase.from('pagamentos').select('*').eq('carteira_id', id).in('mes', [ini, mes, addMeses(mes, 1)])),
      q<UsoBeneficio[]>(supabase.rpc('uso_beneficios', { p_carteira: id, p_ate: fim })),
      q<Recente[]>(
        supabase.from('gastos').select('descricao, categoria_id, forma, cartao_id, beneficio_id').eq('carteira_id', id).is('parcelamento_id', null)
          .order('criado_em', { ascending: false }).limit(300),
      ),
      q<Pick<Pagamento, 'id' | 'ref_id' | 'mes' | 'valor'>[]>(
        supabase.from('pagamentos').select('id, ref_id, mes, valor').eq('carteira_id', id).eq('tipo', 'recorrencia').order('mes', { ascending: false }),
      ),
      q<GastoHist[]>(
        supabase.from('gastos').select('descricao, valor, data, categoria_id, forma, cartao_id, fatura_mes, parcelamento_id').eq('carteira_id', id).gte('data', desde).lt('data', mes),
      ),
    ]);
    // troca rápida de mês: descarta a resposta que chegou depois da mais nova
    if (req !== this.reqMes) return;
    this.gastos.set(gastos);
    this.entradas.set(entradas);
    this.pagamentos.set(pagamentos);
    this.usoBeneficios.set(uso);
    this.valoresFixas.set(valores);
    this.gastosAnteriores.set(anteriores);
    const vistos = new Set<string>();
    this.recentes.set(recentes.filter((r) => {
      const k = r.descricao.trim().toLowerCase();
      return !vistos.has(k) && vistos.add(k);
    }));
  }

  /** Insere (sem id) ou atualiza (com id), recarrega o que for afetado e devolve o id */
  async salvar<T extends Tabela>(tabela: T, obj: Dados<T>) {
    const { id, ...dados } = obj;
    let salvo = id as string;
    if (id) await q(supabase.from(tabela).update(dados).eq('id', id));
    else salvo = (await q<{ id: string }>(supabase.from(tabela).insert({ ...dados, carteira_id: this.carteiraId() }).select('id').single())).id;
    await this.depois(tabela);
    return salvo;
  }

  async excluir(tabela: Tabela, id: string) {
    await q(supabase.from(tabela).delete().eq('id', id));
    await this.depois(tabela);
  }

  /** Some da tela na hora e só exclui no banco se não desfizer; `recarregar` atualiza telas com carga própria */
  excluirAdiado(tabela: Tabela, id: string, texto: string, recarregar?: () => unknown) {
    const locais: Partial<Record<Tabela, WritableSignal<{ id: string }[]>>> = {
      gastos: this.gastos, entradas: this.entradas, pagamentos: this.pagamentos, categorias: this.categorias, cartoes: this.cartoes,
      beneficios: this.beneficios, recorrencias: this.recorrencias, orcamentos: this.orcamentos, cofrinhos: this.cofrinhos,
      cofrinho_movs: this.cofrinhoMovs, registros: this.registros, receber: this.receber, dividas: this.dividas, desafios: this.desafios, contas_bancarias: this.contasBancarias,
    };
    locais[tabela]?.update((l) => l.filter((x) => x.id !== id));
    if (tabela === 'parcelamentos') this.gastos.update((l) => l.filter((g) => g.parcelamento_id !== id));
    this.toast.adiar(
      texto,
      async () => {
        await this.excluir(tabela, id);
        await recarregar?.();
      },
      async () => {
        await this.depois(tabela);
        await recarregar?.();
      },
    );
  }

  async depois(tabela: string) {
    if (eCadastro(tabela)) await this.recarregar(tabela);
    if (DO_MES.includes(tabela)) await this.carregarMes();
  }

  /** Limite comprometido no cartão: gastos das faturas do mês atual em diante ainda não pagas */
  async limiteUsado(cartaoId: string) {
    const atual = mesAtual();
    const [g, p] = await Promise.all([
      q<{ valor: number; fatura_mes: string }[]>(supabase.from('gastos').select('valor, fatura_mes').eq('cartao_id', cartaoId).gte('fatura_mes', atual)),
      q<{ mes: string }[]>(supabase.from('pagamentos').select('mes').eq('tipo', 'fatura').eq('ref_id', cartaoId).gte('mes', atual)),
    ]);
    const pagas = new Set(p.map((x) => x.mes));
    return soma(g.filter((x) => !pagas.has(x.fatura_mes)), (x) => x.valor);
  }

  /** Registra que "de" pagou "para" no mês selecionado */
  acertar(t: Transferencia) {
    return this.salvar('acertos', { mes: this.mes(), de: t.de, para: t.para, valor: t.valor });
  }

  async definirPadrao(cartaoId: string) {
    await q(supabase.rpc('definir_cartao_padrao', { p_cartao: cartaoId }));
    await this.recarregar('cartoes');
  }

  /** Registra a baixa e devolve o id do pagamento; sem pagoEm só grava o valor do mês */
  /** `resto`: fatura paga em parte, o que passa para a fatura seguinte */
  async pagar(tipo: 'recorrencia' | 'fatura', refId: string, valor: number, pagoEm: string | null, mes = this.mes(), resto = 0) {
    const { id } = await q<{ id: string }>(
      supabase.from('pagamentos').upsert(
        { carteira_id: this.carteiraId(), tipo, ref_id: refId, mes, valor, pago_em: pagoEm, ...(tipo === 'fatura' ? { resto } : {}) },
        { onConflict: 'tipo,ref_id,mes' },
      ).select('id').single(),
    );
    await this.carregarMes();
    return id;
  }

  /** Grava e remove valores mensais de uma conta fixa (histórico das variáveis) */
  async salvarValores(refId: string, novos: { mes: string; valor: number; pago_em: string }[], removidos: string[]) {
    if (removidos.length) await q(supabase.from('pagamentos').delete().in('id', removidos));
    if (novos.length)
      await q(
        supabase.from('pagamentos').upsert(
          novos.map((n) => ({ ...n, carteira_id: this.carteiraId(), tipo: 'recorrencia', ref_id: refId })),
          { onConflict: 'tipo,ref_id,mes' },
        ),
      );
    await this.carregarMes();
  }

  /**
   * Novo valor a partir de um mês (RPC reajustar_recorrencia, numa transação): encerra a recorrência no mês anterior
   * e cria outra igual ligada por reajuste_de. Pagamentos desse mês em diante passam para a nova; nas variáveis a média recomeça ali.
   */
  async reajustar(r: Recorrencia, valor: number, mes: string) {
    await q(supabase.rpc('reajustar_recorrencia', { p_id: r.id, p_valor: valor, p_mes: mes }));
    await Promise.all([this.recarregar('recorrencias'), this.carregarMes()]);
  }

  /** Novo limite de mes até ate (null = daí em diante); ajustes que começavam dentro do período deixam de valer */
  async ajustarOrcamento(orcamentoId: string, valor: number, mes: string, ate: string | null) {
    const novo = await this.salvar('orcamento_valores', { orcamento_id: orcamentoId, valor, mes, ate });
    let antigos = supabase.from('orcamento_valores').delete().eq('orcamento_id', orcamentoId).neq('id', novo).gte('mes', mes);
    if (ate) antigos = antigos.lte('mes', ate);
    await q(antigos);
    await this.recarregar('orcamento_valores');
  }

  /** Deixa de reservar no mês o que sobrou do orçamento; devolve o id para desfazer */
  desconsiderarSobra(orcamentoId: string, mes = this.mes()) {
    return this.salvar('orcamento_fechados', { orcamento_id: orcamentoId, mes });
  }

  async desfazerPagamento(id: string) {
    await this.excluir('pagamentos', id);
  }

  /** Dados de vários meses para relatórios e planejamento */
  async historico(ini: string, fim: string) {
    const id = this.carteiraId()!;
    const fimFat = addMeses(inicioMes(fim), 1); // faturas pagas no mês anterior
    const [gastos, entradas, pagamentos] = await Promise.all([
      q<Gasto[]>(supabase.from('gastos').select('*').eq('carteira_id', id).or(`and(data.gte.${ini},data.lte.${fim}),and(fatura_mes.gte.${ini},fatura_mes.lte.${fimFat})`)),
      q<Entrada[]>(supabase.from('entradas').select('*').eq('carteira_id', id).gte('data', ini).lte('data', fim)),
      q<Pagamento[]>(supabase.from('pagamentos').select('*').eq('carteira_id', id).gte('mes', addMeses(inicioMes(ini), -1)).lte('mes', fimFat)),
    ]);
    return { gastos, entradas, pagamentos };
  }

  // DELETE não aceita filtro no realtime: chega de qualquer carteira (só a chave) e só dispara recarga
  private assinar(id: string | null) {
    if (this.canal) supabase.removeChannel(this.canal);
    this.canal = null;
    if (!id) return;
    const ch = supabase.channel(`carteira-${id}`);
    for (const t of TEMPO_REAL) {
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: t, filter: `carteira_id=eq.${id}` }, () => this.agendar(t));
      ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: t, filter: `carteira_id=eq.${id}` }, () => this.agendar(t));
      ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: t }, () => this.agendar(t));
    }
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'carteiras', filter: `id=eq.${id}` }, () => this.agendar('carteiras'));
    this.canal = ch.subscribe();
  }

  private pendentes = new Set<string>();
  readonly mudou = signal(0);

  private agendar(t: string) {
    this.pendentes.add(t);
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      const ts = [...this.pendentes];
      this.pendentes.clear();
      if (ts.includes('carteira_membros') || ts.includes('carteiras')) {
        const antes = this.carteiraId();
        if (!(await this.iniciar())) return void this.router.navigateByUrl('/bem-vindo');
        // carteira trocada: o effect de carteiraId recarrega tudo
        if (this.carteiraId() !== antes) return;
        await this.recarregarMembros();
      }
      await Promise.all(ts.filter(eCadastro).map((x) => this.recarregar(x)));
      if (ts.some((x) => DO_MES.includes(x))) await this.carregarMes();
      this.mudou.update((n) => n + 1);
    }, 600);
  }
}
