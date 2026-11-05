import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Directive, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { Admin } from '../../core/admin';
import { Auth } from '../../core/auth';
import { AdminUsuario } from '../../core/models';
import { Icon } from '../../shared/icon';
import { Toast } from '../../shared/toast';

type Modal = { tipo: 'suspender' | 'excluir'; u: AdminUsuario } | null;

@Directive({ selector: '[appFoco]' })
class Foco {
  constructor() {
    const el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
    afterNextRender(() => el.focus());
  }
}

@Component({
  imports: [DatePipe, Icon, Foco],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'fechar()', '(document:click)': 'menu.set(null)', '(window:scroll)': 'menu.set(null)', '(window:resize)': 'menu.set(null)' },
  template: `
    <div class="top">
      <h2>Usuários</h2>
      <input type="search" placeholder="Buscar e-mail ou nome" aria-label="Buscar" [value]="busca()" (input)="busca.set($any($event.target).value)" />
    </div>

    @if (erro()) {
      <div class="alert"><app-icon name="error" [size]="18" />{{ erro() }}<button class="btn ghost" type="button" (click)="carregar()">Tentar de novo</button></div>
    }

    <div class="c">
      <table>
        <thead>
          <tr><th>Usuário</th><th>Carteira</th><th>Cadastro</th><th>Último uso</th><th>Lanç.</th><th>Versão</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          @for (u of lista(); track u.id) {
            <tr>
              <td>{{ u.nome || '—' }}<br /><span class="note">{{ u.email }}</span></td>
              <td>{{ u.carteira ? u.carteira + ' (' + u.membros + ')' : '—' }}</td>
              <td>{{ u.criado_em | date: 'dd/MM/yy' }}</td>
              <td>{{ u.ultimo_uso ? (u.ultimo_uso | date: 'dd/MM/yy') : '—' }}</td>
              <td>{{ u.lancamentos }}</td>
              <td>{{ u.versao || '—' }}</td>
              <td><span class="pill" [class.ok]="u.status === 'ativo'" [class.w]="u.status === 'parado'" [class.no]="u.status === 'suspenso'">{{ u.status }}</span></td>
              <td class="acoes">
                <button type="button" class="mais" aria-label="Ações" (click)="abrirMenu($event, u.id)"><app-icon name="more_vert" [size]="20" /></button>
                @if (menu() === u.id) {
                  <div class="menu" role="menu" [style.top.px]="pos().top" [style.right.px]="pos().right">
                    <button type="button" role="menuitem" (click)="detalhes.set(u)">Ver detalhes</button>
                    <button type="button" role="menuitem" (click)="senha(u)">Enviar redefinição de senha</button>
                    @if (u.id !== uid()) {
                      @if (u.status === 'suspenso') {
                        <button type="button" role="menuitem" (click)="reativar(u)">Reativar</button>
                      } @else {
                        <button type="button" role="menuitem" (click)="abrir('suspender', u)">Suspender</button>
                      }
                      <button type="button" role="menuitem" class="perigo" (click)="abrir('excluir', u)">Excluir conta</button>
                    }
                  </div>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="note">{{ carregando() ? 'Carregando…' : 'Nenhum usuário.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>

    @if (modal(); as m) {
      <div class="fundo" (click)="fechar()"></div>
      <div class="modal" role="alertdialog" aria-modal="true">
        @if (m.tipo === 'suspender') {
          <h3>Suspender {{ m.u.email }}</h3>
          <p>A pessoa perde o acesso na hora. Informe o motivo.</p>
          <input type="text" placeholder="Motivo" aria-label="Motivo" appFoco [value]="texto()" (input)="texto.set($any($event.target).value)" (keydown.enter)="texto().trim() && suspender(m.u)" />
          <div class="bts">
            <button type="button" class="btn ghost" (click)="fechar()" [disabled]="ocupado()">Cancelar</button>
            <button type="button" class="btn perigo" (click)="suspender(m.u)" [disabled]="ocupado() || !texto().trim()">Suspender</button>
          </div>
        } @else {
          <h3>Excluir conta</h3>
          <p>Apaga o acesso de {{ m.u.email }} para sempre. O histórico da carteira fica. Digite o e-mail para confirmar.</p>
          <input type="text" placeholder="E-mail da conta" aria-label="Confirmar e-mail" appFoco [value]="texto()" (input)="texto.set($any($event.target).value)" (keydown.enter)="excluir(m.u)" />
          <div class="bts">
            <button type="button" class="btn ghost" (click)="fechar()" [disabled]="ocupado()">Cancelar</button>
            <button type="button" class="btn perigo" (click)="excluir(m.u)" [disabled]="ocupado() || !confere(m.u)">Excluir</button>
          </div>
        }
      </div>
    }

    @if (detalhes(); as d) {
      <div class="fundo" (click)="fechar()"></div>
      <aside class="lado" aria-label="Detalhes">
        <header><h3>{{ d.nome || d.email }}</h3><button type="button" class="mais" aria-label="Fechar" (click)="fechar()"><app-icon name="close" [size]="20" /></button></header>
        <dl>
          <dt>ID</dt><dd>{{ d.id }}</dd>
          <dt>E-mail</dt><dd>{{ d.email }}</dd>
          <dt>Nome</dt><dd>{{ d.nome || '—' }}</dd>
          <dt>Cadastro</dt><dd>{{ d.criado_em | date: 'dd/MM/yyyy HH:mm' }}</dd>
          <dt>Último uso</dt><dd>{{ d.ultimo_uso ? (d.ultimo_uso | date: 'dd/MM/yyyy HH:mm') : '—' }}</dd>
          <dt>Versão</dt><dd>{{ d.versao || '—' }}</dd>
          <dt>Aparelho</dt><dd>{{ d.aparelho || '—' }}</dd>
          <dt>Carteira</dt><dd>{{ d.carteira || '—' }}</dd>
          <dt>Membros</dt><dd>{{ d.membros }}</dd>
          <dt>Papel</dt><dd>{{ d.papel || '—' }}</dd>
          <dt>Lançamentos</dt><dd>{{ d.lancamentos }}</dd>
          <dt>Último lançamento</dt><dd>{{ d.ultimo_lancamento ? (d.ultimo_lancamento | date: 'dd/MM/yyyy') : '—' }}</dd>
          <dt>Push</dt><dd>{{ d.push ? 'ativo' : 'inativo' }}</dd>
          <dt>Status</dt><dd>{{ d.status }}</dd>
        </dl>
      </aside>
    }
  `,
  styles: `
    .top { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
    h2 { margin: 0; font-size: 20px; }
    .top input { margin-left: auto; width: 240px; }
    .c { background: var(--card); border-radius: var(--radius); padding: 6px 14px; box-shadow: var(--shadow); overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; color: var(--ink-3); font-weight: 500; font-size: 12px; padding: 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
    td { padding: 9px 8px; border-bottom: 1px solid var(--line); }
    .note { font-size: 12px; color: var(--ink-3); }
    .pill { font-size: 11px; padding: 2px 8px; border-radius: 20px; }
    .pill.ok { background: var(--ok-soft); color: var(--ok); }
    .pill.no { background: var(--danger-soft); color: var(--danger); }
    .pill.w { background: var(--warn-soft); color: var(--warn); }
    .alert { display: flex; gap: 10px; align-items: center; padding: 9px 12px; border-radius: 10px; font-size: 13px; margin-bottom: 10px; background: var(--danger-soft); color: var(--danger); }
    .alert .btn { margin-left: auto; }
    .acoes { width: 36px; }
    .mais { border: 0; background: none; color: var(--ink-2); cursor: pointer; border-radius: 8px; padding: 4px; display: grid; }
    .mais:hover { background: var(--card-2); }
    .menu { position: fixed; z-index: 20; min-width: 220px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 4px; box-shadow: 0 10px 28px rgb(0 0 0 / 0.2); display: flex; flex-direction: column; }
    .menu button { border: 0; background: none; font: inherit; font-size: 13px; color: var(--ink); text-align: left; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
    .menu button:hover { background: var(--card-2); }
    .menu .perigo, .btn.perigo { color: var(--danger); }
    .btn.perigo { background: var(--danger); color: #fff; }
    .fundo { position: fixed; inset: 0; z-index: 70; background: rgb(0 0 0 / 0.5); }
    .modal { position: fixed; z-index: 71; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(400px, calc(100vw - 32px)); background: var(--card); color: var(--ink); border-radius: 20px; padding: 20px; box-shadow: 0 20px 50px rgb(0 0 0 / 0.35); display: flex; flex-direction: column; gap: 10px; }
    .modal h3, .lado h3 { margin: 0; font-size: 16px; color: var(--ink); }
    .modal p { margin: 0; color: var(--ink-2); font-size: 13px; }
    .bts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
    .lado { position: fixed; z-index: 71; right: 0; top: 0; bottom: 0; width: min(380px, 100vw); background: var(--card); color: var(--ink); padding: 18px; overflow-y: auto; box-shadow: -10px 0 40px rgb(0 0 0 / 0.3); }
    .lado header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    dl { display: grid; grid-template-columns: 120px 1fr; gap: 8px 10px; margin: 0; font-size: 13px; }
    dt { color: var(--ink-3); }
    dd { margin: 0; word-break: break-all; }
  `,
})
export default class AdminUsuarios {
  private admin = inject(Admin);
  private toast = inject(Toast);
  protected uid = inject(Auth).uid;
  private todos = signal<AdminUsuario[]>([]);
  protected busca = signal('');
  protected erro = signal('');
  protected carregando = signal(true);
  protected menu = signal<string | null>(null);
  protected pos = signal({ top: 0, right: 0 });
  protected modal = signal<Modal>(null);
  protected detalhes = signal<AdminUsuario | null>(null);
  protected texto = signal('');
  protected ocupado = signal(false);

