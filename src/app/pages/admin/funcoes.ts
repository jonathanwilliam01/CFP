import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Admin } from '../../core/admin';
import { FUNCOES, Funcao, Funcoes } from '../../core/funcoes';
import { Icon } from '../../shared/icon';
import { Toast } from '../../shared/toast';

@Component({
  imports: [DatePipe, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'fechar()' },
  template: `
    <div class="top"><h2>Funções</h2></div>
    <div class="c">
      <table>
        <thead><tr><th>Função</th><th>Status</th><th>Mensagem aos usuários</th><th>Desde</th><th></th></tr></thead>
        <tbody>
          @for (f of funcoes; track f.chave) {
            @let s = status()[f.chave];
            @let off = s?.ativa === false;
            <tr>
              <td>{{ f.nome }}</td>
              <td><span class="pill" [class.ok]="!off" [class.no]="off">{{ off ? 'manutenção' : 'liberada' }}</span></td>
              <td [class.note]="!off || !s?.mensagem">{{ off && s?.mensagem ? s.mensagem : '—' }}</td>
              <td class="note">{{ off && s?.desde ? (s.desde | date: 'dd/MM HH:mm') : '' }}</td>
              <td class="fim">
                @if (off) {
                  <a class="btn ghost" routerLink="/admin/avisos" [queryParams]="{ novo: 'manutencao', funcao: f.chave }"><app-icon name="campaign" [size]="16" />Criar aviso de manutenção</a>
                }
                <button type="button" class="sw" [class.off]="off" role="switch" [attr.aria-checked]="!off" [attr.aria-label]="f.nome" [disabled]="ocupado()" (click)="alternar(f, off)"></button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    @if (desligando(); as f) {
      <div class="fundo" (click)="fechar()"></div>
      <div class="modal" role="alertdialog" aria-modal="true">
        <h3>Desligar {{ f.nome }}</h3>
        <p>Quem estiver nessa tela vai para "Em manutenção" na hora. Mensagem aos usuários:</p>
        <input type="text" aria-label="Mensagem" [value]="msg()" (input)="msg.set($any($event.target).value)" />
        <div class="bts">
          <button type="button" class="btn ghost" (click)="fechar()" [disabled]="ocupado()">Cancelar</button>
          <button type="button" class="btn perigo" (click)="salvar(f, false, msg().trim() || null)" [disabled]="ocupado()">Desligar</button>
        </div>
      </div>
    }
  `,
  styles: `
    .top { margin-bottom: 18px; }
    h2 { margin: 0; font-size: 20px; }
    .c { background: var(--card); border-radius: var(--radius); padding: 6px 14px; box-shadow: var(--shadow); overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; color: var(--ink-3); font-weight: 500; font-size: 12px; padding: 8px; border-bottom: 1px solid var(--line); }
    td { padding: 9px 8px; border-bottom: 1px solid var(--line); }
    .note { font-size: 12px; color: var(--ink-3); }
    .pill { font-size: 11px; padding: 2px 8px; border-radius: 20px; }
    .pill.ok { background: var(--ok-soft); color: var(--ok); }
    .pill.no { background: var(--danger-soft); color: var(--danger); }
    .fim { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
    .fim .btn { font-size: 12px; padding: 5px 10px; display: inline-flex; gap: 6px; align-items: center; white-space: nowrap; }
    .sw { width: 34px; height: 20px; border-radius: 20px; border: 0; background: var(--ok); position: relative; cursor: pointer; flex-shrink: 0; padding: 0; }
    .sw::after { content: ''; position: absolute; right: 2px; top: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; }
    .sw.off { background: var(--ink-3); }
    .sw.off::after { right: auto; left: 2px; }
    .fundo { position: fixed; inset: 0; z-index: 70; background: rgb(0 0 0 / 0.5); }
    .modal { position: fixed; z-index: 71; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(400px, calc(100vw - 32px)); background: var(--card); color: var(--ink); border-radius: 20px; padding: 20px; box-shadow: 0 20px 50px rgb(0 0 0 / 0.35); display: flex; flex-direction: column; gap: 10px; }
    .modal h3 { margin: 0; font-size: 16px; }
    .modal p { margin: 0; color: var(--ink-2); font-size: 13px; }
    .bts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
    .btn.perigo { background: var(--danger); color: #fff; }
  `,
})
export default class AdminFuncoes {
  private admin = inject(Admin);
  private toast = inject(Toast);
  protected status = inject(Funcoes).status;
  protected funcoes = FUNCOES;
  protected desligando = signal<Funcao | null>(null);
  protected msg = signal('');
  protected ocupado = signal(false);

  protected alternar(f: Funcao, off: boolean) {
    if (off) {
      this.salvar(f, true, null);
      return;
    }
    this.msg.set('Volta em breve.');
    this.desligando.set(f);
  }

  protected fechar() {
    if (!this.ocupado()) this.desligando.set(null);
  }

  protected async salvar(f: Funcao, ativa: boolean, mensagem: string | null) {
    this.ocupado.set(true);
    try {
      await this.admin.salvarFuncao(f.chave, ativa, mensagem);
      this.toast.ok(ativa ? `${f.nome} liberada` : `${f.nome} em manutenção`);
      this.ocupado.set(false);
      this.fechar();
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }
}
