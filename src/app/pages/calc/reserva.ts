import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { addMeses, mesAtual, nomeMes } from '../../core/datas';
import { taxaMensal } from '../../core/financas';
import { BrlPipe, parseValor } from '../../core/formato';
import { Store } from '../../core/store';
import { normalizar } from '../../core/texto';
import { Icon } from '../../shared/icon';
import { ESTILO, cdi, lembrado, pctCdi } from './comum';

@Component({
  selector: 'app-calc-reserva',
  imports: [FormsModule, BrlPipe, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card form">
      <div class="campos">
        <label class="field"><span>Custo de vida por mês</span><input inputmode="decimal" [placeholder]="sugestao() ? (sugestao() | brl) : '4.000,00'" [ngModel]="custo()" (ngModelChange)="custo.guardar($event)" /></label>
        <label class="field"><span>Já tenho guardado</span><input inputmode="decimal" [placeholder]="guardado() ? (guardado() | brl) : '0,00'" [ngModel]="tenho()" (ngModelChange)="tenho.set($event)" /></label>
        <label class="field"><span>Guardo por mês</span><input inputmode="decimal" placeholder="500,00" [ngModel]="aporte()" (ngModelChange)="aporte.guardar($event)" /></label>
      </div>
      @if (!custo() && sugestao()) {
        <p class="small muted">Em branco, usa as saídas previstas de {{ mesTxt() }}.</p>
      }
      <span class="small muted">Meses de reserva</span>
      <div class="chips wrap rapido">
        @for (m of [3, 6, 9, 12]; track m) {
          <button type="button" class="chip" [class.on]="meses() === m + ''" (click)="meses.guardar(m + '')">{{ m }} meses</button>
        }
      </div>
    </section>

    @if (r(); as x) {
      <section class="card veredito" [class.pos]="x.falta <= 0">
        <app-icon [name]="x.falta <= 0 ? 'verified_user' : 'shield'" [size]="28" />
        <div>
          <b>Reserva de {{ x.meta | brl }}</b>
          <span class="small">
            @if (x.falta <= 0) {
              Completa: cobre {{ x.cobre }} meses
            } @else if (x.chega; as c) {
              Faltam {{ x.falta | brl }}, chega lá em {{ c.meses }} {{ c.meses === 1 ? 'mês' : 'meses' }} ({{ c.quando }})
            } @else {
              Faltam {{ x.falta | brl }}: informe quanto guarda por mês
            }
          </span>
        </div>
      </section>
      <div class="bar"><i [style.width.%]="x.pct" [style.background]="'var(--primary)'"></i></div>
      <div class="stats">
        <div class="stat"><div class="l">Cobre hoje</div><div class="v">{{ x.cobre }} meses</div></div>
        <div class="stat"><div class="l">Guardado</div><div class="v">{{ x.pct }}%</div></div>
      </div>
      @if (!s.reserva()) {
        <p class="small muted">Marque um cofrinho como reserva de emergência em <a routerLink="/cofrinhos">Cofrinhos</a> para o app acompanhar.</p>
      }
    }

    <details class="card como">
      <summary>Como funciona<app-icon name="expand_more" [size]="20" /></summary>
      <p class="small">A reserva cobre imprevistos (desemprego, saúde, conserto) sem recorrer a crédito. O comum é de 3 a 6 meses do custo de vida;
        quem tem renda variável ou é autônomo costuma mirar 12.</p>
      <p class="small muted">O prazo considera o dinheiro rendendo {{ pctCdi() }}% do CDI de {{ cdi() }}% ao ano, com IR, em aplicação de resgate imediato.</p>
    </details>
  `,
  styles: [ESTILO, '.chips { margin-top: 0; }'],
})
export class CalcReserva {
  protected s = inject(Store);
  protected cdi = cdi;
  protected pctCdi = pctCdi;
  protected custo = lembrado('cfp.reserva.custo', '');
  protected aporte = lembrado('cfp.reserva.aporte', '');
  protected meses = lembrado('cfp.reserva.meses', '6');
  protected tenho = signal('');

  protected sugestao = computed(() => Math.round(this.s.resumo().saidas));
  /** cofrinhos marcados como reserva, ou o que tem "emergência" no nome */
  protected guardado = computed(() => {
    const r = this.s.reserva();
    if (r) return r.guardado;
    const c = this.s.cofrinhos().find((c) => normalizar(c.nome).includes('emergencia'));
    return c ? (this.s.guardadoPorCofrinho().get(c.id) ?? 0) : 0;
  });
  protected mesTxt = computed(() => nomeMes(this.s.mes()));

  protected r = computed(() => {
    const custo = parseValor(this.custo()) || this.sugestao();
    if (custo <= 0) return null;
    const tenho = this.tenho() ? parseValor(this.tenho()) : this.guardado();
    const meta = custo * +this.meses();
    const falta = Math.round((meta - tenho) * 100) / 100;
    const aporte = parseValor(this.aporte());
    let chega: { meses: number; quando: string } | null = null;
    if (falta > 0 && aporte > 0) {
      // IR de 1 a 2 anos (17,5%) como aproximação
      const i = taxaMensal(parseValor(this.cdi()), parseValor(this.pctCdi()), 18);
      let saldo = tenho;
      let k = 0;
      while (saldo < meta && k < 600) {
        saldo = saldo * (1 + i) + aporte;
        k++;
      }
      if (saldo >= meta) chega = { meses: k, quando: nomeMes(addMeses(mesAtual(), k)) };
    }
    return {
      meta,
      falta,
      chega,
      pct: Math.min(Math.round((tenho / meta) * 100), 100),
      cobre: (Math.floor((tenho / custo) * 10) / 10).toLocaleString('pt-BR'),
    };
  });
}
