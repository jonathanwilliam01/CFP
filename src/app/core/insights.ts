import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { addDias, diaNoMes, diffDias, hoje, mesAtual, mesFatura } from './datas';
import { aporteMensal, ativaNoMes, categoriasAcima, faturaProjetada, fixasNaFatura, porCategoria, saldoBeneficio, variaveisAcima } from './financas';
import { moeda, pct, soma } from './formato';
import { Chat } from './chat';
import { Store } from './store';

export type NivelAviso = 'perigo' | 'alerta' | 'info' | 'sucesso';

export interface Aviso {
  id: string;
  nivel: NivelAviso;
  icone: string;
  titulo: string;
  texto: string;
  link?: string;
}

export interface Dica {
  icone: string;
  titulo: string;
  texto: string;
}

const GERAIS: Dica[] = [
  { icone: 'health_and_safety', titulo: 'Reserva de emergência', texto: 'Tente guardar o equivalente a 6 meses de gastos fixos num cofrinho só para imprevistos.' },
  { icone: 'pie_chart', titulo: 'Regra 50/30/20', texto: '50% para necessidades, 30% para desejos e 20% para guardar ou investir.' },
  { icone: 'event_available', titulo: 'Melhor dia de compra', texto: 'Comprar logo após o fechamento do cartão dá quase 40 dias até pagar.' },
  { icone: 'autorenew', titulo: 'Revise assinaturas', texto: 'Uma vez por trimestre, cancele serviços que vocês não usaram no último mês.' },
  { icone: 'shopping_cart', titulo: 'Lista no mercado', texto: 'Ir ao mercado com lista e sem fome reduz bastante as compras por impulso.' },
  { icone: 'hourglass_top', titulo: 'Regra das 48h', texto: 'Para compras não essenciais, espere 48h antes de decidir. Muita vontade passa.' },
];

@Injectable({ providedIn: 'root' })
export class Insights {
  private s = inject(Store);
  private chat = inject(Chat);
  private lidas = signal<string[]>(JSON.parse(localStorage.getItem('cfp.lidas') ?? '[]'));

  /** Mensagens não lidas no chat (vale em qualquer mês) */
  private avisoChat = computed<Aviso[]>(() => {
    const m = this.chat.ultimaNaoLida();
    if (!m) return [];
    const n = this.chat.naoLidas();
    const nome = this.s.membroMap().get(m.user_id) ?? 'Chat';
    const texto = m.texto.length > 80 ? m.texto.slice(0, 80) + '…' : m.texto;
    return [{ id: `chat-${m.id}`, nivel: 'info', icone: 'chat', titulo: n > 1 ? `${n} mensagens novas no chat` : `Mensagem de ${nome}`, texto: n > 1 ? `${nome}: ${texto}` : texto, link: '/chat' }];
  });

  readonly avisos = computed<Aviso[]>(() => [...this.avisoChat(), ...this.avisosMes()]);

