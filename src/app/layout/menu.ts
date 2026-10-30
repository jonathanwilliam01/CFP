import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Auth } from '../core/auth';
import { supabase } from '../core/supabase';

export const CHAT = { rota: '/chat', icone: 'chat', rotulo: 'Chat' };

export const PRINCIPAIS = [
  { rota: '/', icone: 'home', rotulo: 'Início' },
  { rota: '/gastos', icone: 'receipt_long', rotulo: 'Gastos' },
  { rota: '/contas', icone: 'calendar_month', rotulo: 'Contas' },
  CHAT,
];

/** Grupos do menu lateral e do Mais, na ordem padrão */
export const GRUPOS = ['Dia a dia', 'Compromissos', 'Metas e controle', 'Análise', 'App'] as const;
export type Grupo = (typeof GRUPOS)[number];

export const ATALHOS: { rota: string; icone: string; rotulo: string; grupo: Grupo }[] = [
  { rota: '/calendario', icone: 'calendar_view_month', rotulo: 'Calendário', grupo: 'Dia a dia' },
  { rota: '/entradas', icone: 'payments', rotulo: 'Entradas', grupo: 'Dia a dia' },
  { rota: '/cartoes', icone: 'credit_card', rotulo: 'Cartões', grupo: 'Dia a dia' },
  { rota: '/beneficios', icone: 'restaurant', rotulo: 'Benefícios', grupo: 'Dia a dia' },
  { rota: '/parcelamentos', icone: 'event_repeat', rotulo: 'Parcelamentos', grupo: 'Compromissos' },
  { rota: '/assinaturas', icone: 'subscriptions', rotulo: 'Assinaturas', grupo: 'Compromissos' },
  { rota: '/dividas', icone: 'account_balance', rotulo: 'Dívidas', grupo: 'Compromissos' },
  { rota: '/cofrinhos', icone: 'savings', rotulo: 'Cofrinhos', grupo: 'Metas e controle' },
  { rota: '/orcamentos', icone: 'flag', rotulo: 'Orçamentos', grupo: 'Metas e controle' },
  { rota: '/desafios', icone: 'local_fire_department', rotulo: 'Desafios', grupo: 'Metas e controle' },
  { rota: '/registros', icone: 'menu_book', rotulo: 'Registros', grupo: 'Metas e controle' },
  { rota: '/planejamento', icone: 'edit_calendar', rotulo: 'Planejamento', grupo: 'Análise' },
  { rota: '/calculadoras', icone: 'calculate', rotulo: 'Calculadoras', grupo: 'Análise' },
  { rota: '/fechamento', icone: 'task_alt', rotulo: 'Fechamento', grupo: 'Análise' },
  { rota: '/relatorios', icone: 'bar_chart', rotulo: 'Relatórios', grupo: 'Análise' },
  { rota: '/notificacoes', icone: 'notifications', rotulo: 'Notificações', grupo: 'App' },
  { rota: '/config', icone: 'settings', rotulo: 'Configurações', grupo: 'App' },
];

/** Sempre visível: sem ela não dá para voltar a mostrar os outros */
const FIXA = '/config';
const ROTAS = ATALHOS.map((a) => a.rota);

export type Botao = 'calc' | 'chat';

interface Prefs {
  /** ordem dos grupos */
  grupos: Grupo[];
  ordem: string[];
  /** item levado para outro grupo */
  grupoDe: Record<string, Grupo>;
  ocultos: string[];
  /** botões flutuantes escondidos */
  semBotao: Botao[];
}

function normalizar(p: Partial<Prefs> | null | undefined): Prefs {
  const validos = (l: unknown) => (Array.isArray(l) ? l.filter((r) => ROTAS.includes(r)) : []);
  const ordem = validos(p?.ordem);
  const grupos = Array.isArray(p?.grupos) ? GRUPOS.filter((g) => p.grupos!.includes(g)).sort((a, b) => p.grupos!.indexOf(a) - p.grupos!.indexOf(b)) : [];
  return {
    grupos: [...grupos, ...GRUPOS.filter((g) => !grupos.includes(g))],
    ordem: [...ordem, ...ROTAS.filter((r) => !ordem.includes(r))],
    grupoDe: Object.fromEntries(Object.entries(p?.grupoDe ?? {}).filter(([r, g]) => ROTAS.includes(r) && GRUPOS.includes(g))),
    ocultos: validos(p?.ocultos).filter((r) => r !== FIXA),
    semBotao: Array.isArray(p?.semBotao) ? p.semBotao.filter((b) => b === 'calc' || b === 'chat') : [],
  };
}

