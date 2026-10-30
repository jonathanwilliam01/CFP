import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DatePipe } from '@angular/common';
import { atualizarTaxas, taxasBcb } from '../../core/bcb';
import { doBancoTrocadas, voltarAoBanco } from './comum';

/** De onde vêm as taxas: Banco Central, com volta às oficiais quando o usuário trocou alguma */
@Component({
  selector: 'app-fonte-bcb',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (t(); as x) {
      <p class="small muted">
        Banco Central em {{ x.data | date: 'dd/MM' }}: CDI {{ n(x.cdi) }}% e Selic {{ n(x.selic) }}% ao ano, IPCA {{ n(x.ipca12) }}% em 12 meses.
        @if (trocadas().length; as q) {
          Você trocou {{ q === 1 ? '1 taxa' : q + ' taxas' }}. <button type="button" class="link" (click)="voltar()">Usar as do Banco Central</button>
        }
      </p>
    }
  `,
  styles: '.link { border: 0; background: none; padding: 0; font: inherit; color: var(--primary); font-weight: 700; cursor: pointer; }',
})
export class FonteBcb {
  protected t = taxasBcb;
  protected trocadas = doBancoTrocadas;
  protected voltar = voltarAoBanco;
  protected n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  constructor() {
    atualizarTaxas();
  }
}
