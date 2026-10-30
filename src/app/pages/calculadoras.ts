import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { aliquotaIR, avistaOuParcelado, taxaMensal } from '../core/financas';
import { BrlPipe, parseValor } from '../core/formato';
import { Icon } from '../shared/icon';
import { ESTILO, cdi, lembrado, pctCdi, pctTxt } from './calc/comum';
import { CalcCredito } from './calc/credito';
import { CalcDivida } from './calc/divida';
import { CalcHoras } from './calc/horas';
import { CalcRende } from './calc/rende';
import { CalcReserva } from './calc/reserva';
import { CalcSalario } from './calc/salario';

const ABAS = [
  { k: 'parcelado', nome: 'À vista x parcelado', icone: 'event_repeat' },
  { k: 'credito', nome: 'Empréstimo x Pix x cheque', icone: 'account_balance' },
  { k: 'divida', nome: 'Rotativo e cheque', icone: 'credit_card_off' },
  { k: 'horas', nome: 'Horas de trabalho', icone: 'schedule' },
  { k: 'salario', nome: 'Salário líquido', icone: 'payments' },
  { k: 'rende', nome: 'Quanto rende', icone: 'trending_up' },
  { k: 'reserva', nome: 'Reserva de emergência', icone: 'shield' },
  { k: 'meta', nome: 'Meta', icone: 'savings' },
  { k: 'dividir', nome: 'Dividir conta', icone: 'group' },
];

