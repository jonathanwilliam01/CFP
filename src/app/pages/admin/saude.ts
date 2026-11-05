import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Admin } from '../../core/admin';
import { MigracaoFaltando, migracoesFaltando } from '../../core/migracoes';
import { AdminErros } from '../../core/models';
import { Icon } from '../../shared/icon';

@Component({
  imports: [DatePipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="top">
      <h2>Erros e saúde</h2>
      <div class="per">
        @for (d of periodos; track d) {
          <button type="button" [attr.aria-pressed]="dias() === d" [class.on]="dias() === d" (click)="mudar(d)">{{ d }} dias</button>
        }
      </div>
    </div>

    @if (erro()) {
      <div class="alert err"><app-icon name="error" [size]="18" />{{ erro() }}</div>
      <button class="btn" type="button" (click)="carregar()">Tentar de novo</button>
    }

    <section class="c">
      <h3>Migrations</h3>
      @if (migracoes() === null) {
        <p class="note">Verificando…</p>
      } @else if (!migracoes()!.length) {
        <p class="ok"><app-icon name="check" [size]="16" />Banco em dia</p>
      } @else {
        @for (m of migracoes(); track m.migracao) {
          <div class="alert"><app-icon name="warning" [size]="18" />Migration {{ m.migracao }} não aplicada: {{ m.itens.join(', ') }}</div>
        }
      }
    </section>

    @if (e(); as e) {
      <div class="grid">
        <section class="c">
          <h3>Erros por dia</h3>
          <div class="bars">
            @for (x of e.por_dia; track x.dia) {
              <i [style.height.%]="altura(x.n)" [title]="(x.dia | date: 'dd/MM') + ': ' + x.n"></i>
            } @empty {
              <p class="note">Nenhum erro no período.</p>
            }
          </div>
        </section>
        <section class="c">
          <h3>Versões em uso</h3>
          @for (v of versoes(); track v.versao) {
            <div class="ver"><b>{{ v.versao }}</b><span>{{ v.n }}</span></div>
          } @empty {
            <p class="note">Sem dados.</p>
          }
        </section>
      </div>

      <section class="c">
        <h3>Erros mais frequentes</h3>
        @for (f of e.frequentes; track f.mensagem) {
          <div class="erro">
            <div class="msg">{{ f.mensagem }}</div>
            <div class="meta">
              <b>{{ f.n }}x</b> · última {{ f.ultima | date: 'dd/MM HH:mm' }}
              · versões: {{ f.versoes.join(', ') || '—' }} · rotas: {{ f.rotas.join(', ') || '—' }}
            </div>
          </div>
        } @empty {
          <p class="note">Nenhum erro no período.</p>
        }
      </section>
    } @else if (!erro()) {
      <p class="note">Carregando…</p>
    }
  `,
  styles: `
    .top { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
    h2 { margin: 0; font-size: 20px; }
    .per { margin-left: auto; display: flex; gap: 4px; }
    .per button { font: inherit; font-size: 12px; padding: 5px 10px; border-radius: 8px; background: var(--card); color: var(--ink); border: 1px solid var(--line); cursor: pointer; }
    .per button.on { background: var(--primary); color: var(--primary-ink); border-color: var(--primary); }
    .alert { display: flex; gap: 10px; align-items: center; padding: 9px 12px; border-radius: 10px; font-size: 13px; margin-bottom: 8px; background: var(--warn-soft); color: var(--warn); }
    .alert.err { background: var(--danger-soft); color: var(--danger); }
    .c { background: var(--card); border-radius: var(--radius); padding: 14px; box-shadow: var(--shadow); margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; }
    h3 { margin: 0 0 10px; font-size: 13px; color: var(--ink-2); font-weight: 600; }
    .ok { display: flex; gap: 6px; align-items: center; margin: 0; font-size: 13px; color: var(--ok); }
    .bars { display: flex; align-items: flex-end; gap: 3px; height: 130px; }
    .bars i { flex: 1; min-height: 2px; background: var(--danger); border-radius: 4px 4px 0 0; opacity: 0.85; }
    .ver { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; border-bottom: 1px solid var(--line); }
    .erro { padding: 9px 0; border-bottom: 1px solid var(--line); }
    .msg { font-size: 13px; font-weight: 500; word-break: break-word; }
    .meta { font-size: 12px; color: var(--ink-3); margin-top: 3px; }
    .meta b { color: var(--danger); }
    .note { font-size: 12px; color: var(--ink-3); }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export default class AdminSaude {
  private admin = inject(Admin);
  protected periodos = [7, 30, 90];
  protected dias = signal(30);
  protected e = signal<AdminErros | null>(null);
  protected versoes = signal<{ versao: string; n: number }[]>([]);
  protected erro = signal('');
  protected migracoes = signal<MigracaoFaltando[] | null>(null);
  private maximo = computed(() => Math.max(1, ...(this.e()?.por_dia ?? []).map((x) => x.n)));

  constructor() {
    this.carregar();
    migracoesFaltando().then((m) => this.migracoes.set(m), () => this.migracoes.set([]));
  }

  protected mudar(d: number) {
    this.dias.set(d);
    this.carregar();
  }

  protected altura(n: number) {
    return (n / this.maximo()) * 100;
  }

  protected async carregar() {
    const d = this.dias();
    try {
      const [e, m] = await Promise.all([this.admin.erros(d), this.admin.metricas(d)]);
      if (d !== this.dias()) return;
      this.e.set(e);
      this.versoes.set(m.versoes);
      this.erro.set('');
    } catch (x) {
      if (d === this.dias()) this.erro.set(`Não foi possível carregar: ${(x as Error).message}`);
    }
  }
}
