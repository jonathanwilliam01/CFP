import { Directive, ElementRef, forwardRef, inject, input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { parseValor } from '../core/formato';

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Dígitos entram pelos centavos: "3450" → "34,50", "56789" → "567,89". "-" em qualquer ponto deixa negativo. */
export function mascaraMoeda(t: string) {
  const neg = t.includes('-');
  const d = t.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
  return (neg ? '-' : '') + (d ? fmt.format(Number(d) / 100) : '');
}

/** Máscara de dinheiro no input com ngModel. O modelo recebe o texto ("1.234,56"); com moeda="numero", o número (vazio = null). */
@Directive({
  selector: 'input[moeda]',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Moeda), multi: true }],
  host: { autocomplete: 'off', '(input)': 'digitou()', '(blur)': 'tocou()' },
})
export class Moeda implements ControlValueAccessor {
  readonly moeda = input('');
  private el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private mudou: (v: string | number | null) => void = () => {};
  protected tocou = () => {};

  writeValue(v: string | number | null | undefined) {
    this.el.value = v == null || v === '' ? '' : fmt.format(parseValor(v));
  }

  protected digitou() {
    const t = mascaraMoeda(this.el.value);
    this.el.value = t;
    this.el.setSelectionRange(t.length, t.length);
    this.mudou(this.moeda() === 'numero' ? (t.replace('-', '') ? parseValor(t) : null) : t);
  }

  registerOnChange(fn: (v: string | number | null) => void) {
    this.mudou = fn;
  }

  registerOnTouched(fn: () => void) {
    this.tocou = fn;
  }

  setDisabledState(d: boolean) {
    this.el.disabled = d;
  }
}
