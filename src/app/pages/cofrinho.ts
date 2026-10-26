import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { hoje } from '../core/datas';
import { aporteMensal } from '../core/financas';
import { BrlPipe, DiaPipe, parseValor, soma } from '../core/formato';
import { CofrinhoMov } from '../core/models';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { IconePicker } from '../shared/icone-picker';
import { Sheet } from '../shared/sheet';
import { Toast } from '../shared/toast';

@Component({
  imports: [FormsModule, RouterLink, BrlPipe, DiaPipe, Icon, IconePicker, Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <a routerLink="/cofrinhos" class="btn ghost icon" aria-label="Voltar"><app-icon name="chevron_left" [size]="18" /></a>
        <h1 class="grow">{{ c()?.nome ?? 'Cofrinho' }}</h1>
        @if (c()) {
          <button class="btn ghost icon" type="button" (click)="editar()" aria-label="Editar"><app-icon name="edit" [size]="18" /></button>
        }
      </div>

      @if (c(); as cf) {
        <div class="card hero">
          <span class="ico big" [style.background]="cf.cor + '22'" [style.color]="cf.cor"><app-icon [name]="cf.icone" /></span>
          <div class="num total">{{ guardado() | brl }}</div>
          @if (cf.meta > 0) {
            <p class="muted num">de {{ cf.meta | brl }} · <b>{{ pct() }}%</b></p>
            <div class="bar"><i [style.width.%]="pct() > 100 ? 100 : pct()" [style.background]="cf.cor"></i></div>
            @if (guardado() >= cf.meta) {
              <span class="badge ok"><app-icon name="celebration" [size]="14" />Meta atingida</span>
            } @else {
              <p class="small muted num">Faltam {{ cf.meta - guardado() | brl }}</p>
            }
          }
          @if (aporte(); as a) {
            <p class="small">Guarde <b class="num">{{ a | brl }}</b> por mês para chegar no prazo.</p>
          }
          <div class="acoes">
            <button class="btn" type="button" (click)="mover(1)">Depositar</button>
            <button class="btn ghost" type="button" (click)="mover(-1)">Retirar</button>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Histórico</h2></div>
          @if (movs().length) {
            <div class="list">
              @for (m of movs(); track m.id) {
                <button class="row" type="button" (click)="excluirMov(m)">
                  <span class="ico"><app-icon [name]="m.valor >= 0 ? '⬆️' : '⬇️'" /></span>
                  <div class="grow">
                    <div class="t">{{ m.descricao || (m.valor >= 0 ? 'Depósito' : 'Retirada') }}</div>
                    <div class="s">{{ m.data | dia }}</div>
                  </div>
                  <div class="v" [class.pos]="m.valor >= 0" [class.neg]="m.valor < 0">{{ m.valor | brl }}</div>
                </button>
              }
            </div>
          } @else {
            <p class="empty">Nenhuma movimentação ainda.</p>
          }
        </div>
      } @else {
        <div class="card empty"><app-icon class="big" name="savings" [size]="40" /><p>Cofrinho não encontrado.</p></div>
      }
    </div>

    <app-sheet [(open)]="movAberto" [titulo]="sinal() > 0 ? 'Depositar' : 'Retirar'">
      <form class="form" (ngSubmit)="salvarMov()">
        <label class="field"><span>Valor (R$)</span><input name="valor" inputmode="decimal" [(ngModel)]="m.valor" placeholder="0,00" autofocus /></label>
        <label class="field"><span>Data</span><input name="data" type="date" [(ngModel)]="m.data" /></label>
        <label class="field"><span>Descrição (opcional)</span><input name="descricao" [(ngModel)]="m.descricao" /></label>
        <button class="btn block" [disabled]="salvando()">Salvar</button>
      </form>
    </app-sheet>

    <app-sheet [(open)]="editAberto" titulo="Editar cofrinho">
      <form class="form" (ngSubmit)="salvarCofrinho()">
        <label class="field"><span>Nome</span><input name="nome" [(ngModel)]="f.nome" /></label>
        <div class="grid2">
          <label class="field"><span>Meta (R$)</span><input name="meta" inputmode="decimal" [(ngModel)]="f.meta" /></label>
          <label class="field"><span>Prazo</span><input name="prazo" type="date" [(ngModel)]="f.prazo" /></label>
        </div>
        <label class="field"><span>Cor</span><input name="cor" type="color" [(ngModel)]="f.cor" /></label>
        <div class="field"><span>Ícone</span><app-icone-picker [(valor)]="f.icone" [cor]="f.cor" /></div>
        <button class="btn block" [disabled]="salvando()">Salvar</button>
        <button class="btn danger block" type="button" (click)="excluir()">Excluir cofrinho</button>
      </form>
    </app-sheet>
  `,
  styles: `
    .grow { flex: 1; }
    .hero { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
    .hero .bar { width: 100%; }
    .ico.big { width: 56px; height: 56px; font-size: 1.8rem; border-radius: 16px; }
    .total { font-size: 1.8rem; font-weight: 800; }
    .acoes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; margin-top: 6px; }
  `,
})
export default class Cofrinho {
  readonly id = input.required<string>();
  protected s = inject(Store);
  private toast = inject(Toast);
  private router = inject(Router);

  protected movAberto = signal(false);
  protected editAberto = signal(false);
  protected salvando = signal(false);
  protected sinal = signal(1);
  m = { valor: '', data: hoje(), descricao: '' };
  f = { nome: '', meta: '', prazo: '', icone: '', cor: '' };

  protected c = computed(() => this.s.cofrinhos().find((x) => x.id === this.id()) ?? null);
  protected movs = computed(() =>
    this.s.cofrinhoMovs().filter((m) => m.cofrinho_id === this.id()).sort((a, b) => b.data.localeCompare(a.data)),
  );
  protected guardado = computed(() => soma(this.movs(), (m) => m.valor));
  protected pct = computed(() => {
    const meta = this.c()?.meta ?? 0;
    return meta > 0 ? Math.round((this.guardado() / meta) * 100) : 0;
  });
  protected aporte = computed(() => {
    const c = this.c();
    return c ? aporteMensal(c.meta, this.guardado(), c.prazo, this.s.mes()) : null;
  });

  mover(sinal: number) {
    this.sinal.set(sinal);
    this.m = { valor: '', data: hoje(), descricao: '' };
    this.movAberto.set(true);
  }

  async salvarMov() {
    const v = parseValor(this.m.valor);
    if (v <= 0) return this.toast.erro('Informe o valor');
    this.salvando.set(true);
    try {
      await this.s.salvar('cofrinho_movs', {
        cofrinho_id: this.id(),
        valor: v * this.sinal(),
        data: this.m.data,
        descricao: this.m.descricao.trim() || null,
      });
      this.toast.ok(this.sinal() > 0 ? 'Depositado' : 'Retirado');
      this.movAberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  async excluirMov(m: CofrinhoMov) {
    if (!confirm('Excluir esta movimentação?')) return;
    try {
      await this.s.excluir('cofrinho_movs', m.id);
      this.toast.ok('Excluído');
    } catch (e) {
      this.toast.erro(e);
    }
  }

  editar() {
    const c = this.c()!;
    this.f = { nome: c.nome, meta: String(c.meta).replace('.', ','), prazo: c.prazo ?? '', icone: c.icone, cor: c.cor };
    this.editAberto.set(true);
  }

  async salvarCofrinho() {
    if (!this.f.nome.trim()) return this.toast.erro('Informe o nome');
    this.salvando.set(true);
    try {
      await this.s.salvar('cofrinhos', {
        id: this.id(),
        nome: this.f.nome.trim(),
        meta: parseValor(this.f.meta),
        prazo: this.f.prazo || null,
        icone: this.f.icone || 'savings',
        cor: this.f.cor,
      });
      this.toast.ok('Salvo');
      this.editAberto.set(false);
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.salvando.set(false);
    }
  }

  async excluir() {
    if (!confirm('Excluir o cofrinho e todo o histórico?')) return;
    try {
      await this.s.excluir('cofrinhos', this.id());
      await this.s.recarregar('cofrinho_movs');
      this.toast.ok('Cofrinho excluído');
      this.router.navigateByUrl('/cofrinhos');
    } catch (e) {
      this.toast.erro(e);
    }
  }
}
