import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { rendimento, taxaMensal } from '../../core/financas';
import { BrlPipe, parseValor } from '../../core/formato';
import { Icon } from '../../shared/icon';
import { ESTILO, cdi, lembrado, pctCdi } from './comum';

@Component({
  selector: 'app-calc-rende',
  imports: [FormsModule, BrlPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card form">
      <div class="campos">
        <label class="field"><span>Tenho hoje</span><input inputmode="decimal" placeholder="1.000,00" [ngModel]="inicial()" (ngModelChange)="inicial.set($event)" /></label>
        <label class="field"><span>Guardo por mês</span><input inputmode="decimal" placeholder="200,00" [ngModel]="aporte()" (ngModelChange)="aporte.set($event)" /></label>
        <label class="field"><span>Por quantos meses</span><input type="number" min="1" max="600" [ngModel]="n()" (ngModelChange)="n.set(+$event)" /></label>
      </div>
      <div class="chips wrap rapido">
        @for (m of [6, 12, 24, 60, 120]; track m) {
          <button type="button" class="chip" [class.on]="n() === m" (click)="n.set(m)">{{ txtPrazo(m) }}</button>
        }
      </div>
      <div class="campos">
        <label class="field"><span>CDI ao ano (%)</span><input inputmode="decimal" [ngModel]="cdi()" (ngModelChange)="cdi.guardar($event)" /></label>
        <label class="field"><span>CDB/Tesouro (% CDI)</span><input inputmode="decimal" [ngModel]="pctCdi()" (ngModelChange)="pctCdi.guardar($event)" /></label>
        <label class="field"><span>LCI/LCA (% CDI)</span><input inputmode="decimal" [ngModel]="pctLci()" (ngModelChange)="pctLci.guardar($event)" /></label>
        <label class="field"><span>Poupança (% a.m.)</span><input inputmode="decimal" [ngModel]="poup()" (ngModelChange)="poup.guardar($event)" /></label>
      </div>
    </section>

    @if (lista(); as l) {
      <section class="card veredito pos">
        <app-icon name="trending_up" [size]="28" />
        <div><b>{{ l[0].r.final | brl }} em {{ prazo() }}</b><span class="small">{{ l[0].nome }}: rende {{ l[0].r.ganho | brl }} sobre {{ l[0].r.depositado | brl }} depositados</span></div>
      </section>
      <section class="card list">
        @for (o of l; track o.nome; let i = $index) {
          <div class="row">
            <span class="ico" [class.melhor]="i === 0"><app-icon [name]="o.icone" [size]="20" /></span>
            <div class="grow"><span class="t">{{ o.nome }}</span><span class="s">{{ o.r.imposto ? 'IR de ' + (o.r.imposto | brl) : 'Sem IR' }}</span></div>
            <div><span class="v" [class.pos]="i === 0">{{ o.r.final | brl }}</span><span class="s">+{{ o.r.ganho | brl }}</span></div>
          </div>
        }
      </section>
    }

    <details class="card como">
      <summary>Como funciona<app-icon name="expand_more" [size]="20" /></summary>
      <p class="small">Juros compostos: o que tem hoje e cada depósito do mês rendem até o fim do prazo. CDB e Tesouro pagam IR só sobre o rendimento, pela tabela regressiva
        (22,5% até 6 meses e 15% depois de 2 anos), contado para cada depósito. LCI, LCA e poupança são isentas.</p>
      <p class="small muted">Poupança rende 0,5% ao mês mais a TR enquanto a Selic está acima de 8,5% ao ano. Não considera inflação, taxa de custódia do Tesouro nem carência da LCI/LCA.</p>
    </details>
  `,
  styles: [ESTILO, '.row { cursor: default; } .row div:last-child .s { text-align: right; } .ico.melhor { background: var(--primary-soft); color: var(--primary); }'],
})
export class CalcRende {
  protected cdi = cdi;
  protected pctCdi = pctCdi;
  protected pctLci = lembrado('cfp.pctlci', '90');
  protected poup = lembrado('cfp.poupanca', '0,67');
  protected inicial = signal('');
  protected aporte = signal('');
  protected n = signal(12);

  protected txtPrazo = (m: number) => (m % 12 ? `${m} meses` : m === 12 ? '1 ano' : `${m / 12} anos`);
  protected prazo = computed(() => this.txtPrazo(this.n()));

  protected lista = computed(() => {
    const ini = parseValor(this.inicial());
    const ap = parseValor(this.aporte());
    const n = Math.min(this.n(), 600);
    const c = parseValor(this.cdi());
    const opcoes = [
      { nome: 'CDB ou Tesouro Selic', icone: 'account_balance', r: rendimento(ini, ap, n, taxaMensal(c, parseValor(this.pctCdi()), n, false)) },
      { nome: 'LCI ou LCA', icone: 'home_work', r: rendimento(ini, ap, n, taxaMensal(c, parseValor(this.pctLci()), n, false), false) },
      { nome: 'Poupança', icone: 'savings', r: rendimento(ini, ap, n, parseValor(this.poup()) / 100, false) },
    ];
    if (!opcoes[0].r) return null;
    return opcoes.map((o) => ({ ...o, r: o.r! })).sort((a, b) => b.r.final - a.r.final);
  });
}
