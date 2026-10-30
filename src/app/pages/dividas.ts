import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addMeses, mesAtual } from '../core/datas';
import { historicoReajustes } from '../core/financas';
import { BrlPipe, MesPipe, parseValor, pct, soma } from '../core/formato';
import { Divida } from '../core/models';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

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
  imports: [FormsModule, BrlPipe, MesPipe, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Dívidas</h1>
        <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" />Nova</button>
      </div>
      <p class="muted small">Financiamentos, empréstimos e acordos. Ligada a uma conta fixa, cada parcela paga em Contas avança aqui.</p>

      <div class="stats">
        <div class="stat"><div class="l">Saldo devedor</div><div class="v neg">{{ saldo() | brl }}</div></div>
        <div class="stat"><div class="l">Parcelas por mês</div><div class="v">{{ porMes() | brl }}</div></div>
      </div>

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

    <app-sheet [(open)]="aberto" [titulo]="f.id ? 'Editar dívida' : 'Nova dívida'">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Descrição</span><input name="d" [(ngModel)]="f.descricao" placeholder="Ex.: Financiamento do carro" /></label>
        <label class="field"><span>Credor (opcional)</span><input name="c" [(ngModel)]="f.credor" placeholder="Ex.: Banco X" /></label>
        <div class="grid2">
          <label class="field"><span>Valor da parcela</span><input name="v" inputmode="decimal" [(ngModel)]="f.valor_parcela" placeholder="0,00" /></label>
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

  constructor() {
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
      pagas: d.pagas, inicio: d.inicio.slice(0, 7), dia: 10, conta: false, recorrencia_id: d.recorrencia_id,
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

  pagarUma(d: Divida) {
    return this.s.salvar('dividas', { id: d.id, pagas: d.pagas + 1 }).catch((e) => this.toast.erro(e));
  }

  excluir() {
    if (!this.f.id) return;
    this.s.excluirAdiado('dividas', this.f.id, 'Dívida excluída');
    this.aberto.set(false);
  }
}
