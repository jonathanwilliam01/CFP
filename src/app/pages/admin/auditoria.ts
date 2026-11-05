import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Admin } from '../../core/admin';
import { AdminLog } from '../../core/models';
import { Icon } from '../../shared/icon';

const FILTROS = [
  ['', 'Todas'],
  ['suspender', 'Suspensões'],
  ['reativar', 'Reativações'],
  ['excluir', 'Exclusões'],
  ['senha', 'Redefinições de senha'],
  ['funcoes_status', 'Funções'],
  ['comunicados', 'Avisos'],
  ['comunicado_tags', 'Tags'],
];

export function resumo(d: unknown): string {
  if (d == null || typeof d !== 'object') return d == null ? '' : String(d).slice(0, 120);
  const o = d as Record<string, unknown>;
  const r = (o['new'] ?? o['novo'] ?? o) as Record<string, unknown>;
  const campos = ['motivo', 'titulo', 'chave', 'nome', 'ativa', 'publicado'];
  const partes = campos.filter((k) => r && r[k] != null).map((k) => `${k}: ${r[k]}`);
  const s = partes.length ? partes.join(' · ') : JSON.stringify(d);
  return s.length > 120 ? s.slice(0, 120) + '…' : s;
}

@Component({
  imports: [DatePipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="top">
      <h2>Auditoria</h2>
      <select aria-label="Filtrar por ação" (change)="mudar($any($event.target).value)">
        @for (f of filtros; track f[0]) {
          <option [value]="f[0]">{{ f[1] }}</option>
        }
      </select>
    </div>
    @if (erro()) {
      <div class="alert"><app-icon name="error" [size]="18" />{{ erro() }}</div>
      <button class="btn" type="button" (click)="carregar()">Tentar de novo</button>
    } @else if (itens(); as l) {
      <section class="c">
        <table>
          <thead><tr><th>Data</th><th>Ação</th><th>Alvo</th><th>Detalhe</th></tr></thead>
          <tbody>
            @for (x of l; track x.id) {
              <tr>
                <td class="nw">{{ x.criado_em | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td>{{ x.acao }}</td>
                <td class="alvo">{{ x.alvo || '—' }}</td>
                <td class="det">{{ resumo(x.detalhe) }}</td>
              </tr>
            } @empty {
              <tr><td colspan="4" class="note">Nenhum registro.</td></tr>
            }
          </tbody>
        </table>
      </section>
    } @else {
      <p class="note">Carregando…</p>
    }
  `,
  styles: `
    .top { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
    h2 { margin: 0; font-size: 20px; }
    select { margin-left: auto; font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 8px; background: var(--card); color: var(--ink); border: 1px solid var(--line); }
    .alert { display: flex; gap: 10px; align-items: center; padding: 9px 12px; border-radius: 10px; font-size: 13px; margin-bottom: 8px; background: var(--danger-soft); color: var(--danger); }
    .c { background: var(--card); border-radius: var(--radius); padding: 14px; box-shadow: var(--shadow); overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; color: var(--ink-3); font-weight: 500; font-size: 12px; padding: 6px 8px; border-bottom: 1px solid var(--line); }
    td { padding: 9px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
    .nw { white-space: nowrap; }
    .alvo, .det { word-break: break-word; }
    .det { color: var(--ink-2); }
    .note { font-size: 12px; color: var(--ink-3); }
    @media (max-width: 640px) {
      select { margin-left: 0; width: 100%; }
      .c { padding: 0 14px; }
      thead { display: none; }
      table, tbody { display: block; }
      tr { display: flex; flex-wrap: wrap; gap: 3px 10px; padding: 11px 0; border-bottom: 1px solid var(--line); }
      tr:last-child { border-bottom: 0; }
      td { padding: 0; border: 0; }
      td:nth-child(2) { font-weight: 600; }
      .nw { order: 2; margin-left: auto; font-size: 12px; color: var(--ink-3); }
      .alvo, .det { order: 3; flex-basis: 100%; font-size: 12px; }
    }
  `,
})
export default class AdminAuditoria {
  private admin = inject(Admin);
  protected filtros = FILTROS;
  protected resumo = resumo;
  protected acao = signal('');
  protected itens = signal<AdminLog[] | null>(null);
  protected erro = signal('');

  constructor() {
    this.carregar();
  }

  protected mudar(a: string) {
    this.acao.set(a);
    this.itens.set(null);
    this.carregar();
  }

  protected async carregar() {
    const a = this.acao();
    try {
      const l = await this.admin.log(a || undefined);
      if (a !== this.acao()) return;
      this.itens.set(l);
      this.erro.set('');
    } catch (e) {
      if (a === this.acao()) this.erro.set(`Não foi possível carregar: ${(e as Error).message}`);
    }
  }
}
