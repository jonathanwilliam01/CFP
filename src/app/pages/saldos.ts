import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { diffDias, hoje, mesAtual } from '../core/datas';
import { ativaNoMes } from '../core/financas';
import { BrlPipe, DiaPipe, parseValor, soma } from '../core/formato';
import { ContaBancaria } from '../core/models';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

interface FormConta {
  id?: string;
  nome: string;
  saldo: string;
  cor: string;
  ativo: boolean;
}

/** Saldo real nos bancos e quanto deve sobrar no fim do mês pelo que falta pagar e receber */
@Component({
  imports: [FormsModule, BrlPipe, DiaPipe, Icon, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Saldos bancários</h1>
        <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" />Conta</button>
      </div>
      <p class="muted small">Informe o saldo que aparece no app de cada banco. O CFP soma e mostra quanto deve sobrar no fim do mês.</p>

      <div class="stats">
        <div class="stat"><div class="l">Nos bancos hoje</div><div class="v" [class.neg]="total() < 0">{{ total() | brl }}</div></div>
        @if (doMesAtual()) {
          <div class="stat"><div class="l">Previsto no fim do mês</div><div class="v" [class.neg]="previsto() < 0" [class.pos]="previsto() >= 0">{{ previsto() | brl }}</div></div>
        }
      </div>

      @if (doMesAtual() && ativas().length) {
        <section class="card">
          <div class="card-head"><h2>Até o fim do mês</h2></div>
          <div class="lin"><span>Saldo nos bancos</span><b class="num">{{ total() | brl }}</b></div>
          <div class="lin"><span>Falta receber (entradas fixas)</span><b class="num pos">+{{ aReceber() | brl }}</b></div>
          <div class="lin"><span>Falta pagar (contas e faturas)</span><b class="num neg">−{{ s.resumo().aPagar | brl }}</b></div>
          @if (s.resumo().reservado) {
            <div class="lin"><span>Reservado em orçamentos</span><b class="num neg">−{{ s.resumo().reservado | brl }}</b></div>
          }
          <div class="lin tot"><span>Previsto</span><b class="num" [class.neg]="previsto() < 0">{{ previsto() | brl }}</b></div>
          <p class="small muted">O CFP prevê {{ s.resumo().saldo >= 0 ? 'sobra' : 'falta' }} de {{ abs(s.resumo().saldo) | brl }} no mês. Gastos do dia a dia ainda não lançados ficam de fora.</p>
        </section>
      } @else if (!doMesAtual()) {
        <p class="small muted">A previsão do fim do mês aparece no mês atual.</p>
      }

      <section class="card list">
        @for (c of s.contasBancarias(); track c.id) {
          <button type="button" class="row" [class.off]="!c.ativo" (click)="editar(c)">
            <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon name="account_balance" /></span>
            <div class="grow">
              <div class="t">{{ c.nome }}</div>
              <div class="s" [class.alerta]="velho(c)">Atualizado {{ c.atualizado_em | dia }}{{ velho(c) ? ' · confira' : '' }}{{ c.ativo ? '' : ' · inativa' }}</div>
            </div>
            <b class="v num" [class.neg]="c.saldo < 0">{{ c.saldo | brl }}</b>
          </button>
        } @empty {
          <p class="muted small vazio">Cadastre suas contas (Nubank, Itaú, carteira...) com o saldo de hoje.</p>
        }
      </section>
    </div>

    <app-sheet [(open)]="aberto" [titulo]="f.id ? 'Atualizar conta' : 'Nova conta bancária'">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Nome</span><input name="n" [(ngModel)]="f.nome" placeholder="Ex.: Nubank, Itaú, dinheiro" /></label>
        <div class="grid2">
          <label class="field"><span>Saldo hoje</span><input name="s" inputmode="decimal" [(ngModel)]="f.saldo" placeholder="0,00" /></label>
          <label class="field"><span>Cor</span><input name="c" type="color" [(ngModel)]="f.cor" /></label>
        </div>
        <label class="check"><input type="checkbox" name="a" [(ngModel)]="f.ativo" /> Ativa (soma no total)</label>
        <button class="btn block" [disabled]="salvando()">Salvar</button>
        @if (f.id) {
          <button class="btn danger block" type="button" (click)="excluir()">Excluir</button>
        }
      </form>
    </app-sheet>
  `,
  styles: `
    .lin { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 0.92rem; }
    .lin span { color: var(--ink-2); }
    .lin.tot { border-bottom: 0; font-weight: 700; }
    .row { background: none; border: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; width: 100%; }
    .row.off { opacity: 0.55; }
    .s.alerta { color: var(--warn, #d97706); }
    .vazio { padding: 12px 0; margin: 0; }
  `,
})
export default class Saldos {
  protected s = inject(Store);
  private toast = inject(Toast);

  protected aberto = signal(false);
  protected salvando = signal(false);
  f: FormConta = this.vazio();
  protected abs = Math.abs;

  protected ativas = computed(() => this.s.contasBancarias().filter((c) => c.ativo));
  protected total = computed(() => soma(this.ativas(), (c) => c.saldo));
  protected doMesAtual = computed(() => this.s.mes() === mesAtual());
  protected aReceber = computed(() => {
    const mes = this.s.mes();
    return soma(
      this.s.recorrencias().filter((r) => r.tipo === 'entrada' && !r.beneficio_id && ativaNoMes(r, mes) && !this.s.pagamentos().some((p) => p.ref_id === r.id && p.mes === mes)),
      (r) => r.valor,
    );
  });
  protected previsto = computed(() => this.total() + this.aReceber() - this.s.resumo().aPagar - this.s.resumo().reservado);

  velho(c: ContaBancaria) {
    return diffDias(c.atualizado_em, hoje()) > 7;
  }

  private vazio(): FormConta {
    return { nome: '', saldo: '', cor: '#0ea5e9', ativo: true };
  }

  novo() {
    this.f = this.vazio();
    this.aberto.set(true);
  }

  editar(c: ContaBancaria) {
    this.f = { id: c.id, nome: c.nome, saldo: String(c.saldo).replace('.', ','), cor: c.cor, ativo: c.ativo };
    this.aberto.set(true);
  }

  async salvar() {
    if (!this.f.nome.trim()) return this.toast.erro('Informe o nome');
    this.salvando.set(true);
    try {
      await this.s.salvar('contas_bancarias', { id: this.f.id, nome: this.f.nome.trim(), saldo: parseValor(this.f.saldo), cor: this.f.cor, ativo: this.f.ativo, atualizado_em: hoje() });
      this.aberto.set(false);
      this.toast.ok('Saldo atualizado');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  excluir() {
    if (!this.f.id) return;
    this.s.excluirAdiado('contas_bancarias', this.f.id, 'Conta excluída');
    this.aberto.set(false);
  }
}
