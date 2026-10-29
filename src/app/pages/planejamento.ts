import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addMeses, fimMes, mesAtual, nomeMes } from '../core/datas';
import { contasDoMes, noMes, orcamentosNoMes, proximosMeses, resumoMes, statusOrcamentos } from '../core/financas';
import { BrlPipe, MesPipe, parseValor, soma } from '../core/formato';
import { Entrada, Gasto, Pagamento, Plano } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Barras, Coluna } from '../shared/graficos';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

interface FormPlano {
  id?: string;
  tipo: 'entrada' | 'saida';
  descricao: string;
  valor: string;
  mes: string;
}

@Component({
  imports: [BrlPipe, MesPipe, FormsModule, Sheet, Icon, Barras],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Planejamento</h1>
        <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" /> Evento</button>
      </div>
      <p class="muted small">Projeção de 12 meses a partir de {{ s.mes() | mes }} com contas fixas, salário, parcelas no cartão e eventos planejados.</p>

      <label class="card check">
        <input type="checkbox" [checked]="estimar()" (change)="estimar.set(!estimar())" />
        <span>Incluir gastos do dia a dia <span class="muted small">(média {{ media() | brl }}/mês dos últimos 3 meses)</span></span>
      </label>

      @if (!dados()) {
        <div class="card empty"><span class="big">⏳</span>Carregando...</div>
      } @else {
        <div class="stats">
          <div class="stat"><div class="l">Acumulado em 12 meses</div><div class="v" [class.neg]="final() < 0" [class.pos]="final() >= 0">{{ final() | brl }}</div></div>
          @if (pior(); as p) {
            <div class="stat"><div class="l">Pior mês</div><div class="v cap" [class.neg]="p.saldo < 0">{{ p.mes | mes: true }} · {{ p.saldo | brl }}</div></div>
          }
        </div>

        <section class="card">
          <div class="card-head"><h2>Entradas x saídas previstas</h2></div>
          <app-barras [colunas]="colunas()" />
        </section>

        <section class="card">
          <div class="list">
            @for (m of projecao(); track m.mes) {
              <button type="button" class="row" (click)="aberto.set(aberto() === m.mes ? null : m.mes)">
                <div class="grow">
                  <div class="t cap">{{ m.mes | mes }}</div>
                  <div class="s">+{{ m.entradas | brl }} · −{{ m.saidas | brl }}</div>
                </div>
                <div class="v">
                  <span [class.neg]="m.saldo < 0" [class.pos]="m.saldo >= 0">{{ m.saldo | brl }}</span>
                  <div class="s" [class.neg]="m.acumulado < 0">acum. {{ m.acumulado | brl }}</div>
                </div>
              </button>
              @if (aberto() === m.mes) {
                <div class="det">
                  <div><span>Entradas fixas</span><b>{{ m.fixas | brl }}</b></div>
                  <div><span>Entradas lançadas</span><b>{{ m.avulsas | brl }}</b></div>
                  <div><span>Contas fixas</span><b>{{ m.contas | brl }}</b></div>
                  <div><span>Faturas de cartão</span><b>{{ m.faturas | brl }}</b></div>
                  <div><span>Débitos já lançados</span><b>{{ m.debitos | brl }}</b></div>
                  @if (m.reservado) {
                    <div><span>Reservado em orçamentos</span><b>{{ m.reservado | brl }}</b></div>
                  }
                  @if (estimar()) {
                    <div><span>Gastos do dia a dia (estimativa)</span><b>{{ m.variavel | brl }}</b></div>
                  }
                  @for (p of m.planos; track p.id) {
                    <button type="button" class="plano" (click)="editar(p)">
                      <span class="tit"><app-icon [name]="p.tipo === 'entrada' ? 'add' : 'remove'" [size]="16" />{{ p.descricao }}</span>
                      <b [class.pos]="p.tipo === 'entrada'" [class.neg]="p.tipo === 'saida'">{{ p.valor | brl }}</b>
                    </button>
                  }
                  <div class="bts">
                    <button class="btn ghost sm" type="button" (click)="novo(m.mes)">+ Evento em {{ m.mes | mes: true }}</button>
                    <button class="btn ghost sm" type="button" (click)="copiar(m.mes)"><app-icon name="content_copy" [size]="16" />Copiar de {{ anterior(m.mes) | mes: true }}</button>
                  </div>
                </div>
              }
            }
          </div>
        </section>
      }
    </div>

    <app-sheet [(open)]="sheet" [titulo]="form.id ? 'Editar evento' : 'Novo evento'">
      <form class="form" (ngSubmit)="salvar()">
        <div class="seg">
          <button type="button" [class.on]="form.tipo === 'saida'" (click)="form.tipo = 'saida'">Saída</button>
          <button type="button" [class.on]="form.tipo === 'entrada'" (click)="form.tipo = 'entrada'">Entrada</button>
        </div>
        <label class="field"><span>Descrição</span><input name="descricao" [(ngModel)]="form.descricao" placeholder="Ex.: IPVA, 13º, viagem" /></label>
        <div class="grid2">
          <label class="field"><span>Valor</span><input name="valor" inputmode="decimal" [(ngModel)]="form.valor" placeholder="0,00" /></label>
          <label class="field"><span>Mês</span><input name="mes" type="month" [(ngModel)]="form.mes" /></label>
        </div>
        <button class="btn block" type="submit">Salvar</button>
        @if (form.id) {
          <button class="btn danger block" type="button" (click)="excluir()">Excluir</button>
        }
      </form>
    </app-sheet>
  `,
  styles: `
    .cap { text-transform: capitalize; }
    .check { cursor: pointer; }
    .det { display: flex; flex-direction: column; gap: 6px; padding: 4px 0 14px; border-bottom: 1px solid var(--line); font-size: 0.88rem; }
    .det > div, .plano { display: flex; justify-content: space-between; gap: 8px; }
    .det span { color: var(--ink-2); }
    .det b { font-variant-numeric: tabular-nums; }
    .plano { background: var(--card-2); border: 0; border-radius: 10px; padding: 8px 10px; font: inherit; color: inherit; cursor: pointer; text-align: left; }
    .plano span { color: var(--ink); }
    .bts { display: flex; gap: 8px; flex-wrap: wrap; }
  `,
})
export default class Planejamento {
  protected s = inject(Store);
  private toast = inject(Toast);

  protected estimar = signal(localStorage.getItem('cfp.plan.estimar') !== '0');
  protected aberto = signal<string | null>(null);
  protected dados = signal<{ gastos: Gasto[]; entradas: Entrada[]; pagamentos: Pagamento[] } | null>(null);
  protected planos = signal<Plano[]>([]);
  protected sheet = signal(false);
  protected form: FormPlano = this.vazio();
  private req = 0;

  protected meses = computed(() => proximosMeses(this.s.mes(), 12));

  /** Média dos débitos não parcelados dos 3 meses anteriores */
  protected media = computed(() => {
    const d = this.dados();
    if (!d) return 0;
    const ini = addMeses(this.s.mes(), -3);
    const fim = fimMes(addMeses(this.s.mes(), -1));
    return soma(d.gastos.filter((g) => g.forma === 'debito' && !g.parcelamento_id && g.data >= ini && g.data <= fim), (g) => g.valor) / 3;
  });

  protected projecao = computed(() => {
    const d = this.dados();
    if (!d) return [];
    const rec = this.s.recorrenciasPrev();
    const estimar = this.estimar();
    const media = this.media();
    let acumulado = 0;
    return this.meses().map((mes) => {
      const contas = contasDoMes(mes, rec, this.s.cartoes(), d.gastos, d.pagamentos, this.s.catMap());
      const avulsas = soma(d.entradas.filter((e) => noMes(e.data, mes)), (e) => e.valor);
      // orçamentos com reserva: o que falta gastar do limite entra como saída
      const orc = statusOrcamentos(orcamentosNoMes(this.s.orcamentos(), this.s.orcamentoValores(), mes, this.s.orcamentoFechados()), d.gastos, mes, this.s.catMap(), this.s.cartoes(), mesAtual());
      const reservado = soma(orc, (o) => o.reservado);
      const r = resumoMes(mes, d.gastos, avulsas, rec, contas, d.pagamentos, reservado);
      const planos = this.planos().filter((p) => p.mes === mes);
      const pe = soma(planos.filter((p) => p.tipo === 'entrada'), (p) => p.valor);
      const ps = soma(planos.filter((p) => p.tipo === 'saida'), (p) => p.valor);
      const lancadosVariaveis = soma(d.gastos.filter((g) => g.forma === 'debito' && !g.parcelamento_id && noMes(g.data, mes)), (g) => g.valor);
      // reserva no débito já cobre parte do dia a dia estimado
      const reservaDebito = soma(orc.filter((o) => o.orcamento.forma === 'debito'), (o) => o.reservado);
      const variavel = estimar ? Math.max(media - lancadosVariaveis - reservaDebito, 0) : 0;
      const entradas = r.entradas + pe;
      const saidas = r.saidas + ps + variavel;
      const saldo = entradas - saidas;
      acumulado += saldo;
      return {
        mes, planos, entradas, saidas, saldo, acumulado, variavel,
        reservado, fixas: r.entradasFixas, avulsas: r.entradasAvulsas, contas: r.contasFixas, faturas: r.faturas, debitos: r.avista,
      };
    });
  });

  protected final = computed(() => this.projecao().at(-1)?.acumulado ?? 0);
  protected pior = computed(() => {
    const l = this.projecao();
    return l.length ? l.reduce((m, x) => (x.saldo < m.saldo ? x : m)) : null;
  });
  protected colunas = computed<Coluna[]>(() =>
    this.projecao().map((m) => ({ rotulo: nomeMes(m.mes, true), a: m.entradas, b: m.saidas })),
  );

  constructor() {
    effect(() => {
      const ms = this.meses();
      this.s.mudou();
      if (!this.s.carteiraId()) return;
      untracked(() => this.carregar(ms[0], ms[ms.length - 1]));
    });
    effect(() => localStorage.setItem('cfp.plan.estimar', this.estimar() ? '1' : '0'));
  }

  private async carregar(ini: string, ultimo: string) {
    const r = ++this.req;
    try {
      const [d] = await Promise.all([this.s.historico(addMeses(ini, -3), fimMes(ultimo)), this.carregarPlanos(ini, ultimo)]);
      if (r === this.req) this.dados.set(d);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  private async carregarPlanos(ini = this.meses()[0], ultimo = this.meses()[11]) {
    this.planos.set(
      await q<Plano[]>(
        supabase.from('planos').select('*').eq('carteira_id', this.s.carteiraId()!).gte('mes', ini).lte('mes', ultimo).order('valor', { ascending: false }),
      ),
    );
  }

  private vazio(mes = this.s.mes()): FormPlano {
    return { tipo: 'saida', descricao: '', valor: '', mes: mes.slice(0, 7) };
  }

  novo(mes?: string) {
    this.form = this.vazio(mes);
    this.sheet.set(true);
  }

  editar(p: Plano) {
    this.form = { id: p.id, tipo: p.tipo, descricao: p.descricao, valor: String(p.valor).replace('.', ','), mes: p.mes.slice(0, 7) };
    this.sheet.set(true);
  }

  async salvar() {
    const f = this.form;
    const valor = parseValor(f.valor);
    if (!f.descricao.trim() || !valor || !f.mes) return this.toast.erro('Preencha descrição, valor e mês');
    try {
      await this.s.salvar('planos', { id: f.id, tipo: f.tipo, descricao: f.descricao.trim(), valor, mes: `${f.mes}-01` });
      await this.carregarPlanos();
      this.sheet.set(false);
      this.toast.ok('Evento salvo');
    } catch (e) {
      this.toast.erro(e);
    }
  }

  protected anterior = (mes: string) => addMeses(mes, -1);

  /** Repete no mês os eventos do mês anterior (os de mesma descrição já existentes ficam) */
  async copiar(mes: string) {
    const ant = addMeses(mes, -1);
    const id = this.s.carteiraId()!;
    try {
      const l = await q<Plano[]>(supabase.from('planos').select('*').eq('carteira_id', id).eq('mes', ant));
      const ja = new Set(this.planos().filter((p) => p.mes === mes).map((p) => p.descricao.toLowerCase()));
      const novos = l.filter((p) => !ja.has(p.descricao.toLowerCase()));
      if (!novos.length) return this.toast.erro(l.length ? 'Os eventos já estão neste mês' : `Nenhum evento em ${nomeMes(ant)}`);
      await q(supabase.from('planos').insert(novos.map((p) => ({ carteira_id: id, tipo: p.tipo, descricao: p.descricao, valor: p.valor, mes }))));
      await this.carregarPlanos();
      this.toast.ok(novos.length === 1 ? '1 evento copiado' : `${novos.length} eventos copiados`);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  excluir() {
    const id = this.form.id;
    if (!id) return;
    this.planos.update((l) => l.filter((p) => p.id !== id));
    this.s.excluirAdiado('planos', id, 'Evento excluído', () => this.carregarPlanos());
    this.sheet.set(false);
  }
}