@Component({
  imports: [FormsModule, BrlPipe, Icon, CalcCredito, CalcDivida, CalcHoras, CalcRende, CalcReserva, CalcSalario],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><h1>Calculadoras</h1></div>

      <div class="chips wrap">
        @for (a of abas; track a.k) {
          <button type="button" class="chip" [class.on]="aba() === a.k" (click)="aba.guardar(a.k)"><app-icon [name]="a.icone" [size]="18" />{{ a.nome }}</button>
        }
      </div>

      @switch (aba()) {
        @case ('parcelado') {
          <section class="card form">
            <div class="campos">
              <label class="field"><span>Preço à vista (Pix)</span><input inputmode="decimal" placeholder="950,00" [ngModel]="avista()" (ngModelChange)="avista.set($event)" /></label>
              <label class="field"><span>Total parcelado</span><input inputmode="decimal" placeholder="1.000,00" [ngModel]="total()" (ngModelChange)="total.set($event)" /></label>
              <label class="field"><span>Parcelas</span><input type="number" min="1" max="120" [ngModel]="n()" (ngModelChange)="n.set(+$event)" /></label>
            </div>
            <div class="campos">
              <label class="field"><span>CDI ao ano (%)</span><input inputmode="decimal" [ngModel]="cdi()" (ngModelChange)="cdi.guardar($event)" /></label>
              <label class="field"><span>Rende (% do CDI)</span><input inputmode="decimal" [ngModel]="pctCdi()" (ngModelChange)="pctCdi.guardar($event)" /></label>
            </div>
            <label class="check"><input type="checkbox" [checked]="ir()" (change)="ir.set(!ir())" />Descontar imposto de renda do rendimento</label>
            <label class="check"><input type="checkbox" [checked]="entrada()" (change)="entrada.set(!entrada())" />Primeira parcela paga hoje (entrada)</label>
          </section>

          @if (r(); as x) {
            <section class="card veredito" [class.pos]="x.compensa === 'parcelado'">
              <app-icon [name]="x.compensa === 'parcelado' ? 'event_repeat' : 'bolt'" [size]="28" />
              <div>
                <b>{{ x.compensa === 'parcelado' ? 'Parcelado compensa' : 'À vista compensa' }}</b>
                <span class="small">Diferença de <b class="num">{{ abs(x.economia) | brl }}</b> em valores de hoje</span>
              </div>
            </section>

            <div class="stats">
              <div class="stat"><div class="l">Parcela</div><div class="v">{{ parcela() | brl }}</div></div>
              <div class="stat"><div class="l">Desconto no Pix</div><div class="v">{{ desconto() }}</div></div>
              <div class="stat"><div class="l">Rendimento ao mês</div><div class="v">{{ taxaTxt() }}</div></div>
              <div class="stat"><div class="l">Juros do parcelado</div><div class="v">{{ x.juros === null ? 'sem juros' : pct(x.juros) + ' a.m.' }}</div></div>
            </div>

            <section class="card">
              <p class="small">
                Para pagar as {{ n() }} parcelas basta ter <b class="num">{{ x.custoHoje | brl }}</b> aplicado hoje, contra
                <b class="num">{{ avistaN() | brl }}</b> no Pix.
                @if (x.sobra >= 0) {
                  Aplicando o valor do Pix e pagando as parcelas com ele, sobram <b class="num pos">{{ x.sobra | brl }}</b> no fim.
                } @else {
                  Aplicando o valor do Pix, ainda faltam <b class="num neg">{{ -x.sobra | brl }}</b> para a última parcela.
                }
              </p>
              <div class="tab">
                <div class="lin cab"><span>Mês</span><span>Paga</span><span>Fica aplicado</span></div>
                @for (m of x.meses; track m.mes) {
                  <div class="lin"><span>{{ m.mes === 0 ? 'Hoje' : m.mes }}</span><span class="num">{{ parcela() | brl }}</span><span class="num" [class.neg]="m.saldo < 0">{{ m.saldo | brl }}</span></div>
                }
              </div>
            </section>
          }

          <details class="card como">
            <summary>Como funciona a simulação<app-icon name="expand_more" [size]="20" /></summary>
            <p class="small">Compara as duas formas como se você tivesse o dinheiro do Pix na mão: em vez de pagar à vista, ele fica aplicado
              (ex.: CDB a 100% do CDI) e cada parcela sai dessa aplicação no mês em que vence. Enquanto isso, o saldo restante rende.</p>
            <p class="small">Se o rendimento até a última parcela cobre a diferença entre o total parcelado e o Pix, parcelar compensa; senão, o desconto do Pix vale mais.
              O "valor de hoje" das parcelas é quanto precisaria aplicar agora para pagar todas.</p>
            <p class="small">Juros do parcelado é a taxa ao mês que a loja cobra sobre o preço à vista. Parcelar só compensa quando ela é menor que o rendimento da aplicação.</p>
            <p class="small muted">O IR segue a tabela regressiva pelo prazo ({{ irTxt() }} para {{ n() }} meses). Não considera IOF (resgate antes de 30 dias), inflação nem o risco de gastar o dinheiro guardado.</p>
          </details>
        }

        @case ('credito') {
          <app-calc-credito />
        }
        @case ('divida') {
          <app-calc-divida />
        }
        @case ('horas') {
          <app-calc-horas />
        }
        @case ('salario') {
          <app-calc-salario />
        }
        @case ('rende') {
          <app-calc-rende />
        }
        @case ('reserva') {
          <app-calc-reserva />
        }
        @case ('meta') {
          <section class="card form">
            <div class="campos">
              <label class="field"><span>Quero juntar</span><input inputmode="decimal" placeholder="10.000,00" [ngModel]="meta()" (ngModelChange)="meta.set($event)" /></label>
              <label class="field"><span>Em quantos meses</span><input type="number" min="1" max="600" [ngModel]="prazo()" (ngModelChange)="prazo.set(+$event)" /></label>
              <label class="field"><span>Já tenho</span><input inputmode="decimal" placeholder="0,00" [ngModel]="tenho()" (ngModelChange)="tenho.set($event)" /></label>
            </div>
            <p class="small muted">Rendendo {{ pctCdi() }}% do CDI de {{ cdi() }}% ao ano, com IR (mude na aba À vista x parcelado).</p>
          </section>
          @if (m(); as x) {
            <section class="card veredito pos">
              <app-icon name="savings" [size]="28" />
              <div><b>Guarde {{ x.mensal | brl }} por mês</b><span class="small">Sem rendimento seriam {{ x.semJuros | brl }} por mês</span></div>
            </section>
            <div class="stats">
              <div class="stat"><div class="l">Você deposita</div><div class="v">{{ x.depositado | brl }}</div></div>
              <div class="stat"><div class="l">O rendimento põe</div><div class="v pos">{{ x.rendimento | brl }}</div></div>
            </div>
          }
        }

        @case ('dividir') {
          <section class="card form">
            <div class="campos">
              <label class="field"><span>Total da conta</span><input inputmode="decimal" placeholder="0,00" [ngModel]="conta()" (ngModelChange)="conta.set($event)" /></label>
              <label class="field"><span>Pessoas</span><input type="number" min="1" max="100" [ngModel]="pessoas()" (ngModelChange)="pessoas.set(+$event)" /></label>
              <label class="field"><span>Serviço (%)</span><input inputmode="decimal" [ngModel]="servico()" (ngModelChange)="servico.set($event)" /></label>
            </div>
          </section>
          @if (d(); as x) {
            <section class="card veredito pos">
              <app-icon name="group" [size]="28" />
              <div><b>{{ x.cada | brl }} por pessoa</b><span class="small">Total com serviço {{ x.total | brl }}</span></div>
            </section>
          }
        }
      }
    </div>
  `,
  styles: [ESTILO, ':host app-calc-credito, :host app-calc-divida, :host app-calc-horas, :host app-calc-salario, :host app-calc-rende, :host app-calc-reserva { display: contents; }'],
})
export default class Calculadoras {
  protected abas = ABAS;
  protected aba = lembrado('cfp.calc', 'parcelado');
  protected pct = (v: number) => pctTxt(v);
  protected abs = Math.abs;

  protected avista = signal('');
  protected total = signal('');
  protected n = signal(10);
  protected cdi = cdi;
  protected pctCdi = pctCdi;
  protected ir = signal(true);
  protected entrada = signal(false);

  protected avistaN = computed(() => parseValor(this.avista()));
  protected parcela = computed(() => (this.n() > 0 ? Math.round((parseValor(this.total()) / this.n()) * 100) / 100 : 0));
  private taxa = computed(() => taxaMensal(parseValor(this.cdi()), parseValor(this.pctCdi()), this.n(), this.ir()));
  protected taxaTxt = computed(() => pctTxt(this.taxa(), 3));
  protected irTxt = computed(() => pctTxt(aliquotaIR(this.n()), 1));
  protected desconto = computed(() => {
    const t = parseValor(this.total());
    return t > 0 ? pctTxt(1 - this.avistaN() / t, 1) : '—';
  });
  protected r = computed(() => avistaOuParcelado(this.avistaN(), this.parcela(), Math.min(this.n(), 120), this.taxa(), this.entrada()));

  protected meta = signal('');
  protected prazo = signal(12);
  protected tenho = signal('');
  protected m = computed(() => {
    const fv = parseValor(this.meta());
    const pv = parseValor(this.tenho());
    const n = this.prazo();
    if (fv <= 0 || n < 1) return null;
    const i = taxaMensal(parseValor(this.cdi()), parseValor(this.pctCdi()), n);
    const falta = fv - pv * Math.pow(1 + i, n);
    const mensal = falta <= 0 ? 0 : i > 0 ? (falta * i) / (Math.pow(1 + i, n) - 1) : falta / n;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return { mensal: r2(mensal), semJuros: r2(Math.max(fv - pv, 0) / n), depositado: r2(mensal * n), rendimento: r2(Math.max(fv - pv - mensal * n, 0)) };
  });

  protected conta = signal('');
  protected pessoas = signal(2);
  protected servico = signal('10');
  protected d = computed(() => {
    const t = parseValor(this.conta());
    if (t <= 0 || this.pessoas() < 1) return null;
    const total = Math.round(t * (1 + parseValor(this.servico()) / 100) * 100) / 100;
    return { total, cada: Math.ceil((total / this.pessoas()) * 100) / 100 };
  });
}
