import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { addMeses, hoje, mesAtual, mesesEntre } from '../core/datas';
import { historicoReajustes } from '../core/financas';
import { BrlPipe, MesPipe, parseValor, pct, soma } from '../core/formato';
import { Divida, Recorrencia } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';
import { Moeda } from '../shared/moeda';

interface FormDivida {
  id?: string;
  descricao: string;
  credor: string;
  valor_parcela: string;
  num_parcelas: number;
  pagas: number;
  inicio: string;
  dia: number;
  /** cria a conta fixa das parcelas (só no cadastro) */
  conta: boolean;
  recorrencia_id: string | null;
}

/** Dívidas e financiamentos: saldo devedor, quanto falta e quando termina */
@Component({
  imports: [Moeda, FormsModule, RouterLink, BrlPipe, MesPipe, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Dívidas</h1>
        <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" />Nova</button>
      </div>
      <p class="muted small">Financiamentos, empréstimos e acordos. Ligada a uma conta fixa, cada parcela paga em Contas avança aqui.</p>

      <div class="stats">
        <div class="stat"><div class="l">Saldo devedor</div><div class="v neg">{{ saldo() + boletoFalta() | brl }}</div></div>
        <div class="stat"><div class="l">Parcelas por mês</div><div class="v">{{ porMes() + boletoMes() | brl }}</div></div>
      </div>

      @if (boletos().length) {
        <section class="card">
          <div class="card-head"><h2>Parcelados no boleto/débito</h2><a routerLink="/parcelamentos" class="small">Parcelamentos</a></div>
          <p class="small muted">Compras e empréstimos lançados como parcelado fora do cartão. Cada parcela aparece em Contas no dia dela; não precisa cadastrar de novo aqui.</p>
          @for (b of boletos(); track b.id) {
            <div class="row">
              <span class="ico"><app-icon name="event_repeat" /></span>
              <div class="grow"><div class="t">{{ b.descricao }}</div><div class="s">{{ b.faltam }} de {{ b.num }} parcelas a vencer · termina em {{ b.fim | mes }}</div></div>
              <span class="v">{{ b.falta | brl }}</span>
            </div>
          }
        </section>
      }

      <div class="grade-cards">
      @for (d of lista(); track d.d.id) {
        <article class="card">
          <div class="cab">
            <span class="ico"><app-icon name="account_balance" /></span>
            <button type="button" class="grow txt" (click)="editar(d.d)">
              <b>{{ d.d.descricao }}</b>
              <span class="small muted">{{ d.d.credor || 'Sem credor' }} · {{ d.d.num_parcelas }}x de {{ d.d.valor_parcela | brl }}{{ d.conta ? ' · conta fixa' : '' }}</span>
            </button>
            @if (!d.conta && d.pagas < d.d.num_parcelas) {
              <button class="btn ghost sm" type="button" (click)="pagarUma(d.d)">+1 paga</button>
            }
          </div>
          <div class="bar"><i [style.width.%]="d.pct"></i></div>
          <div class="info small muted">
            <span>{{ d.pagas }}/{{ d.d.num_parcelas }} pagas</span>
            @if (d.pagas < d.d.num_parcelas) {
              <span>Falta <b class="num">{{ d.falta | brl }}</b> · termina em {{ d.fim | mes }}</span>
            } @else {
              <span class="pos">Quitada</span>
            }
          </div>
        </article>
      } @empty {
        <div class="card empty">
          <app-icon class="big" name="account_balance" [size]="40" />
          <p>Nenhuma dívida cadastrada.</p>
        </div>
      }
      </div>
    </div>

    <app-sheet [(open)]="aberto" [titulo]="f.id ? 'Editar dívida' : 'Nova dívida'">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Descrição</span><input name="d" [(ngModel)]="f.descricao" placeholder="Ex.: Financiamento do carro" /></label>
        <label class="field"><span>Credor (opcional)</span><input name="c" [(ngModel)]="f.credor" placeholder="Ex.: Banco X" /></label>
        <div class="grid2">
          <label class="field"><span>Valor da parcela</span><input name="v" moeda inputmode="numeric" [(ngModel)]="f.valor_parcela" placeholder="0,00" /></label>
          <label class="field"><span>Nº de parcelas</span><input name="n" type="number" min="1" [(ngModel)]="f.num_parcelas" /></label>
        </div>
        <div class="grid2">
          <label class="field"><span>1ª parcela</span><input name="i" type="month" [(ngModel)]="f.inicio" /></label>
          <label class="field"><span>Já pagas antes</span><input name="p" type="number" min="0" [(ngModel)]="f.pagas" /></label>
        </div>
        @if (!f.id) {
          <label class="check"><input name="cf" type="checkbox" [(ngModel)]="f.conta" />Criar conta fixa das parcelas (entra em Contas)</label>
          @if (f.conta) {
            <label class="field"><span>Dia do vencimento</span><input name="dia" type="number" min="1" max="31" [(ngModel)]="f.dia" /></label>
          } @else {
            <label class="field"><span>Ligar a uma conta fixa (opcional)</span>
              <select name="r" [(ngModel)]="f.recorrencia_id">
                <option [ngValue]="null">Nenhuma: marco as pagas aqui</option>
                @for (r of contas(); track r.id) { <option [ngValue]="r.id">{{ r.descricao }} ({{ r.valor | brl }})</option> }
              </select>
            </label>
          }
        } @else if (f.recorrencia_id) {
          <label class="field"><span>Dia do vencimento</span><input name="dia" type="number" min="1" max="31" [(ngModel)]="f.dia" /></label>
          <p class="small muted">Mudar a 1ª parcela, o nº de parcelas, o valor ou o dia acerta também a conta fixa ligada.</p>
        }
        <button class="btn block" [disabled]="salvando()">Salvar</button>
        @if (f.id) {
          <button class="btn danger block" type="button" (click)="excluir()">Excluir</button>
        }
      </form>
    </app-sheet>
  `,
  styles: `
    .cab { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
    .txt { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; display: flex; flex-direction: column; min-width: 0; }
    .txt b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .info { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
  `,
})
export default class Dividas {
  protected s = inject(Store);
  private toast = inject(Toast);

  protected aberto = signal(false);
  protected salvando = signal(false);
  /** parcelas pagas em Contas por conta fixa ligada */
  private pagasConta = signal(new Map<string, number>());
  f: FormDivida = this.vazio();

  protected contas = computed(() => this.s.recorrencias().filter((r) => r.tipo === 'conta' && !r.fim));

  protected lista = computed(() =>
    this.s.dividas().map((d) => {
      const daConta = soma(this.cadeia(d.recorrencia_id), (id) => this.pagasConta().get(id) ?? 0);
      const pagas = Math.min(d.num_parcelas, d.pagas + daConta);
      return {
        d,
        pagas,
        conta: !!d.recorrencia_id,
        pct: pct(pagas, d.num_parcelas),
        falta: (d.num_parcelas - pagas) * d.valor_parcela,
        fim: addMeses(d.inicio, d.num_parcelas - 1),
      };
    }),
  );
  protected ativas = computed(() => this.lista().filter((x) => x.pagas < x.d.num_parcelas));
  protected saldo = computed(() => soma(this.ativas(), (x) => x.falta));
  protected porMes = computed(() => soma(this.ativas(), (x) => x.d.valor_parcela));

  /** conta fixa reajustada vira outra: os pagamentos ficam espalhados pela cadeia */
  private cadeia(id: string | null) {
    return id ? historicoReajustes(this.s.recorrencias(), id).map((r) => r.id) : [];
  }

  /** parcelas futuras de parcelamentos fora do cartão (o mesmo empréstimo não precisa virar dívida) */
  private parcBoleto = signal<{ parcelamento_id: string; descricao: string; valor: number; data: string }[]>([]);
  protected boletos = computed(() => {
    const m = new Map<string, { id: string; descricao: string; num: number; faltam: number; falta: number; fim: string; mes: number }>();
    for (const g of this.parcBoleto()) {
      const a = m.get(g.parcelamento_id) ?? { id: g.parcelamento_id, descricao: g.descricao.replace(/\s*\(\d+\/\d+\)$/, ''), num: 0, faltam: 0, falta: 0, fim: g.data, mes: g.valor };
      a.faltam++;
      a.falta += g.valor;
      if (g.data > a.fim) a.fim = g.data;
      a.num = Number(g.descricao.match(/\/(\d+)\)$/)?.[1] ?? a.faltam);
      m.set(g.parcelamento_id, a);
    }
    return [...m.values()];
  });
  protected boletoFalta = computed(() => soma(this.boletos(), (b) => b.falta));
  protected boletoMes = computed(() => soma(this.boletos(), (b) => b.mes));

  private async carregarBoletos() {
    try {
      this.parcBoleto.set(await q(
        supabase.from('gastos').select('parcelamento_id, descricao, valor, data').eq('carteira_id', this.s.carteiraId()!).eq('forma', 'debito')
          .not('parcela', 'is', null).gte('data', hoje()).order('data'),
      ));
    } catch (e) {
      this.toast.erro(e);
    }
  }

  constructor() {
    effect(() => {
      this.s.mudou();
      if (this.s.carteiraId()) untracked(() => this.carregarBoletos());
    });
    effect(() => {
      const ids = this.s.dividas().flatMap((d) => this.cadeia(d.recorrencia_id));
      this.s.mudou();
      if (ids.length) untracked(() => this.carregarPagas(ids));
    });
  }

  private async carregarPagas(ids: string[]) {
    try {
      const l = await q<{ ref_id: string }[]>(
        supabase.from('pagamentos').select('ref_id').eq('tipo', 'recorrencia').in('ref_id', ids).not('pago_em', 'is', null),
      );
      const m = new Map<string, number>();
      for (const p of l) m.set(p.ref_id, (m.get(p.ref_id) ?? 0) + 1);
      this.pagasConta.set(m);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  private vazio(): FormDivida {
    return { descricao: '', credor: '', valor_parcela: '', num_parcelas: 12, pagas: 0, inicio: mesAtual().slice(0, 7), dia: 10, conta: true, recorrencia_id: null };
  }

  novo() {
    this.f = this.vazio();
    this.aberto.set(true);
  }

  editar(d: Divida) {
    this.f = {
      id: d.id, descricao: d.descricao, credor: d.credor ?? '', valor_parcela: String(d.valor_parcela).replace('.', ','), num_parcelas: d.num_parcelas,
      pagas: d.pagas, inicio: d.inicio.slice(0, 7), dia: this.cadeia(d.recorrencia_id).map((id) => this.s.recorrencias().find((r) => r.id === id)!).at(-1)?.dia ?? 10,
      conta: false, recorrencia_id: d.recorrencia_id,
    };
    this.aberto.set(true);
  }

  async salvar() {
    const f = this.f;
    const valor = parseValor(f.valor_parcela);
    const n = Math.round(+f.num_parcelas);
    if (!f.descricao.trim() || !valor || !(n > 0) || !f.inicio) return this.toast.erro('Preencha descrição, parcela, nº de parcelas e início');
    const inicio = `${f.inicio}-01`;
    this.salvando.set(true);
    try {
      let rec = f.recorrencia_id;
      // conta fixa só cobre as parcelas que faltam: começa depois das já pagas
      if (!f.id && f.conta) {
        const ini = addMeses(inicio, Math.max(0, +f.pagas || 0));
        rec = await this.s.salvar('recorrencias', {
          tipo: 'conta', descricao: f.descricao.trim(), valor, dia: Math.min(31, Math.max(1, +f.dia || 1)), categoria_id: null,
          inicio: ini, fim: addMeses(inicio, n - 1), ativo: true, cartao_id: null, variavel: false, paga_mes_anterior: false, beneficio_id: null,
        });
      }
      const antes = f.id ? this.s.dividas().find((d) => d.id === f.id) : undefined;
      if (antes?.recorrencia_id) await this.acertarConta(antes, { inicio, n, valor, pagas: Math.max(0, Math.round(+f.pagas || 0)), descricao: f.descricao.trim(), dia: +f.dia });
      await this.s.salvar('dividas', {
        id: f.id, descricao: f.descricao.trim(), credor: f.credor.trim() || null, valor_parcela: valor, num_parcelas: n,
        pagas: Math.max(0, Math.round(+f.pagas || 0)), inicio, recorrencia_id: rec,
      });
      this.aberto.set(false);
      this.toast.ok('Dívida salva');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  /**
   * Edição da dívida leva junto a conta fixa ligada. Criada pela dívida: início e fim recalculados; ligada a uma conta
   * que já existia: o início anda o mesmo tanto que a 1ª parcela (e as já pagas),
   * fim vai para a última parcela (se a conta tinha fim), valor e descrição só quando eram os da dívida.
   * Com reajustes, o início vale para a primeira versão e o fim para a última.
   */
  private async acertarConta(antes: Divida, d: { inicio: string; n: number; valor: number; pagas: number; descricao: string; dia: number }) {
    const porId = new Map(this.s.recorrencias().map((r) => [r.id, r]));
    const cadeia = this.cadeia(antes.recorrencia_id).map((id) => porId.get(id)!).filter(Boolean);
    if (!cadeia.length) return;
    const desloca = mesesEntre(antes.inicio, d.inicio) + d.pagas - antes.pagas;
    const fim = addMeses(d.inicio, d.n - 1);
    const dia = Math.min(31, Math.max(1, d.dia || cadeia.at(-1)!.dia));
    for (const [i, r] of cadeia.entries()) {
      const mud: Partial<Recorrencia> = {};
      // conta criada pela dívida (uma versão, com fim): início e fim saem direto da dívida, o que acerta também o que já ficou errado
      const daDivida = cadeia.length === 1 && !!r.fim;
      const inicio = daDivida ? addMeses(d.inicio, d.pagas) : addMeses(r.inicio, desloca);
      if (i === 0 && inicio !== r.inicio) {
        mud.inicio = inicio;
        await this.moverPagamentos(r.id, mesesEntre(r.inicio, inicio));
      }
      if (i === cadeia.length - 1 && r.fim && r.fim !== fim) mud.fim = fim;
      if (r.descricao === antes.descricao && d.descricao !== antes.descricao) mud.descricao = d.descricao;
      if (cadeia.length === 1 && !r.variavel && r.valor === antes.valor_parcela && d.valor !== antes.valor_parcela) mud.valor = d.valor;
      if (r.dia !== dia) mud.dia = dia;
      if ((mud.inicio ?? r.inicio) > (mud.fim ?? r.fim ?? '9999')) throw new Error('A conta fixa ficaria terminando antes de começar: confira a 1ª parcela e o nº de parcelas');
      if (Object.keys(mud).length) await this.s.salvar('recorrencias', { id: r.id, ...mud });
    }
  }

  /** Pagamentos marcados acompanham a conta que mudou de mês (do fim para o começo para não bater no mês ocupado) */
  private async moverPagamentos(refId: string, meses: number) {
    if (!meses) return;
    const l = await q<{ id: string; mes: string }[]>(supabase.from('pagamentos').select('id, mes').eq('tipo', 'recorrencia').eq('ref_id', refId));
    l.sort((a, b) => (meses > 0 ? b.mes.localeCompare(a.mes) : a.mes.localeCompare(b.mes)));
    for (const p of l) await q(supabase.from('pagamentos').update({ mes: addMeses(p.mes, meses) }).eq('id', p.id));
  }

  pagarUma(d: Divida) {
    return this.s.salvar('dividas', { id: d.id, pagas: d.pagas + 1 }).catch((e) => this.toast.erro(e));
  }

  excluir() {
    if (!this.f.id) return;
    this.s.excluirAdiado('dividas', this.f.id, 'Dívida excluída');
    this.aberto.set(false);
  }
}
