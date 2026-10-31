import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { atualizarTaxas, taxasBcb } from '../core/bcb';
import { hoje, inicioMes, mesAtual, mesFatura } from '../core/datas';
import { historicoReajustes } from '../core/financas';
import { BrlPipe, MesPipe, parseValor } from '../core/formato';
import { Recorrencia } from '../core/models';
import { Store } from '../core/store';
import { Toast } from './toast';

/** Reajuste de valor de conta ou entrada fixa a partir de um mês */
@Component({
  selector: 'app-reajuste',
  imports: [FormsModule, BrlPipe, MesPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // fica dentro do form da conta: Enter aqui aplicaria o form (valor antigo) em vez do reajuste
  template: `
    <div class="reaj" (keydown.enter)="$event.preventDefault(); aplicar()">
      <h3>Reajuste de valor</h3>
      @if (historico().length > 1) {
        <ol class="hist">
          @for (h of historico(); track h.id) {
            <li [class.atual]="h.id === rec().id">
              <b class="num">{{ h.valor | brl }}</b>
              <span>{{ h.fim ? (h.inicio | mes: true) + ' a ' + (h.fim | mes: true) : 'desde ' + (h.inicio | mes: true) }}</span>
            </li>
          }
        </ol>
      }
      @if (substituida()) {
        <p class="small muted">Esta foi substituída por um reajuste. Para mudar o valor, edite a mais recente.</p>
      } @else {
        <p class="small muted">
          Atual {{ atual() | brl }}{{ rec().variavel ? ' (estimado)' : '' }}. Vale a partir do mês escolhido; os meses anteriores ficam como estão.
          @if (rec().variavel) { A média das contas volta a contar a partir desse mês. }
        </p>
        <div class="grid2">
          <label class="field"><span>{{ rec().variavel ? 'Novo valor estimado' : 'Novo valor' }}</span>
            <input name="rv" inputmode="decimal" [ngModel]="valor()" (ngModelChange)="valor.set($event)" [ngModelOptions]="{ standalone: true }" />
          </label>
          <label class="field"><span>{{ rec().cartao_id ? 'A partir da fatura' : 'A partir de' }}</span>
            <input name="rm" type="month" [ngModel]="mes()" (ngModelChange)="mes.set($event)" [ngModelOptions]="{ standalone: true }" />
          </label>
        </div>
        @if (ipca(); as i) {
          <button type="button" class="chip" (click)="pelaInflacao(i)">Corrigir pela inflação (IPCA {{ i.txt }}% em 12 meses): {{ i.valor | brl }}</button>
        }
        @if (variacao(); as v) {
          <p class="small" [class.neg]="v > 0" [class.pos]="v < 0">{{ v > 0 ? 'Subiu' : 'Desceu' }} {{ (v > 0 ? v : -v).toLocaleString('pt-BR') }}%@if (ipca(); as i) {<span class="muted">, com a inflação em {{ i.txt }}%</span>}</p>
        }
        <button class="btn ghost block" type="button" [disabled]="salvando()" (click)="aplicar()">Aplicar reajuste</button>
      }
    </div>
  `,
  styles: `
    .reaj { border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    h3, p { margin: 0; }
    .hist { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 0.88rem; }
    .hist li { display: flex; justify-content: space-between; gap: 8px; color: var(--ink-2); }
    .hist li.atual { color: var(--ink); font-weight: 700; }
    .chip { align-self: flex-start; white-space: normal; text-align: left; }
  `,
})
export class Reajuste implements OnInit {
  private s = inject(Store);
  private toast = inject(Toast);

  readonly rec = input.required<Recorrencia>();
  readonly feito = output();

  protected valor = signal('');
  protected mes = signal(mesAtual().slice(0, 7));
  protected salvando = signal(false);
  protected historico = computed(() => historicoReajustes(this.s.recorrencias(), this.rec().id));
  protected substituida = computed(() => this.historico().at(-1)?.id !== this.rec().id);
  protected atual = computed(() => this.s.medias().get(this.rec().id) ?? this.rec().valor);
  // no cartão o reajuste é por fatura: começa na fatura aberta
  ngOnInit() {
    atualizarTaxas();
    const c = this.s.cartoes().find((x) => x.id === this.rec().cartao_id);
    if (c) this.mes.set(mesFatura(hoje(), c).slice(0, 7));
  }

  protected ipca = computed(() => {
    const t = taxasBcb();
    if (!t || !this.atual()) return null;
    return { txt: t.ipca12.toLocaleString('pt-BR'), valor: Math.round(this.atual() * (1 + t.ipca12 / 100) * 100) / 100 };
  });

  pelaInflacao(i: { valor: number }) {
    this.valor.set(i.valor.toFixed(2).replace('.', ','));
  }

  protected variacao = computed(() => {
    const v = parseValor(this.valor());
    return v && this.atual() ? Math.round((v / this.atual() - 1) * 1000) / 10 : 0;
  });

  async aplicar() {
    if (this.salvando()) return;
    const valor = parseValor(this.valor());
    if (!valor || !this.mes()) return this.toast.erro('Informe o novo valor e o mês');
    const mes = `${this.mes()}-01`;
    if (mes < inicioMes(this.rec().inicio) && !confirm('Esse mês é antes do início. Trocar o valor de todos os meses?')) return;
    this.salvando.set(true);
    try {
      await this.s.reajustar(this.rec(), valor, mes);
      this.toast.ok('Valor reajustado');
      this.feito.emit();
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }
}
