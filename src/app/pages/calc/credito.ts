import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { emprestimo } from '../../core/financas';
import { BrlPipe, parseValor } from '../../core/formato';
import { Icon } from '../../shared/icon';
import { ESTILO, taxas } from './comum';
import { FonteBcb } from './fonte';

const OPCOES = [
  { k: 'emprestimo', nome: 'Empréstimo pessoal', icone: 'account_balance' },
  { k: 'pix', nome: 'Pix no crédito', icone: 'qr_code_2' },
  { k: 'cheque', nome: 'Cheque especial', icone: 'money_off' },
] as const;

@Component({
  selector: 'app-calc-credito',
  imports: [FormsModule, BrlPipe, Icon, FonteBcb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card form">
      <div class="campos">
        <label class="field"><span>Preciso de</span><input inputmode="decimal" placeholder="3.000,00" [ngModel]="valor()" (ngModelChange)="valor.set($event)" /></label>
        <label class="field"><span>Pagar em (meses)</span><input type="number" min="1" max="120" [ngModel]="n()" (ngModelChange)="n.set(+$event)" /></label>
      </div>
      <div class="chips wrap rapido">
        @for (m of [3, 6, 12, 24]; track m) {
          <button type="button" class="chip" [class.on]="n() === m" (click)="n.set(m)">{{ m }}x</button>
        }
      </div>
      <div class="campos">
        @for (o of opcoes; track o.k) {
          <label class="field"><span>{{ o.nome }} (% a.m.)</span><input inputmode="decimal" [ngModel]="taxas[o.k]()" (ngModelChange)="taxas[o.k].guardar($event)" /></label>
        }
      </div>
      <label class="check"><input type="checkbox" [checked]="iof()" (change)="iof.set(!iof())" />Incluir IOF</label>
      <app-fonte-bcb />
    </section>

    @if (lista(); as l) {
      <section class="card list">
        @for (o of l; track o.k; let i = $index) {
          <div class="row">
            <span class="ico" [class.melhor]="i === 0"><app-icon [name]="o.icone" [size]="20" /></span>
            <div class="grow">
              <span class="t">{{ o.nome }}</span>
              <span class="s">{{ n() }}x de {{ o.r.parcela | brl }} · {{ o.taxa }}% a.m.</span>
            </div>
            <div>
              <span class="v" [class.pos]="i === 0">{{ o.r.custo | brl }}</span>
              <span class="s">{{ i === 0 ? 'mais barato' : '+ ' + (o.r.custo - l[0].r.custo | brl) }}</span>
            </div>
          </div>
        }
      </section>
      <p class="small muted">Custo = juros{{ iof() ? ' e IOF' : '' }} pagos além dos {{ valorN() | brl }}. Total de {{ l[0].r.total | brl }} na opção mais barata.</p>
    }

    <details class="card como">
      <summary>Como funciona<app-icon name="expand_more" [size]="20" /></summary>
      <p class="small">Simula as três opções pagas em parcelas iguais (tabela Price), com a taxa ao mês de cada uma. Empréstimo e cheque especial começam na média do Banco Central para pessoa física; Pix no crédito não tem média oficial. Troque pelas que o seu banco oferece.</p>
      <p class="small">O cheque especial não tem parcelas: a simulação supõe que você paga o mesmo valor todo mês até zerar. Muitos bancos oferecem parcelar o saldo do cheque com taxa menor.</p>
      <p class="small muted">IOF de pessoa física: 0,38% mais 0,0082% ao dia (até 1 ano), financiado junto. Não considera seguro nem tarifa de cadastro.</p>
    </details>
  `,
  styles: [ESTILO, '.row { cursor: default; } .row .s:last-child { text-align: right; } .ico.melhor { background: var(--primary-soft); color: var(--primary); }'],
})
export class CalcCredito {
  protected taxas = taxas;
  protected opcoes = OPCOES;
  protected valor = signal('');
  protected n = signal(12);
  protected iof = signal(true);
  protected valorN = computed(() => parseValor(this.valor()));
  protected lista = computed(() => {
    if (this.valorN() <= 0 || this.n() < 1) return null;
    return OPCOES.map((o) => ({ ...o, taxa: taxas[o.k](), r: emprestimo(this.valorN(), parseValor(taxas[o.k]()) / 100, Math.min(this.n(), 120), this.iof())! })).sort(
      (a, b) => a.r.custo - b.r.custo,
    );
  });
}
