import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrlPipe, parseValor } from '../../core/formato';
import { Icon } from '../../shared/icon';
import { ESTILO, ganho, lembrado, pctTxt } from './comum';

@Component({
  selector: 'app-calc-horas',
  imports: [FormsModule, BrlPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card form">
      <div class="campos">
        <label class="field"><span>Quanto custa</span><input inputmode="decimal" placeholder="300,00" [ngModel]="preco()" (ngModelChange)="preco.set($event)" /></label>
        <label class="field"><span>Ganho líquido por mês</span><input inputmode="decimal" placeholder="3.000,00" [ngModel]="ganho()" (ngModelChange)="ganho.guardar($event)" /></label>
        <label class="field"><span>Horas por semana</span><input type="number" min="1" max="100" [ngModel]="semana()" (ngModelChange)="semana.guardar($event + '')" /></label>
      </div>
    </section>
    @if (r(); as x) {
      <section class="card veredito pos">
        <app-icon name="schedule" [size]="28" />
        <div><b>{{ x.tempo }} de trabalho</b><span class="small">{{ x.pct }} do que você ganha no mês</span></div>
      </section>
      <div class="stats">
        <div class="stat"><div class="l">Sua hora vale</div><div class="v">{{ x.hora | brl }}</div></div>
        <div class="stat"><div class="l">Dias de trabalho</div><div class="v">{{ x.dias }}</div></div>
      </div>
    } @else {
      <p class="small muted">Informe o preço e quanto você ganha para ver quanto tempo de trabalho ele custa.</p>
    }
  `,
  styles: ESTILO,
})
export class CalcHoras {
  protected preco = signal('');
  protected ganho = ganho;
  protected semana = lembrado('cfp.horas.semana', '44');

  protected r = computed(() => {
    const preco = parseValor(this.preco());
    const g = parseValor(this.ganho());
    const sem = +this.semana();
    if (preco <= 0 || g <= 0 || sem <= 0) return null;
    // jornada mensal como na CLT: 44 h por semana = 220 h
    const hora = g / (sem * 5);
    const horas = preco / hora;
    const h = Math.floor(horas);
    const min = Math.round((horas - h) * 60);
    const tempo = h ? `${h} h${min ? ` ${min} min` : ''}` : `${Math.max(min, 1)} min`;
    const dias = (horas / (sem / 5)).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    return { hora, tempo, dias, pct: pctTxt(preco / g, 1) };
  });
}
