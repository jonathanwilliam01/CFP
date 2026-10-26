import { Injectable, WritableSignal, computed, effect, inject, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Auth } from './auth';
import { addMeses, fimMes, inicioMes, mesAtual } from './datas';
import { contasDoMes, mediasVariaveis, noMes, resumoMes, statusOrcamentos } from './financas';
import { soma } from './formato';
import {
  Beneficio, Carteira, Cartao, Categoria, Cofrinho, CofrinhoMov, Entrada, Gasto, Membro, Orcamento,
  Pagamento, Recorrencia, Registro,
} from './models';
import { q, supabase } from './supabase';

const CADASTROS = ['categorias', 'cartoes', 'beneficios', 'recorrencias', 'orcamentos', 'cofrinhos', 'cofrinho_movs', 'registros'] as const;
type Cadastro = (typeof CADASTROS)[number];

@Injectable({ providedIn: 'root' })
export class Store {
  private auth = inject(Auth);

  readonly carteiras = signal<Carteira[]>([]);
  readonly carteiraId = signal<string | null>(localStorage.getItem('cfp.carteira'));
  readonly carteira = computed(() => this.carteiras().find((c) => c.id === this.carteiraId()) ?? null);
  readonly membros = signal<Membro[]>([]);
  readonly carregando = signal(false);

  readonly mes = signal(mesAtual());

  readonly categorias = signal<Categoria[]>([]);
  readonly cartoes = signal<Cartao[]>([]);
  readonly beneficios = signal<Beneficio[]>([]);
  readonly recorrencias = signal<Recorrencia[]>([]);
  readonly orcamentos = signal<Orcamento[]>([]);
  readonly cofrinhos = signal<Cofrinho[]>([]);
  readonly cofrinhoMovs = signal<CofrinhoMov[]>([]);
  readonly registros = signal<Registro[]>([]);

  /** Gastos com data no mês anterior/atual ou na fatura do mês */
  readonly gastos = signal<Gasto[]>([]);
  readonly entradas = signal<Entrada[]>([]);
  readonly pagamentos = signal<Pagamento[]>([]);
  readonly gastosBeneficio = signal<Gasto[]>([]);
  /** Valores pagos/registrados de contas fixas, para a média das variáveis */
  readonly valoresFixas = signal<Pick<Pagamento, 'id' | 'ref_id' | 'mes' | 'valor'>[]>([]);
  readonly recentes = signal<{ descricao: string; categoria_id: string | null }[]>([]);

  readonly catMap = computed(() => new Map(this.categorias().map((c) => [c.id, c])));
  readonly catGasto = computed(() => this.categorias().filter((c) => c.tipo === 'gasto'));
  readonly catEntrada = computed(() => this.categorias().filter((c) => c.tipo === 'entrada'));
  readonly cartoesAtivos = computed(() => this.cartoes().filter((c) => c.ativo));
  readonly cartaoPadrao = computed(() => this.cartoesAtivos().find((c) => c.padrao) ?? null);
  readonly beneficiosAtivos = computed(() => this.beneficios().filter((b) => b.ativo));
  readonly membroMap = computed(() => new Map(this.membros().map((m) => [m.user_id, m.nome])));

  readonly gastosMes = computed(() => this.gastos().filter((g) => noMes(g.data, this.mes())));
  readonly gastosMesAnterior = computed(() => this.gastos().filter((g) => noMes(g.data, addMeses(this.mes(), -1))));
  readonly entradasMes = computed(() => this.entradas().filter((e) => noMes(e.data, this.mes())));

  readonly medias = computed(() => mediasVariaveis(this.recorrencias(), this.valoresFixas()));
  /** Recorrências com o valor previsto (média, nas variáveis) */
  readonly recorrenciasPrev = computed(() =>
    this.recorrencias().map((r) => {
      const m = this.medias().get(r.id);
      return m != null ? { ...r, valor: m } : r;
    }),
  );

  readonly contasMes = computed(() =>
    contasDoMes(this.mes(), this.recorrenciasPrev(), this.cartoes(), this.gastos(), this.pagamentos(), this.catMap()),
  );

  readonly resumo = computed(() =>
    resumoMes(this.mes(), this.gastos(), soma(this.entradasMes(), (e) => e.valor), this.recorrenciasPrev(), this.contasMes(), this.pagamentos()),
  );

  readonly orcamentosStatus = computed(() => statusOrcamentos(this.orcamentos(), this.gastosMes(), this.catMap()));

  readonly guardadoPorCofrinho = computed(() => {
    const m = new Map<string, number>();
    for (const mv of this.cofrinhoMovs()) m.set(mv.cofrinho_id, (m.get(mv.cofrinho_id) ?? 0) + mv.valor);
    return m;
  });

