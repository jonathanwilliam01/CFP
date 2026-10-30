import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { mesAtual } from '../core/datas';
import { ativaNoMes, historicoReajustes } from '../core/financas';
import { BrlPipe, MesPipe, soma } from '../core/formato';
import { Recorrencia } from '../core/models';
import { Store } from '../core/store';
import { normalizar } from '../core/texto';
import { Icon } from '../shared/icon';

// serviços comuns, para quem não usa a categoria Assinaturas
const SERVICOS = /netflix|spotify|disney|hbo|\bmax\b|prime|amazon|youtube|deezer|apple|icloud|google|github|globoplay|paramount|crunchyroll|chatgpt|openai|claude|adobe|microsoft|office|xbox|playstation|psn|nintendo|claro|vivo|\btim\b|smart ?fit|academia|gympass|wellhub/i;

/** Contas fixas que são assinaturas: total por mês e por ano e mudanças de preço */
@Component({
  imports: [RouterLink, BrlPipe, MesPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Assinaturas</h1></div>
      <p class="muted small">Contas fixas da categoria Assinaturas ou de serviços conhecidos. O preço muda pelo reajuste da conta ou na importação da fatura.</p>

      <div class="stats">
        <div class="stat"><div class="l">Por mês</div><div class="v">{{ mensal() | brl }}</div></div>
        <div class="stat"><div class="l">Por ano</div><div class="v neg">{{ mensal() * 12 | brl }}</div></div>
      </div>

      <section class="card list">
        @for (a of lista(); track a.r.id) {
          <a class="row" routerLink="/contas">
            <span class="ico" [style.background]="a.cor + '22'" [style.color]="a.cor"><app-icon [name]="a.icone" /></span>
            <div class="grow">
              <div class="t">{{ a.r.descricao }}</div>
              <div class="s">
                {{ a.pagamento }} · {{ a.r.valor * 12 | brl }}/ano
                @if (a.antes; as an) {
                  · <span [class.neg]="a.r.valor > an.valor" [class.pos]="a.r.valor < an.valor">{{ a.r.valor > an.valor ? 'subiu' : 'baixou' }} {{ a.variacao }}% em {{ a.r.inicio | mes: true }}</span>
                }
              </div>
            </div>
            <div class="v">{{ a.r.valor | brl }}</div>
          </a>
        } @empty {
          <p class="muted small vazio">Nenhuma assinatura encontrada. Cadastre como conta fixa na categoria Assinaturas.</p>
        }
      </section>

      @if (sugestoes().length) {
        <section class="card">
          <div class="card-head"><h2>Parecem assinaturas</h2><a class="btn ghost sm" routerLink="/contas">Ver em Contas</a></div>
          @for (x of sugestoes(); track x.chave) {
            <div class="lin"><span>{{ x.descricao }}</span><b class="num">{{ x.valor | brl }}</b></div>
          }
        </section>
      }
    </div>
  `,
  styles: `
    .vazio { padding: 12px 0; margin: 0; }
    .lin { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; font-size: 0.92rem; }
  `,
})
export default class Assinaturas {
  protected s = inject(Store);

  private eAssinatura = (descricao: string, categoria: string | null) => {
    const cat = categoria ? normalizar(this.s.catMap().get(categoria)?.nome ?? '') : '';
    return cat.startsWith('assinatura') || SERVICOS.test(descricao);
  };

  protected lista = computed(() => {
    const atual = mesAtual();
    const cartoes = new Map(this.s.cartoes().map((c) => [c.id, c.nome]));
    return this.s.recorrencias()
      .filter((r) => r.tipo === 'conta' && (ativaNoMes(r, atual) || r.inicio > atual) && !this.substituida(r) && this.eAssinatura(r.descricao, r.categoria_id))
      .map((r) => {
        const cadeia = historicoReajustes(this.s.recorrencias(), r.id);
        const antes: Recorrencia | undefined = cadeia.at(-2);
        const cat = r.categoria_id ? this.s.catMap().get(r.categoria_id) : undefined;
        return {
          r,
          antes,
          variacao: antes ? Math.abs(Math.round((r.valor / antes.valor - 1) * 1000) / 10) : 0,
          icone: cat?.icone ?? 'subscriptions',
          cor: cat?.cor ?? '#8b5cf6',
          pagamento: r.cartao_id ? `Cartão ${cartoes.get(r.cartao_id) ?? ''}` : r.beneficio_id ? 'Benefício' : 'Débito/boleto',
        };
      })
      .sort((a, b) => b.r.valor - a.r.valor);
  });

  protected mensal = computed(() => soma(this.lista(), (a) => a.r.valor));
  protected sugestoes = computed(() => this.s.sugestoesFixas().filter((x) => this.eAssinatura(x.descricao, x.categoria_id)));

  private substituida(r: Recorrencia) {
    return this.s.recorrencias().some((x) => x.reajuste_de === r.id);
  }
}
