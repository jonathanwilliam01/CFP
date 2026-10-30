import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { salarioLiquido } from '../../core/financas';
import { BrlPipe, parseValor } from '../../core/formato';
import { Icon } from '../../shared/icon';
import { Toast } from '../../shared/toast';
import { ESTILO, ganho, lembrado } from './comum';

@Component({
  selector: 'app-calc-salario',
  imports: [FormsModule, BrlPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card form">
      <div class="campos">
        <label class="field"><span>Salário bruto</span><input inputmode="decimal" placeholder="5.000,00" [ngModel]="bruto()" (ngModelChange)="bruto.guardar($event)" /></label>
        <label class="field"><span>Dependentes</span><input type="number" min="0" max="20" [ngModel]="dep()" (ngModelChange)="dep.set(+$event)" /></label>
        <label class="field"><span>Outros descontos</span><input inputmode="decimal" placeholder="0,00" [ngModel]="outros()" (ngModelChange)="outros.set($event)" /></label>
      </div>
      <label class="check"><input type="checkbox" [checked]="vt()" (change)="vt.set(!vt())" />Vale-transporte (desconta 6%)</label>
    </section>

    @if (r(); as x) {
      <section class="card veredito pos">
        <app-icon name="payments" [size]="28" />
        <div>
          <b>Líquido {{ x.liquido | brl }}</b>
          <span class="small">Descontos de {{ x.inss + x.ir + x.outros | brl }}</span>
        </div>
      </section>
      <div class="stats">
        <div class="stat"><div class="l">INSS</div><div class="v neg">{{ x.inss | brl }}</div></div>
        <div class="stat"><div class="l">Imposto de renda</div><div class="v neg">{{ x.ir | brl }}</div></div>
        <div class="stat"><div class="l">Outros descontos</div><div class="v">{{ x.outros | brl }}</div></div>
        <div class="stat"><div class="l">FGTS (empresa deposita)</div><div class="v">{{ x.fgts | brl }}</div></div>
      </div>
      @if (extras(); as e) {
        <section class="card">
          <div class="row"><div class="grow"><span class="t">13º salário</span><span class="s">Bruto {{ brutoN() | brl }}, em duas parcelas</span></div><span class="v">≈ {{ e.decimo | brl }}</span></div>
          <div class="row"><div class="grow"><span class="t">Férias com 1/3</span><span class="s">Bruto {{ e.feriasBruto | brl }}</span></div><span class="v">≈ {{ e.ferias | brl }}</span></div>
        </section>
      }
      <button type="button" class="btn ghost block" (click)="usarGanho(x.liquido)"><app-icon name="schedule" [size]="18" />Usar o líquido nas Horas de trabalho</button>
    }

    <details class="card como">
      <summary>Como funciona<app-icon name="expand_more" [size]="20" /></summary>
      <p class="small">Tabelas de 2026: INSS progressivo por faixa (teto de R$ 8.475,55) e IR com isenção para quem ganha até R$ 5.000, e desconto menor até R$ 7.350.</p>
      <p class="small">No IR vale o que for maior: INSS mais R$ 189,59 por dependente, ou o desconto simplificado de R$ 607,20.</p>
      <p class="small muted">13º e férias são aproximados: a folha calcula cada um à parte. Plano de saúde e outros descontos não abatem o IR na fonte.</p>
    </details>
  `,
  styles: [ESTILO, '.row { cursor: default; } .btn app-icon { margin-right: 6px; }'],
})
export class CalcSalario {
  private toast = inject(Toast);
  protected bruto = lembrado('cfp.salario', '');
  protected dep = signal(0);
  protected outros = signal('');
  protected vt = signal(false);

  protected brutoN = computed(() => parseValor(this.bruto()));
  protected r = computed(() => {
    const b = this.brutoN();
    return salarioLiquido(b, this.dep(), parseValor(this.outros()) + (this.vt() ? b * 0.06 : 0));
  });
  protected extras = computed(() => {
    const b = this.brutoN();
    if (b <= 0) return null;
    return { decimo: salarioLiquido(b, this.dep())!.liquido, feriasBruto: (b * 4) / 3, ferias: salarioLiquido((b * 4) / 3, this.dep())!.liquido };
  });

  usarGanho(v: number) {
    ganho.guardar(v.toFixed(2).replace('.', ','));
    this.toast.ok('Ganho atualizado nas Horas de trabalho');
  }
}
