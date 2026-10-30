import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { emprestimo, quitarDivida } from '../../core/financas';
import { BrlPipe, parseValor } from '../../core/formato';
import { Icon } from '../../shared/icon';
import { ESTILO, pctTxt, taxas } from './comum';
import { FonteBcb } from './fonte';

@Component({
  selector: 'app-calc-divida',
  imports: [FormsModule, BrlPipe, Icon, FonteBcb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="seg">
      <button type="button" [class.on]="tipo() === 'rotativo'" (click)="tipo.set('rotativo')">Rotativo do cartão</button>
      <button type="button" [class.on]="tipo() === 'cheque'" (click)="tipo.set('cheque')">Cheque especial</button>
    </div>
    <section class="card form">
      <div class="campos">
        <label class="field"><span>Quanto deve</span><input inputmode="decimal" placeholder="2.000,00" [ngModel]="divida()" (ngModelChange)="divida.set($event)" /></label>
        <label class="field"><span>Juros ao mês (%)</span><input inputmode="decimal" [ngModel]="taxa()()" (ngModelChange)="taxa().guardar($event)" /></label>
        <label class="field"><span>Paga por mês</span><input inputmode="decimal" placeholder="300,00" [ngModel]="pagamento()" (ngModelChange)="pagamento.set($event)" /></label>
      </div>
      <app-fonte-bcb />
    </section>

    @if (r(); as x) {
      @if (x.meses === null) {
        <section class="card veredito neg">
          <app-icon name="warning" [size]="28" />
          <div><b>Nunca quita</b><span class="small">Os juros são <b class="num">{{ x.jurosMes | brl }}</b> por mês: pague mais que isso para a dívida diminuir.</span></div>
        </section>
      } @else {
        <section class="card veredito" [class.neg]="x.juros > d()">
          <app-icon name="event_available" [size]="28" />
          <div><b>Quita em {{ x.meses }} {{ x.meses === 1 ? 'mês' : 'meses' }}</b><span class="small">Paga <b class="num">{{ x.juros | brl }}</b> de juros, total de {{ x.total | brl }}</span></div>
        </section>
        <div class="stats">
          <div class="stat"><div class="l">Juros no 1º mês</div><div class="v neg">{{ x.jurosMes | brl }}</div></div>
          <div class="stat"><div class="l">Juros ao ano</div><div class="v">{{ anual() }}</div></div>
        </div>
        @if (troca(); as t) {
          <section class="aviso info">
            <app-icon class="i" name="swap_horiz" />
            <span class="small">Trocando por empréstimo pessoal a {{ taxas.emprestimo() }}% ao mês, em {{ x.meses }} parcelas de <b class="num">{{ t.parcela | brl }}</b>,
              os juros caem para <b class="num">{{ t.custo | brl }}</b> (economia de <b class="num pos">{{ x.juros - t.custo | brl }}</b>, com IOF).</span>
          </section>
        }
        <section class="card">
          <div class="tab">
            <div class="lin cab"><span>Mês</span><span>Juros</span><span>Ainda deve</span></div>
            @for (m of x.tabela; track m.mes) {
              <div class="lin"><span>{{ m.mes }}</span><span class="num neg">{{ m.juros | brl }}</span><span class="num">{{ m.saldo | brl }}</span></div>
            }
          </div>
        </section>
      }
    }

    <details class="card como">
      <summary>Como funciona<app-icon name="expand_more" [size]="20" /></summary>
      @if (tipo() === 'rotativo') {
        <p class="small">Rotativo é o que sobra quando paga menos que a fatura inteira. Os juros entram no saldo e rendem juros no mês seguinte.
          Desde 2024 a lei limita os juros e encargos do rotativo a 100% da dívida, e a simulação respeita esse teto.</p>
        <p class="small">Depois de um mês no rotativo o banco precisa oferecer o parcelamento da fatura, quase sempre mais barato.</p>
      } @else {
        <p class="small">O cheque especial cobra juros por dia sobre o saldo negativo, e a taxa é limitada a 8% ao mês. Na simulação o pagamento entra uma vez por mês.</p>
      }
      <p class="small muted">Os juros começam na média do Banco Central para pessoa física; a do seu banco pode ser outra. Não considera IOF nem tarifas.</p>
    </details>
  `,
  styles: ESTILO,
})
export class CalcDivida {
  protected taxas = taxas;
  protected tipo = signal<'rotativo' | 'cheque'>('rotativo');
  protected divida = signal('');
  protected pagamento = signal('');
  protected taxa = computed(() => taxas[this.tipo()]);
  protected d = computed(() => parseValor(this.divida()));
  private i = computed(() => parseValor(this.taxa()()) / 100);
  protected anual = computed(() => pctTxt(Math.pow(1 + this.i(), 12) - 1, 0));
  protected r = computed(() => quitarDivida(this.d(), this.i(), parseValor(this.pagamento()), this.tipo() === 'rotativo' ? this.d() : Infinity));
  protected troca = computed(() => {
    const x = this.r();
    const t = x?.meses ? emprestimo(this.d(), parseValor(taxas.emprestimo()) / 100, x.meses, true) : null;
    return t && x && t.custo < x.juros ? t : null;
  });
}
