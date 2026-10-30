import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { faltaPara, hoje } from '../core/datas';
import { depositoNecessario, simularDepositos } from '../core/financas';
import { BrlPipe, parseValor, soma } from '../core/formato';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { IconePicker } from '../shared/icone-picker';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

@Component({
  imports: [FormsModule, RouterLink, BrlPipe, Icon, IconePicker, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Cofrinhos</h1>
        <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" />Novo</button>
      </div>

      @if (lista().length) {
        <div class="stat">
          <div class="l">Total guardado</div>
          <div class="v pos">{{ total() | brl }}</div>
        </div>
        @if (s.reserva(); as r) {
          <div class="card reserva">
            <app-icon name="health_and_safety" />
            <span>Reserva de emergência: <b class="num">{{ r.guardado | brl }}</b>
              @if (r.meses !== null) { cobre <b [class.neg]="r.meses < 3" [class.pos]="r.meses >= 6">{{ r.meses }} {{ r.meses === 1 ? 'mês' : 'meses' }}</b> de despesas (o ideal é 6). }
            </span>
          </div>
        }
        <div class="grid">
          @for (c of lista(); track c.id) {
            <a class="card cof" [routerLink]="['/cofrinhos', c.id]">
              <div class="top">
                <span class="ico" [style.background]="c.cor + '22'" [style.color]="c.cor"><app-icon [name]="c.icone" /></span>
                <span class="badge" [class.ok]="c.pct >= 100">{{ c.pct }}%</span>
              </div>
              <h3>{{ c.nome }}</h3>
              <div class="num v">{{ c.guardado | brl }}</div>
              @if (c.meta > 0) {
                <div class="bar"><i [style.width.%]="c.pct > 100 ? 100 : c.pct" [style.background]="c.cor"></i></div>
                <small class="muted num">meta {{ c.meta | brl }}</small>
              }
              @if (c.prazo && c.pct < 100) {
                <small class="prazo"><app-icon name="schedule" [size]="14" />{{ falta(c.prazo) }}</small>
              }
              @if (c.precisa) {
                <small class="flag"><app-icon name="flag" [size]="14" [fill]="true" />{{ c.precisa | brl }}/mês até a meta</small>
              }
              @if (c.chega) {
                <small class="muted">Plano {{ c.deposito | brl }}/{{ nomes[c.frequencia ?? 'mes'] }} · chega {{ c.chega }}</small>
              }
            </a>
          }
        </div>
      } @else {
        <div class="card empty">
          <app-icon class="big" name="savings" [size]="40" />
          <p>Crie cofrinhos para guardar dinheiro com objetivo: viagem, reserva, carro novo…</p>
          <button class="btn" type="button" (click)="novo()">Criar cofrinho</button>
        </div>
      }
    </div>

    <app-sheet [(open)]="aberto" titulo="Novo cofrinho">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Nome</span><input name="nome" [(ngModel)]="f.nome" placeholder="Ex.: Viagem" /></label>
        <div class="grid2">
          <label class="field"><span>Meta (R$)</span><input name="meta" inputmode="decimal" [(ngModel)]="f.meta" placeholder="0,00" /></label>
          <label class="field"><span>Prazo</span><input name="prazo" type="date" [(ngModel)]="f.prazo" /></label>
        </div>
        <label class="field"><span>Cor</span><input name="cor" type="color" [(ngModel)]="f.cor" /></label>
        <div class="field"><span>Ícone</span><app-icone-picker [(valor)]="f.icone" [cor]="f.cor" /></div>
        <label class="check"><input name="emerg" type="checkbox" [(ngModel)]="f.emergencia" />É a reserva de emergência</label>
        <button class="btn block" [disabled]="salvando()">Salvar</button>
      </form>
    </app-sheet>
  `,
  styles: `
    .reserva { display: flex; gap: 10px; align-items: center; font-size: 0.9rem; }
    .reserva app-icon { color: var(--primary); }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .cof { display: flex; flex-direction: column; gap: 6px; color: inherit; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; }
    .v { font-weight: 800; font-size: 1.05rem; }
    .flag { display: inline-flex; align-items: center; gap: 4px; color: var(--warn); font-weight: 700; font-size: 0.75rem; }
    .prazo { display: inline-flex; align-items: center; gap: 4px; color: var(--primary); font-weight: 700; font-size: 0.75rem; }
    @media (min-width: 720px) { .grid { grid-template-columns: repeat(3, 1fr); } }
  `,
})
export default class Cofrinhos {
  protected s = inject(Store);
  private toast = inject(Toast);
  protected aberto = signal(false);
  protected salvando = signal(false);
  f = { nome: '', meta: '', prazo: '', icone: 'savings', cor: '#10b981', emergencia: false };

  protected lista = computed(() =>
    this.s.cofrinhos().map((c) => {
      const guardado = this.s.guardadoPorCofrinho().get(c.id) ?? 0;
      const falta = Math.max(0, c.meta - guardado);
      const sim = c.deposito ? simularDepositos(falta, c.deposito, c.frequencia ?? 'mes', hoje(), null) : null;
      return {
        ...c, guardado,
        pct: c.meta > 0 ? Math.round((guardado / c.meta) * 100) : 0,
        precisa: c.prazo ? depositoNecessario(falta, 'mes', hoje(), c.prazo) : null,
        chega: sim ? `em ${sim.data.slice(5, 7)}/${sim.data.slice(0, 4)}` : null,
      };
    }),
  );
  protected falta = faltaPara;
  protected nomes = { semana: 'semana', quinzena: 'quinzena', mes: 'mês' };
  protected total = computed(() => soma(this.lista(), (c) => c.guardado));

  novo() {
    this.f = { nome: '', meta: '', prazo: '', icone: 'savings', cor: '#10b981', emergencia: false };
    this.aberto.set(true);
  }

  async salvar() {
    if (!this.f.nome.trim()) return this.toast.erro('Informe o nome');
    this.salvando.set(true);
    try {
      await this.s.salvar('cofrinhos', {
        nome: this.f.nome.trim(),
        meta: parseValor(this.f.meta),
        prazo: this.f.prazo || null,
        icone: this.f.icone || 'savings',
        cor: this.f.cor,
        emergencia: this.f.emergencia,
      });
      this.toast.ok('Cofrinho criado');
      this.aberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }
}