  private canal: RealtimeChannel | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

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
    const id = await q<string>(supabase.rpc('entrar_carteira', { p_codigo: codigo, p_membro: this.auth.nome() }));
    await this.iniciar();
    this.carteiraId.set(id);
  }

  private limpar() {
    this.carteiras.set([]);
    this.membros.set([]);
    const listas: WritableSignal<unknown[]>[] = [this.categorias, this.cartoes, this.beneficios, this.recorrencias, this.orcamentos, this.cofrinhos, this.cofrinhoMovs, this.registros, this.gastos, this.entradas, this.pagamentos, this.gastosBeneficio, this.valoresFixas];
    for (const s of listas) s.set([]);
  }

  private sel<T>(tabela: string, ordem = 'id') {
    return q<T[]>(supabase.from(tabela).select('*').eq('carteira_id', this.carteiraId()!).order(ordem));
  }

  async carregarTudo() {
    this.carregando.set(true);
    try {
      await Promise.all([
        this.sel<Membro>('carteira_membros', 'criado_em').then((r) => this.membros.set(r)),
        ...CADASTROS.map((t) => this.recarregar(t)),
      ]);
    } finally {
      this.carregando.set(false);
    }
  }

  async recarregar(t: Cadastro) {
    const ordem: Record<Cadastro, string> = {
      categorias: 'ordem', cartoes: 'nome', beneficios: 'nome', recorrencias: 'dia', orcamentos: 'valor',
      cofrinhos: 'criado_em', cofrinho_movs: 'data', registros: 'criado_em',
    };
    const alvo: Record<Cadastro, WritableSignal<any[]>> = {
      categorias: this.categorias, cartoes: this.cartoes, beneficios: this.beneficios, recorrencias: this.recorrencias,
      orcamentos: this.orcamentos, cofrinhos: this.cofrinhos, cofrinho_movs: this.cofrinhoMovs, registros: this.registros,
    };
    alvo[t].set(await this.sel(t, ordem[t]));
  }

  async carregarMes() {
    const id = this.carteiraId()!;
    const mes = this.mes();
    const ini = addMeses(mes, -1);
    const fim = fimMes(mes);
    const [gastos, entradas, pagamentos, benef, recentes, valores] = await Promise.all([
      q<Gasto[]>(
        supabase.from('gastos').select('*').eq('carteira_id', id)
          .or(`and(data.gte.${ini},data.lte.${fim}),fatura_mes.in.(${mes},${addMeses(mes, 1)})`)
          .order('data', { ascending: false }).order('criado_em', { ascending: false }),
      ),
      q<Entrada[]>(supabase.from('entradas').select('*').eq('carteira_id', id).gte('data', mes).lte('data', fim).order('data', { ascending: false })),
      q<Pagamento[]>(supabase.from('pagamentos').select('*').eq('carteira_id', id).in('mes', [mes, addMeses(mes, 1)])),
      q<Gasto[]>(supabase.from('gastos').select('*').eq('carteira_id', id).eq('forma', 'beneficio')),
      q<{ descricao: string; categoria_id: string | null }[]>(
        supabase.from('gastos').select('descricao, categoria_id').eq('carteira_id', id).is('parcelamento_id', null)
          .order('criado_em', { ascending: false }).limit(300),
      ),
      q<Pick<Pagamento, 'id' | 'ref_id' | 'mes' | 'valor'>[]>(
        supabase.from('pagamentos').select('id, ref_id, mes, valor').eq('carteira_id', id).eq('tipo', 'recorrencia').order('mes', { ascending: false }),
      ),
    ]);
    this.gastos.set(gastos);
    this.entradas.set(entradas);
    this.pagamentos.set(pagamentos);
    this.gastosBeneficio.set(benef);
    this.valoresFixas.set(valores);
    const vistos = new Set<string>();
    this.recentes.set(recentes.filter((r) => {
      const k = r.descricao.trim().toLowerCase();
      return !vistos.has(k) && vistos.add(k);
    }));
  }

  /** Insere (sem id) ou atualiza (com id), recarrega o que for afetado e devolve o id */
  async salvar(tabela: string, obj: Record<string, unknown>) {
    const { id, ...dados } = obj;
    let salvo = id as string;
    if (id) await q(supabase.from(tabela).update(dados).eq('id', id));
    else salvo = (await q<{ id: string }>(supabase.from(tabela).insert({ ...dados, carteira_id: this.carteiraId() }).select('id').single())).id;
    await this.depois(tabela);
    return salvo;
  }

  async excluir(tabela: string, id: string) {
    await q(supabase.from(tabela).delete().eq('id', id));
    await this.depois(tabela);
  }

  async depois(tabela: string) {
    if ((CADASTROS as readonly string[]).includes(tabela)) await this.recarregar(tabela as Cadastro);
    if (['gastos', 'entradas', 'pagamentos', 'parcelamentos', 'cartoes', 'recorrencias'].includes(tabela)) await this.carregarMes();
  }

  async definirPadrao(cartaoId: string) {
    await q(supabase.from('cartoes').update({ padrao: false }).eq('carteira_id', this.carteiraId()!).neq('id', cartaoId));
    await q(supabase.from('cartoes').update({ padrao: true }).eq('id', cartaoId));
    await this.recarregar('cartoes');
  }

  async pagar(tipo: 'recorrencia' | 'fatura', refId: string, valor: number, pagoEm: string, mes = this.mes()) {
    await q(
      supabase.from('pagamentos').upsert(
        { carteira_id: this.carteiraId(), tipo, ref_id: refId, mes, valor, pago_em: pagoEm },
        { onConflict: 'tipo,ref_id,mes' },
      ),
    );
    await this.carregarMes();
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
      q<Pagamento[]>(supabase.from('pagamentos').select('*').eq('carteira_id', id).gte('mes', ini).lte('mes', fimFat)),
    ]);
    return { gastos, entradas, pagamentos };
  }

  private assinar(id: string | null) {
    if (this.canal) supabase.removeChannel(this.canal);
    this.canal = null;
    if (!id) return;
    const ch = supabase.channel(`carteira-${id}`);
    for (const t of ['gastos', 'entradas', 'pagamentos', 'recorrencias', 'cofrinho_movs', 'registro_itens'])
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `carteira_id=eq.${id}` }, () => this.agendar(t));
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
      if (ts.includes('recorrencias')) await this.recarregar('recorrencias');
      if (ts.includes('cofrinho_movs')) await this.recarregar('cofrinho_movs');
      if (ts.some((x) => ['gastos', 'entradas', 'pagamentos'].includes(x))) await this.carregarMes();
      this.mudou.update((n) => n + 1);
    }, 600);
  }
}