  private avisosMes = computed<Aviso[]>(() => {
    const s = this.s;
    const mes = s.mes();
    if (mes !== mesAtual()) return [];
    const h = hoje();
    const r = s.resumo();
    const l: Aviso[] = [];

    for (const c of s.contasMes()) {
      if (c.pago) continue;
      const d = diffDias(h, c.vencimento);
      if (d < 0)
        l.push({ id: `venc-${c.ref_id}-${mes}`, nivel: 'perigo', icone: 'error', titulo: `${c.descricao} vencida`, texto: `${moeda(c.valor)} venceu há ${-d} dia(s).`, link: '/contas' });
      else if (d <= 3)
        l.push({ id: `avencer-${c.ref_id}-${mes}`, nivel: 'alerta', icone: 'alarm', titulo: `${c.descricao} vence ${d === 0 ? 'hoje' : `em ${d} dia(s)`}`, texto: `Valor: ${moeda(c.valor)}.`, link: '/contas' });
    }

    for (const c of s.cartoesAtivos()) {
      const fech = diaNoMes(mes, c.fechamento_dia);
      const d = diffDias(h, fech);
      if (d >= 0 && d <= 3) {
        const fm = mesFatura(addDias(fech, -1), c.fechamento_dia, c.vencimento_dia);
        const total =
          soma(s.gastos().filter((g) => g.cartao_id === c.id && g.fatura_mes === fm), (g) => g.valor) +
          soma(fixasNaFatura(fm, c, s.recorrenciasPrev()), (f) => f.valor);
        // fecha hoje: a projeção já olharia o ciclo seguinte
        const proj = d > 0 ? faturaProjetada(c, s.gastos(), s.recorrenciasPrev(), h) : null;
        const ritmo = proj && proj.mes === fm && proj.projetada > total + 1 ? ` No ritmo atual, fecha em ${moeda(proj.projetada)}.` : '';
        l.push({ id: `fech-${c.id}-${mes}`, nivel: 'info', icone: 'credit_card', titulo: `Fatura ${c.nome} fecha ${d === 0 ? 'hoje' : `em ${d} dia(s)`}`, texto: total ? `Parcial: ${moeda(total)}.${ritmo}` : 'Compras após o fechamento vão para a próxima fatura.', link: '/cartoes' });
      }
    }

    for (const o of s.orcamentosStatus()) {
      if (o.nivel === 'estourado')
        l.push({ id: `orc100-${o.orcamento.id}-${mes}`, nivel: 'perigo', icone: 'flag', titulo: `Orçamento estourado: ${o.nome}${o.pagamento ? ` (${o.pagamento})` : ''}`, texto: `${moeda(o.gasto)} de ${moeda(o.orcamento.valor)} (${o.pct}%).`, link: '/orcamentos' });
      else if (o.nivel === 'alerta')
        l.push({ id: `orcal-${o.orcamento.id}-${mes}`, nivel: 'alerta', icone: 'warning', titulo: `${o.nome}${o.pagamento ? ` (${o.pagamento})` : ''} em ${o.pct}% do orçamento`, texto: `Restam ${moeda(o.orcamento.valor - o.gasto)} no mês.`, link: '/orcamentos' });
    }

    if (r.entradas > 0 && r.saldo < 0)
      l.push({ id: `saldo-${mes}`, nivel: 'perigo', icone: 'trending_down', titulo: 'Saldo do mês negativo', texto: `As saídas superam as entradas em ${moeda(-r.saldo)}.`, link: '/resumo' });

    for (const b of s.beneficiosAtivos()) {
      const { saldo } = saldoBeneficio(b, s.usoBeneficios(), mes, s.cobrancasBeneficio());
      if (b.valor_mensal > 0 && saldo < b.valor_mensal * 0.1)
        l.push({ id: `benef-${b.id}-${mes}`, nivel: 'alerta', icone: 'restaurant', titulo: `${b.nome} quase no fim`, texto: `Saldo: ${moeda(saldo)}.`, link: '/beneficios' });
    }

    for (const c of s.cofrinhos()) {
      const g = s.guardadoPorCofrinho().get(c.id) ?? 0;
      if (c.meta > 0 && g >= c.meta)
        l.push({ id: `meta-${c.id}`, nivel: 'sucesso', icone: 'celebration', titulo: `Meta atingida: ${c.nome}`, texto: `Vocês guardaram ${moeda(g)}!`, link: `/cofrinhos/${c.id}` });
    }

    for (const v of variaveisAcima(s.recorrencias(), s.valoresFixas(), mes))
      l.push({ id: `var-${v.r.id}-${v.mes}`, nivel: 'alerta', icone: 'trending_up', titulo: `${v.r.descricao} veio ${v.pct}% acima da média`, texto: `${moeda(v.valor)} contra média de ${moeda(v.media)}.`, link: '/contas' });

    for (const c of categoriasAcima(s.gastosMes(), s.gastosAnteriores(), s.catMap()))
      l.push({ id: `cat-${c.id}-${mes}`, nivel: 'alerta', icone: 'trending_up', titulo: `${c.nome} ${c.acima}% acima do normal`, texto: `${moeda(c.total)} no mês contra média de ${moeda(c.media)} nos meses anteriores.`, link: '/relatorios' });

    for (const e of s.recorrencias().filter((x) => x.tipo === 'entrada' && ativaNoMes(x, mes))) {
      const d = diffDias(diaNoMes(mes, e.dia), h);
      if (d > 2 && !s.pagamentos().some((p) => p.ref_id === e.id && p.mes === mes))
        l.push({ id: `entr-${e.id}-${mes}`, nivel: 'info', icone: 'payments', titulo: `${e.descricao} não confirmada`, texto: `Previsto para dia ${e.dia}. Marque como recebida.`, link: '/entradas' });
    }

    const ordem: Record<NivelAviso, number> = { perigo: 0, alerta: 1, info: 2, sucesso: 3 };
    return l.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
  });

