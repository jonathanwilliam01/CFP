import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Admin } from '../../core/admin';
import { FUNCOES } from '../../core/funcoes';
import { migracoesFaltando } from '../../core/migracoes';
import { AdminMetricas } from '../../core/models';
import { Icon } from '../../shared/icon';

const NOMES = Object.fromEntries(FUNCOES.map((f) => [f.chave, f.nome]));

@Component({
  imports: [DecimalPipe, DatePipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="top">
      <h2>Visão geral</h2>
      <div class="per">
        @for (d of periodos; track d) {
          <button type="button" [attr.aria-pressed]="dias() === d" [class.on]="dias() === d" (click)="mudar(d)">{{ d }} dias</button>
        }
      </div>
    </div>

    @for (n of faltando(); track n) {
      <div class="alert"><app-icon name="warning" [size]="18" />Migration {{ n }} não aplicada no banco</div>
    }
    @if (erro()) {
      <div class="alert err"><app-icon name="error" [size]="18" />{{ erro() }}</div>
    }

    @if (m(); as m) {
      <div class="kpis">
        <div class="k"><div class="l">Usuários</div><div class="v">{{ m.usuarios | number }}</div><div class="d">+{{ m.novos }} no período</div></div>
        <div class="k"><div class="l">Carteiras</div><div class="v">{{ m.carteiras | number }}</div><div class="d">{{ m.casais }} casais</div></div>
        <div class="k"><div class="l">Ativos hoje / mês</div><div class="v">{{ m.dau }} / {{ m.mau }}</div><div class="d">DAU/MAU {{ razao(m) }}</div></div>
        <div class="k"><div class="l">Lançamentos/dia</div><div class="v">{{ lancDia() | number: '1.0-1' }}</div><div class="d">média do período</div></div>
        <div class="k"><div class="l">Erros em 24h</div><div class="v" [class.bad]="m.erros_24h > 0">{{ m.erros_24h }}</div></div>
      </div>

      <div class="grid">
        <section class="c">
          <h3>Ativos por dia</h3>
          <div class="bars">
            @for (x of m.ativos_dia; track x.dia) {
              <i [style.height.%]="altura(x.n)" [title]="(x.dia | date: 'dd/MM') + ': ' + x.n"></i>
            } @empty {
              <p class="note">Sem dados.</p>
            }
          </div>
        </section>
        <section class="c">
          <h3>Uso por função (carteiras)</h3>
          @for (u of usoFuncoes(); track u.chave) {
            <div class="hbar"><b>{{ u.nome }}</b><span [style.width.%]="u.pct"></span><em>{{ u.carteiras }}</em></div>
          } @empty {
            <p class="note">Sem dados.</p>
          }
        </section>
      </div>

      <div class="grid">
        <section class="c">
          <h3>Retenção</h3>
          <table>
            <thead><tr><th>Coorte</th><th>Usuários</th><th>M1</th><th>M2</th><th>M3</th></tr></thead>
            <tbody>
              @for (r of m.retencao; track r.coorte) {
                <tr>
                  <td>{{ r.coorte | date: 'MM/yyyy' }}</td><td>{{ r.usuarios }}</td>
                  <td>{{ pct(r.m1, r.usuarios) }}</td><td>{{ pct(r.m2, r.usuarios) }}</td><td>{{ pct(r.m3, r.usuarios) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="note">Sem dados.</td></tr>
              }
            </tbody>
          </table>
        </section>
        <section class="c">
          <h3>Versões em uso</h3>
          @for (v of m.versoes; track v.versao) {
            <div class="ver"><b>{{ v.versao }}</b><span>{{ v.n }}</span></div>
          } @empty {
            <p class="note">Sem dados.</p>
          }
        </section>
      </div>

      <p class="note">
        @if (m.telemetria_desde) { Dados desde {{ m.telemetria_desde | date: 'dd/MM' }} · }
        <a href="https://vercel.com/dashboard" target="_blank" rel="noopener">Speed Insights ↗</a>
      </p>
    } @else if (!erro()) {
      <p class="note">Carregando…</p>
    } @else {
      <button class="btn" type="button" (click)="carregar()">Tentar de novo</button>
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
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .k, .c { background: var(--card); border-radius: var(--radius); padding: 14px; box-shadow: var(--shadow); }
    .l { font-size: 12px; color: var(--ink-2); }
    .v { font-size: 24px; font-weight: 700; margin-top: 4px; }
    .v.bad { color: var(--danger); }
    .d { font-size: 11px; color: var(--ok); }
    .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 12px; }
    h3 { margin: 0 0 10px; font-size: 13px; color: var(--ink-2); font-weight: 600; }
    .bars { display: flex; align-items: flex-end; gap: 3px; height: 130px; }
    .bars i { flex: 1; min-height: 2px; background: var(--primary); border-radius: 4px 4px 0 0; opacity: 0.85; }
    .hbar { display: flex; align-items: center; gap: 8px; font-size: 12px; margin: 6px 0; }
    .hbar b { font-weight: 500; width: 90px; flex-shrink: 0; }
    .hbar span { height: 8px; background: var(--primary); border-radius: 4px; }
    .hbar em { font-style: normal; color: var(--ink-2); }
    .ver { display: flex; justify-content: space-between; font-size: 13px; padding: 5px 0; border-bottom: 1px solid var(--line); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; color: var(--ink-3); font-weight: 500; font-size: 12px; padding: 6px 8px; border-bottom: 1px solid var(--line); }
    td { padding: 9px 8px; border-bottom: 1px solid var(--line); }
    .note { font-size: 12px; color: var(--ink-3); }
    .note a { color: var(--primary); }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  `,
})
export default class AdminVisao {
  private admin = inject(Admin);
  protected periodos = [7, 30, 90];
  protected dias = signal(30);
  protected m = signal<AdminMetricas | null>(null);
  protected erro = signal('');
  protected faltando = signal<string[]>([]);

  protected lancDia = computed(() => {
    const l = this.m()?.lancamentos_dia ?? [];
    return l.length ? l.reduce((s, x) => s + x.n, 0) / l.length : 0;
  });
  private maxAtivos = computed(() => Math.max(1, ...(this.m()?.ativos_dia ?? []).map((x) => x.n)));
  protected usoFuncoes = computed(() => {
    const l = this.m()?.uso_funcoes ?? [];
    const max = Math.max(1, ...l.map((x) => x.carteiras));
    return l.map((x) => ({ ...x, nome: NOMES[x.chave] ?? x.chave, pct: (x.carteiras / max) * 100 }));
  });

  constructor() {
    this.carregar();
    this.checarMigrations();
  }

  protected mudar(d: number) {
    this.dias.set(d);
    this.carregar();
  }

  protected altura(n: number) {
    return (n / this.maxAtivos()) * 100;
  }

  protected razao(m: AdminMetricas) {
    return m.mau ? Math.round((m.dau / m.mau) * 100) + '%' : '—';
  }

  protected pct(n: number | null, total: number) {
    return n == null ? '—' : total ? Math.round((n / total) * 100) + '%' : '—';
  }

  protected async carregar() {
    const d = this.dias();
    try {
      const m = await this.admin.metricas(d);
      if (d === this.dias()) {
        this.m.set(m);
        this.erro.set('');
      }
    } catch (e) {
      if (d === this.dias()) this.erro.set(`Não foi possível carregar as métricas: ${(e as Error).message}`);
    }
  }

  private async checarMigrations() {
    this.faltando.set((await migracoesFaltando()).map((m) => m.migracao));
  }
}
