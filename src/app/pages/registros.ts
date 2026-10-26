import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BrlPipe } from '../core/formato';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
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
        <h1>Registros</h1>
        <button class="btn sm" type="button" (click)="novo()"><app-icon name="add" [size]="16" />Novo</button>
      </div>
      <p class="muted small">Controles à parte, como gastos com o carro ou uma reforma. Não entram nas contas do mês.</p>

      @if (s.registros().length) {
        <div class="card list">
          @for (r of s.registros(); track r.id) {
            <a class="row" [routerLink]="['/registros', r.id]">
              <span class="ico" [style.background]="r.cor + '22'" [style.color]="r.cor"><app-icon [name]="r.icone" /></span>
              <div class="grow">
                <div class="t">{{ r.nome }}</div>
                <div class="s">{{ totais().get(r.id)?.qtd ?? 0 }} itens</div>
              </div>
              <div class="v">{{ totais().get(r.id)?.total ?? 0 | brl }}</div>
            </a>
          }
        </div>
      } @else {
        <div class="card empty">
          <app-icon class="big" name="menu_book" [size]="40" />
          <p>Crie um registro para acompanhar gastos de algo específico.</p>
          <button class="btn" type="button" (click)="novo()">Criar registro</button>
        </div>
      }
    </div>

    <app-sheet [(open)]="aberto" titulo="Novo registro">
      <form class="form" (ngSubmit)="salvar()">
        <label class="field"><span>Nome</span><input name="nome" [(ngModel)]="f.nome" placeholder="Ex.: Carro" /></label>
        <label class="field"><span>Cor</span><input name="cor" type="color" [(ngModel)]="f.cor" /></label>
        <div class="field"><span>Ícone</span><app-icone-picker [(valor)]="f.icone" [cor]="f.cor" /></div>
        <button class="btn block" [disabled]="salvando()">Salvar</button>
      </form>
    </app-sheet>
  `,
})
export default class Registros {
  protected s = inject(Store);
  private toast = inject(Toast);
  protected aberto = signal(false);
  protected salvando = signal(false);
  protected totais = signal(new Map<string, { total: number; qtd: number }>());
  f = { nome: '', icone: 'menu_book', cor: '#0ea5e9' };

  constructor() {
    effect(() => {
      this.s.mudou();
      this.s.registros();
      if (this.s.carteiraId()) untracked(() => this.carregar());
    });
  }

  private async carregar() {
    try {
      const itens = await q<{ registro_id: string; valor: number }[]>(
        supabase.from('registro_itens').select('registro_id, valor').eq('carteira_id', this.s.carteiraId()!),
      );
      const m = new Map<string, { total: number; qtd: number }>();
      for (const i of itens) {
        const a = m.get(i.registro_id) ?? { total: 0, qtd: 0 };
        a.total += i.valor;
        a.qtd++;
        m.set(i.registro_id, a);
      }
      this.totais.set(m);
    } catch (e) {
      this.toast.erro(e);
    }
  }

  novo() {
    this.f = { nome: '', icone: 'menu_book', cor: '#0ea5e9' };
    this.aberto.set(true);
  }

  async salvar() {
    if (!this.f.nome.trim()) return this.toast.erro('Informe o nome');
    this.salvando.set(true);
    try {
      await this.s.salvar('registros', { nome: this.f.nome.trim(), icone: this.f.icone || 'menu_book', cor: this.f.cor });
      this.toast.ok('Registro criado');
      this.aberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }
}
