import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { hoje } from '../../core/datas';
import { decimoTerceiro } from '../../core/financas';
import { BrlPipe, parseValor } from '../../core/formato';
import { Store } from '../../core/store';
import { Icon } from '../../shared/icon';
import { Toast } from '../../shared/toast';
import { ESTILO, lembrado } from './comum';

@Component({
  selector: 'app-calc-decimo',
  imports: [FormsModule, BrlPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card form">
      <div class="campos">
        <label class="field"><span>Salário bruto</span><input inputmode="decimal" placeholder="5.000,00" [ngModel]="bruto()" (ngModelChange)="bruto.guardar($event)" /></label>
        <label class="field"><span>Meses trabalhados no ano</span><input type="number" min="1" max="12" [ngModel]="meses()" (ngModelChange)="meses.set(+$event)" /></label>
        <label class="field"><span>Dependentes</span><input type="number" min="0" max="20" [ngModel]="dep()" (ngModelChange)="dep.set(+$event)" /></label>
        <label class="field"><span>Média de extras e comissões</span><input inputmode="decimal" placeholder="0,00" [ngModel]="extras()" (ngModelChange)="extras.set($event)" /></label>
      </div>
      <div class="seg">
        <button type="button" [class.on]="duas()" (click)="duas.set(true)">Em duas parcelas</button>
        <button type="button" [class.on]="!duas()" (click)="duas.set(false)">Parcela única</button>
      </div>
    </section>

    @if (r(); as x) {
      @if (duas()) {
        <section class="card veredito pos">
          <app-icon name="looks_one" [size]="28" />
          <div><b>1ª parcela {{ x.primeira | brl }}</b><span class="small">Até 30 de novembro, sem descontos (metade do bruto)</span></div>
        </section>
        <section class="card veredito">
          <app-icon name="looks_two" [size]="28" />
          <div><b>2ª parcela {{ x.segunda | brl }}</b><span class="small">Até 20 de dezembro: a outra metade menos todo o INSS e o IR</span></div>
        </section>
      } @else {
        <section class="card veredito pos">
          <app-icon name="payments" [size]="28" />
          <div><b>Parcela única {{ x.liquido | brl }}</b><span class="small">Até 30 de novembro, já com INSS e IR</span></div>
        </section>
      }
      <div class="stats">
        <div class="stat"><div class="l">13º bruto</div><div class="v">{{ x.total | brl }}</div></div>
        <div class="stat"><div class="l">INSS</div><div class="v neg">{{ x.inss | brl }}</div></div>
        <div class="stat"><div class="l">Imposto de renda</div><div class="v neg">{{ x.ir | brl }}</div></div>
        <div class="stat"><div class="l">Líquido no total</div><div class="v pos">{{ x.liquido | brl }}</div></div>
      </div>
      <button type="button" class="btn ghost block" [disabled]="salvando()" (click)="planejar()"><app-icon name="event_upcoming" [size]="18" />Pôr no Planejamento (todo ano)</button>
    }

    <details class="card como">
      <summary>Como funciona<app-icon name="expand_more" [size]="20" /></summary>
      <p class="small">O 13º é o salário bruto (mais a média de horas extras e comissões) dividido por 12 e multiplicado pelos meses trabalhados no ano. Mês com 15 dias ou mais conta inteiro.</p>
      <p class="small">Em duas parcelas, a primeira é metade do valor bruto, sem nenhum desconto. INSS e IR são calculados sobre o 13º inteiro e saem todos da segunda, por isso ela vem bem menor.</p>
      <p class="small muted">O IR do 13º é separado do salário: deduz INSS e dependentes, sem o desconto simplificado, e segue a isenção até R$ 5.000 de 2026. A empresa pode pagar a primeira parcela nas férias.</p>
    </details>
  `,
  styles: [ESTILO, '.seg { margin-top: 10px; } .btn app-icon { margin-right: 6px; } .veredito + .veredito { margin-top: -4px; }'],
})
export class CalcDecimo {
  private s = inject(Store);
  private toast = inject(Toast);
  protected bruto = lembrado('cfp.salario', '');
  protected meses = signal(12);
  protected dep = signal(0);
  protected extras = signal('');
  protected duas = signal(true);
  protected salvando = signal(false);

  protected r = computed(() => decimoTerceiro(parseValor(this.bruto()), this.meses(), this.dep(), parseValor(this.extras())));

  /** Entradas planejadas em novembro (e dezembro) que repetem todo ano */
  async planejar() {
    const x = this.r();
    if (!x) return;
    const ano = hoje().slice(0, 4);
    const itens = this.duas()
      ? [{ descricao: '13º salário (1ª parcela)', valor: x.primeira, mes: `${ano}-11-01` }, { descricao: '13º salário (2ª parcela)', valor: x.segunda, mes: `${ano}-12-01` }]
      : [{ descricao: '13º salário', valor: x.liquido, mes: `${ano}-11-01` }];
    this.salvando.set(true);
    try {
      const ids: string[] = [];
      for (const i of itens) ids.push(await this.s.salvar('planos', { tipo: 'entrada', anual: true, ...i }));
      this.toast.feito('13º no Planejamento', () => Promise.all(ids.map((id) => this.s.excluir('planos', id))));
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }
}