  protected lista = computed(() => {
    const b = this.busca().trim().toLowerCase();
    return b ? this.todos().filter((u) => u.email.toLowerCase().includes(b) || (u.nome ?? '').toLowerCase().includes(b)) : this.todos();
  });

  constructor() {
    this.carregar();
  }

  protected async carregar() {
    this.carregando.set(true);
    try {
      this.todos.set(await this.admin.usuarios());
      this.erro.set('');
    } catch (e) {
      this.erro.set(`Não foi possível carregar os usuários: ${(e as Error).message}`);
    } finally {
      this.carregando.set(false);
    }
  }

  protected abrirMenu(e: Event, id: string) {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.pos.set({ top: Math.max(8, Math.min(r.bottom + 4, innerHeight - 200)), right: innerWidth - r.right });
    this.menu.set(this.menu() === id ? null : id);
  }

  protected abrir(tipo: 'suspender' | 'excluir', u: AdminUsuario) {
    this.texto.set('');
    this.modal.set({ tipo, u });
  }

  protected fechar() {
    if (this.ocupado()) return;
    this.modal.set(null);
    this.detalhes.set(null);
    this.menu.set(null);
  }

  protected confere(u: AdminUsuario) {
    return this.texto().trim().toLowerCase() === u.email.toLowerCase();
  }

  protected async senha(u: AdminUsuario) {
    this.menu.set(null);
    await this.rodar(() => this.admin.redefinirSenha(u.email), `Redefinição enviada para ${u.email}`);
  }

  protected reativar(u: AdminUsuario) {
    return this.rodar(() => this.admin.agir('reativar', u.id), 'Usuário reativado');
  }

  protected suspender(u: AdminUsuario) {
    return this.rodar(() => this.admin.agir('suspender', u.id, this.texto().trim()), 'Usuário suspenso');
  }

  protected excluir(u: AdminUsuario) {
    if (!this.confere(u)) return;
    return this.rodar(() => this.admin.agir('excluir', u.id), 'Conta excluída');
  }

  private async rodar(fn: () => Promise<unknown>, ok: string) {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.menu.set(null);
    try {
      await fn();
      this.toast.ok(ok);
      this.ocupado.set(false);
      this.fechar();
      await this.carregar();
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }
}
