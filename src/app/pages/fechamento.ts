import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { addMeses, fimMes, hoje, mesAtual, nomeMes } from '../core/datas';
import { contasDoMes, noMes, orcamentosNoMes, porCategoria, resumoMes, statusOrcamentos } from '../core/financas';
import { BrlPipe, DiaPipe, MesPipe, pct, soma } from '../core/formato';
import { Entrada, Gasto, Pagamento } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Avatar } from '../shared/avatar';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';

/** Balanço de um mês já fechado: o anterior ao atual, ou o mês passado que estiver selecionado */
@Component({
  imports: [RouterLink, BrlPipe, DiaPipe, MesPipe, Icon, Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Fechamento</h1>
        <span class="acts"><span class="badge cap">{{ mes() | mes }}</span>
          <button class="btn ghost sm no-print" type="button" (click)="imprimir()" [disabled]="!f()"><app-icon name="picture_as_pdf" [size]="16" />PDF</button></span>
      </div>
      <p class="so-print small">{{ s.carteira()?.nome }} · gerado em {{ hojeTxt }}</p>

      @if (antes()) {
        <div class="card empty"><span class="big">🗓️</span>O primeiro fechamento sai quando {{ s.inicio()! | mes }} terminar.</div>
      } @else if (!f()) {
        <div class="card empty"><span class="big">⏳</span>Carregando...</div>
      }
      @if (!antes() && f(); as f) {
        <section class="card hero">
          <span class="small muted">Saldo de {{ mes() | mes }}</span>
          <b class="saldo num" [class.neg]="f.r.saldo < 0" [class.pos]="f.r.saldo >= 0">{{ f.r.saldo | brl }}</b>
          <div class="io">
            <span>Entradas <b class="pos num">{{ f.r.entradas | brl }}</b></span>
            <span>Saídas <b class="neg num">{{ f.r.saidas | brl }}</b></span>
          </div>
          @if (f.r.entradas > 0) {
            <span class="small muted">{{ f.r.saldo >= 0 ? 'Sobrou' : 'Faltou' }} {{ f.sobra < 0 ? -f.sobra : f.sobra }}% das entradas</span>
          }
          @if (f.variacao !== null) {
            <span class="small">Consumo <b [class.neg]="f.variacao > 0" [class.pos]="f.variacao <= 0">{{ f.variacao > 0 ? '↑' : '↓' }} {{ f.variacao < 0 ? -f.variacao : f.variacao }}%</b> em relação a {{ anterior() | mes }}</span>
          }
        </section>

        <section class="card combinado">
          <div class="card-head"><h2 class="tit"><app-icon name="handshake" [size]="20" />Combinado do mês</h2></div>
          <ul class="pauta small">
            <li>{{ f.r.saldo >= 0 ? 'Sobrou' : 'Faltou' }} <b class="num" [class.pos]="f.r.saldo >= 0" [class.neg]="f.r.saldo < 0">{{ (f.r.saldo < 0 ? -f.r.saldo : f.r.saldo) | brl }}</b> em {{ mes() | mes: true }}</li>
            @if (estourados().length) {
              <li>Orçamento estourado: {{ estourados().join(', ') }}</li>
            } @else if (f.orcamentos.length) {
              <li>Nenhum orçamento estourado</li>
            }
            @if (f.categorias.length) {
              <li>Mais gasto em {{ top3() }}</li>
            }
          </ul>
          @if (combinadoAnterior().length) {
            <div class="lembra small">
              <b>Combinado de {{ anterior() | mes: true }}</b>
              @for (c of combinadoAnterior(); track c.user_id) { <span>"{{ c.decisao }}" <span class="muted">· {{ s.nomeAutor(c.user_id) }}</span></span> }
            </div>
          }
          <div class="membros">
            @for (m of partes(); track m.id) {
              <div class="parte">
                <app-avatar [size]="28" [nome]="m.nome" [foto]="m.foto ?? null" />
                <div class="grow">
                  <span class="small"><b>{{ m.nome }}</b> · @if (m.f) { <span class="pos">✓ fechou</span> } @else { <span class="muted">pendente</span> }</span>
                  @if (m.f?.decisao) { <span class="small dec">{{ m.f!.decisao }}</span> }
                </div>
              </div>
            }
          </div>
          <label class="field no-print"><span>Nossa decisão para o próximo mês</span>
            <textarea rows="2" maxlength="500" placeholder="Ex.: menos delivery e guardar R$ 300" [value]="decisao()" (input)="decisao.set($any($event.target).value)"></textarea>
          </label>
          <button class="btn sm no-print" type="button" [disabled]="salvando()" (click)="fecharParte()">
            <app-icon name="check" [size]="16" />{{ minha() ? 'Atualizar minha parte' : 'Fechar minha parte' }}</button>
        </section>

        <section class="card">
          <div class="card-head"><h2 class="tit"><app-icon name="pending_actions" [size]="20" />Contas em aberto</h2></div>
          @for (c of f.abertas; track c.ref_id) {
            <div class="row">
              <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
              <div class="grow"><div class="t">{{ c.descricao }}</div><div class="s">Venceu {{ c.vencimento | dia }}</div></div>
              <span class="v neg">{{ c.valor | brl }}</span>
            </div>
          } @empty {
            <p class="ok"><app-icon name="check_circle" [size]="18" />Todas as contas foram pagas.</p>
          }
          @if (f.abertas.length) {
            <a class="btn ghost sm" routerLink="/contas" (click)="irContas()">Ver contas de {{ mes() | mes: true }}</a>
          }
        </section>

        <section class="card">
          <div class="card-head"><h2 class="tit"><app-icon name="flag" [size]="20" />Orçamentos</h2></div>
          @for (o of f.orcamentos; track o.orcamento.id) {
            <div class="lin"><span class="tit"><app-icon [name]="o.icone" [size]="16" [style.color]="o.cor" />{{ o.nome }}{{ o.pagamento ? ' · ' + o.pagamento : '' }}</span>
              <span class="badge" [class.perigo]="o.nivel === 'estourado'" [class.alerta]="o.nivel === 'alerta'" [class.ok]="o.nivel === 'ok'">{{ o.pct }}%</span></div>
          } @empty {
            <p class="muted small">Nenhum orçamento definido.</p>
          }
        </section>

        <section class="card">
          <div class="card-head"><h2 class="tit"><app-icon name="donut_large" [size]="20" />Para onde foi</h2></div>
          @for (c of f.categorias; track c.nome) {
            <div class="lin"><span class="tit"><app-icon [name]="c.icone" [size]="16" [style.color]="c.cor" />{{ c.nome }}</span><span class="num">{{ c.total | brl }} · {{ c.pct }}%</span></div>
          } @empty {
            <p class="muted small">Nenhum gasto no mês.</p>
          }
          @if (f.maiores.length) {
            <h3 class="sub">Maiores gastos</h3>
            @for (g of f.maiores; track g.id) {
              <div class="lin"><span>{{ g.descricao }} <span class="muted small">· {{ g.data | dia }}</span></span><span class="num">{{ g.valor | brl }}</span></div>
            }
          }
        </section>

        <section class="card">
          <div class="card-head"><h2 class="tit"><app-icon name="savings" [size]="20" />Cofrinhos</h2><a routerLink="/cofrinhos" class="small">Ver</a></div>
          @if (guardado() || retirado()) {
            <div class="lin"><span>Guardado no mês</span><b class="num pos">{{ guardado() | brl }}</b></div>
            @if (retirado()) { <div class="lin"><span>Retirado</span><b class="num neg">{{ retirado() | brl }}</b></div> }
          } @else {
            <p class="muted small">Nada foi guardado em {{ mes() | mes: true }}.</p>
          }
          @if (auto(); as a) {
            <p class="small muted"><app-icon name="autorenew" [size]="14" /> {{ a.pct }}% da sobra vai sozinha para {{ a.cofrinho }}.</p>
          }
          @if (f.r.saldo > 0 && s.cofrinhos().length && !sobraGuardada()) {
            <div class="sobra">
              <span class="small">Sobrou <b class="pos">{{ f.r.saldo | brl }}</b>. Guardar no cofrinho:</span>
              <div class="linha">
                <select [value]="cofrinho()" (change)="cofrinho.set($any($event.target).value)" aria-label="Cofrinho">
                  @for (c of s.cofrinhos(); track c.id) { <option [value]="c.id">{{ c.nome }}</option> }
                </select>
                <button class="btn sm" type="button" [disabled]="salvando()" (click)="guardarSobra(f.r.saldo)">Guardar</button>
              </div>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: `
    .acts { display: flex; align-items: center; gap: 8px; }
    .acts app-icon { margin-right: 4px; }
    .sobra { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); }
    .sobra .linha { display: flex; gap: 8px; }
    .sobra select { flex: 1; }
    .cap { text-transform: capitalize; }
    .hero { display: flex; flex-direction: column; gap: 6px; }
    .saldo { font-size: 2rem; font-weight: 800; letter-spacing: -0.03em; }
    .io { display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.9rem; color: var(--ink-2); }
    .lin { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 7px 0; font-size: 0.9rem; border-bottom: 1px solid var(--line); }
    .lin:last-child { border-bottom: 0; }
    .ok { display: flex; align-items: center; gap: 6px; color: var(--ok); font-weight: 600; }
    .sub { margin: 12px 0 2px; font-size: 0.8rem; color: var(--ink-2); }
    .combinado { display: flex; flex-direction: column; gap: 10px; }
    .pauta { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
    .lembra { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 12px; background: var(--card-2); }
    .membros { display: flex; flex-direction: column; gap: 8px; }
    .parte { display: flex; align-items: flex-start; gap: 8px; }
    .parte .grow { display: flex; flex-direction: column; min-width: 0; }
    .dec { color: var(--ink-2); white-space: pre-wrap; overflow-wrap: anywhere; }
    textarea { resize: vertical; }
  `,
})
export default class Fechamento {
  protected hojeTxt = new Date().toLocaleDateString('pt-BR');

  /** "Salvar como PDF" na janela de impressão do navegador */
  imprimir() {
    print();
  }

  protected s = inject(Store);
  private toast = inject(Toast);

  protected mes = computed(() => (this.s.mes() < mesAtual() ? this.s.mes() : addMeses(mesAtual(), -1)));
  protected anterior = computed(() => addMeses(this.mes(), -1));
  protected antes = computed(() => this.s.antesDoInicio(this.mes()));
  private dados = signal<{ gastos: Gasto[]; entradas: Entrada[]; pagamentos: Pagamento[] } | null>(null);
  private req = 0;

  protected f = computed(() => {
    const d = this.dados();
    if (!d) return null;
    const mes = this.mes();
    const rec = this.s.recorrenciasPrev();
    const contas = contasDoMes(mes, rec, this.s.cartoes(), d.gastos, d.pagamentos, this.s.catMap());
    const r = resumoMes(mes, d.gastos, soma(d.entradas.filter((e) => noMes(e.data, mes)), (e) => e.valor), rec, contas, d.pagamentos);
    const doMes = d.gastos.filter((g) => noMes(g.data, mes));
    const ant = soma(d.gastos.filter((g) => noMes(g.data, this.anterior())), (g) => g.valor);
    return {
      r,
      sobra: pct(r.saldo, r.entradas),
      variacao: ant > 0 && !this.s.antesDoInicio(this.anterior()) ? Math.round((r.consumo / ant - 1) * 100) : null,
      abertas: contas.filter((c) => !c.pago && !c.beneficio_id),
      orcamentos: statusOrcamentos(orcamentosNoMes(this.s.orcamentos(), this.s.orcamentoValores(), mes, this.s.orcamentoFechados()), d.gastos, mes, this.s.catMap(), this.s.cartoes()),
      categorias: porCategoria(doMes, this.s.catMap()).slice(0, 5),
      maiores: [...doMes].sort((a, b) => b.valor - a.valor).slice(0, 3),
    };
  });

  private movs = computed(() => this.s.cofrinhoMovs().filter((m) => noMes(m.data, this.mes())));
  protected cofrinho = signal('');
  protected salvando = signal(false);
  private descSobra = computed(() => `Sobra de ${nomeMes(this.mes())}`);
  protected sobraGuardada = computed(() => this.s.cofrinhoMovs().some((m) => m.descricao === this.descSobra()));

  async guardarSobra(valor: number) {
    const id = this.cofrinho() || this.s.cofrinhos()[0]?.id;
    if (!id) return;
    this.salvando.set(true);
    try {
      await this.s.salvar('cofrinho_movs', { cofrinho_id: id, valor: Math.round(valor * 100) / 100, data: hoje(), descricao: this.descSobra() });
      this.toast.ok('Sobra guardada');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  /** Ritual do fechamento: pauta, combinado anterior e a parte de cada membro */
  protected estourados = computed(() => (this.f()?.orcamentos ?? []).filter((o) => o.nivel === 'estourado').map((o) => o.nome));
  protected top3 = computed(() => (this.f()?.categorias ?? []).slice(0, 3).map((c) => c.nome).join(', '));
  private doMes = computed(() => this.s.fechamentos().filter((x) => x.mes === this.mes()));
  protected combinadoAnterior = computed(() => this.s.fechamentos().filter((x) => x.mes === this.anterior() && x.decisao));
  protected minha = computed(() => this.doMes().find((x) => x.user_id === this.s.eu()) ?? null);
  protected partes = computed(() => this.s.membros().map((m) => ({ id: m.user_id, nome: m.nome, foto: m.foto, f: this.doMes().find((x) => x.user_id === m.user_id) })));
  private minhaDecisao = computed(() => `${this.mes()}|${this.minha()?.decisao ?? ''}`);
  protected decisao = signal('');

  async fecharParte() {
    const eu = this.s.eu();
    if (!eu) return;
    this.salvando.set(true);
    try {
      const decisao = this.decisao().trim().slice(0, 500) || null;
      await q(supabase.from('fechamentos').upsert({ carteira_id: this.s.carteiraId(), mes: this.mes(), user_id: eu, decisao }, { onConflict: 'carteira_id,mes,user_id' }));
      await this.s.recarregar('fechamentos');
      this.toast.ok('Sua parte do fechamento foi registrada');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  /** sobra automática configurada na carteira */
  protected auto = computed(() => {
    const c = this.s.carteira();
    if (!c?.sobra_cofrinho || !c.sobra_pct) return null;
    return { pct: c.sobra_pct, cofrinho: this.s.cofrinhos().find((x) => x.id === c.sobra_cofrinho)?.nome ?? 'o cofrinho' };
  });

  protected guardado = computed(() => soma(this.movs().filter((m) => m.valor > 0), (m) => m.valor));
  protected retirado = computed(() => -soma(this.movs().filter((m) => m.valor < 0), (m) => m.valor));

  constructor() {
    effect(() => {
      this.minhaDecisao();
      untracked(() => this.decisao.set(this.minha()?.decisao ?? ''));
    });
    effect(() => {
      const mes = this.mes();
      this.s.mudou();
      if (!this.s.carteiraId()) return;
      untracked(() => this.carregar(addMeses(mes, -1), fimMes(mes)));
    });
  }

  private async carregar(ini: string, fim: string) {
    const r = ++this.req;
    try {
      const d = await this.s.historico(ini, fim);
      if (r === this.req) this.dados.set(d);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  irContas() {
    this.s.mes.set(this.mes());
  }
}