  readonly naoLidas = computed(() => this.avisos().filter((a) => !this.lidas().includes(a.id)));

  readonly dicas = computed<Dica[]>(() => {
    const s = this.s;
    const r = s.resumo();
    const l: Dica[] = [];
    const atual = porCategoria(s.gastosMes(), s.catMap());
    const anterior = new Map(porCategoria(s.gastosMesAnterior(), s.catMap()).map((c) => [c.id, c.total]));

    if (atual[0] && r.consumo > 0)
      l.push({ icone: atual[0].icone, titulo: `${atual[0].nome} lidera os gastos`, texto: `${atual[0].pct}% de tudo que foi gasto no mês (${moeda(atual[0].total)}).` });

    for (const c of atual) {
      const ant = anterior.get(c.id) ?? 0;
      if (ant > 0 && c.total - ant > 50 && c.total / ant >= 1.3)
        l.push({ icone: 'trending_up', titulo: `${c.nome} subiu ${Math.round((c.total / ant - 1) * 100)}%`, texto: `De ${moeda(ant)} para ${moeda(c.total)} em relação ao mês passado.` });
    }

    if (r.entradas > 0) {
      const taxa = pct(r.saldo, r.entradas);
      if (taxa < 10)
        l.push({ icone: 'track_changes', titulo: 'Sobra baixa no mês', texto: `Sobra prevista de ${taxa}% das entradas. O ideal é ao menos 20%: olhe as maiores categorias.` });
      else if (taxa >= 20)
        l.push({ icone: 'savings', titulo: `Sobra de ${taxa}% prevista`, texto: `Que tal mandar ${moeda(r.saldo)} para um cofrinho logo que o salário cair?` });
      if (r.faturas / r.entradas > 0.4)
        l.push({ icone: 'credit_card', titulo: 'Cartão pesando', texto: `As faturas são ${pct(r.faturas, r.entradas)}% das entradas. Cuidado com novas parcelas.` });
    }

    const pequenos = s.gastosMes().filter((g) => g.valor < 30);
    if (pequenos.length >= 15)
      l.push({ icone: 'coffee', titulo: 'Gastos pequenos somam', texto: `${pequenos.length} gastos abaixo de R$ 30 somaram ${moeda(soma(pequenos, (g) => g.valor))} no mês.` });

    if (!s.orcamentos().length)
      l.push({ icone: 'flag', titulo: 'Defina orçamentos', texto: 'Com limites por categoria o app avisa antes de estourar.' });

    for (const c of s.cofrinhos()) {
      const g = s.guardadoPorCofrinho().get(c.id) ?? 0;
      const aporte = aporteMensal(c.meta, g, c.prazo, s.mes());
      if (aporte) l.push({ icone: c.icone, titulo: `Meta ${c.nome}`, texto: `Guarde ${moeda(aporte)} por mês para chegar no prazo.` });
    }

    const dia = new Date().getDate();
    l.push(GERAIS[dia % GERAIS.length]);
    return l;
  });

  constructor() {
    effect(() => this.notificarSistema(this.naoLidas()));
  }

  marcarLidas() {
    const ids = [...new Set([...this.lidas(), ...this.avisos().map((a) => a.id)])].slice(-300);
    this.lidas.set(ids);
    localStorage.setItem('cfp.lidas', JSON.stringify(ids));
  }

  readonly permissao = signal(typeof Notification !== 'undefined' ? Notification.permission : 'denied');

  async pedirPermissao() {
    if (typeof Notification === 'undefined') return;
    this.permissao.set(await Notification.requestPermission());
    this.notificarSistema(this.naoLidas());
  }

  private async notificarSistema(avisos: Aviso[]) {
    if (this.permissao() !== 'granted') return;
    const chave = `cfp.notificadas.${hoje()}`;
    const ja: string[] = JSON.parse(localStorage.getItem(chave) ?? '[]');
    const novos = avisos.filter((a) => a.nivel !== 'info' && !ja.includes(a.id));
    if (!novos.length) return;
    localStorage.setItem(chave, JSON.stringify([...ja, ...novos.map((a) => a.id)]));
    const reg = await navigator.serviceWorker?.getRegistration();
    for (const a of novos.slice(0, 3)) {
      const op = { body: a.texto, icon: 'icons/icon-192x192.png', tag: a.id };
      if (reg) reg.showNotification(a.titulo, op);
      else new Notification(a.titulo, op);
    }
  }
}