function ler(): Prefs {
  try {
    return normalizar(JSON.parse(localStorage.getItem('cfp.menus') ?? 'null'));
  } catch {
    return normalizar(null);
  }
}

/** Ordem e itens escondidos do menu lateral e do Mais: no aparelho e na conta (user_metadata.menu) */
@Injectable({ providedIn: 'root' })
export class Menus {
  private auth = inject(Auth);
  readonly prefs = signal<Prefs>(ler());
  readonly lista = computed(() => {
    const p = this.prefs();
    return p.ordem.map((r) => {
      const a = ATALHOS.find((x) => x.rota === r)!;
      return { ...a, grupo: p.grupoDe[r] ?? a.grupo, id: r, nome: a.rotulo, oculto: p.ocultos.includes(r), fixo: r === FIXA };
    });
  });
  /** Grupos e itens na ordem escolhida */
  readonly grupos = computed(() => this.prefs().grupos.map((nome) => ({ nome, itens: this.lista().filter((a) => a.grupo === nome) })));
  /** Só os visíveis, sem grupo vazio */
  readonly visiveis = computed(() =>
    this.grupos().map((g) => ({ nome: g.nome, itens: g.itens.filter((a) => !a.oculto) })).filter((g) => g.itens.length),
  );
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const conta = this.auth.user()?.user_metadata?.['menu'] as Partial<Prefs> | undefined;
      if (!conta || this.timer) return;
      const p = normalizar(conta);
      this.prefs.set(p);
      localStorage.setItem('cfp.menus', JSON.stringify(p));
    });
  }

  /** Move dentro do grupo, da posição i para j; passando da ponta, vai para o fim do grupo de cima ou o começo do de baixo */
  mover(grupo: Grupo, i: number, j: number) {
    const gs = this.grupos();
    const g = gs.findIndex((x) => x.nome === grupo);
    const itens = gs[g].itens;
    if (i === j) return;
    const ordem = [...this.prefs().ordem];
    const rota = itens[i].rota;
    if (j >= 0 && j < itens.length) {
      ordem.splice(ordem.indexOf(itens[j].rota), 0, ...ordem.splice(ordem.indexOf(rota), 1));
      return this.gravar({ ...this.prefs(), ordem });
    }
    const destino = gs[j < 0 ? g - 1 : g + 1];
    if (!destino) return;
    ordem.splice(ordem.indexOf(rota), 1);
    const viz = j < 0 ? destino.itens.at(-1) : destino.itens[0];
    ordem.splice(viz ? ordem.indexOf(viz.rota) + (j < 0 ? 1 : 0) : ordem.length, 0, rota);
    this.gravar({ ...this.prefs(), ordem, grupoDe: { ...this.prefs().grupoDe, [rota]: destino.nome } });
  }

  /** Move o grupo inteiro da posição i para j */
  moverGrupo(i: number, j: number) {
    const grupos = [...this.prefs().grupos];
    if (j < 0 || j >= grupos.length || i === j) return;
    grupos.splice(j, 0, ...grupos.splice(i, 1));
    this.gravar({ ...this.prefs(), grupos });
  }

  alternarOculto(r: string) {
    if (r === FIXA) return;
    const l = this.prefs().ocultos;
    this.gravar({ ...this.prefs(), ocultos: l.includes(r) ? l.filter((x) => x !== r) : [...l, r] });
  }

  /** Volta a ordem, os grupos e os itens do menu; botões flutuantes ficam como estão */
  restaurar() {
    this.gravar({ ...normalizar(null), semBotao: this.prefs().semBotao });
  }

  botao(b: Botao) {
    return !this.prefs().semBotao.includes(b);
  }

  alternarBotao(b: Botao) {
    const l = this.prefs().semBotao;
    this.gravar({ ...this.prefs(), semBotao: l.includes(b) ? l.filter((x) => x !== b) : [...l, b] });
  }

  private gravar(p: Prefs) {
    this.prefs.set(p);
    localStorage.setItem('cfp.menus', JSON.stringify(p));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      supabase.auth.updateUser({ data: { menu: this.prefs() } }).finally(() => (this.timer = undefined));
    }, 1500);
  }
}
