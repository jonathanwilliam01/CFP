import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { Chat } from '../core/chat';
import { iso } from '../core/datas';
import { DiaPipe } from '../core/formato';
import { Insights } from '../core/insights';
import { Mensagem } from '../core/models';
import { Store } from '../core/store';
import { Icon } from '../shared/icon';
import { Toast } from '../shared/toast';

@Component({
  imports: [FormsModule, RouterLink, DiaPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <h1>Chat</h1>
        <span class="badge">{{ s.carteira()?.nome }}</span>
      </div>

      @if (s.membros().length < 2) {
        <div class="aviso info">
          <app-icon class="i" name="group_add" />
          <div><div class="t">Só você nesta carteira</div><div class="s">Convide alguém em <a routerLink="/config">Configurações</a> → Carteira para conversar aqui.</div></div>
        </div>
      } @else if (insights.permissao() === 'default') {
        <div class="aviso info">
          <app-icon class="i" name="notifications" />
          <div><div class="t">Avisos de mensagens</div><div class="s">Ative as notificações para saber quando chegar mensagem com o app em segundo plano.</div>
            <button class="btn ghost sm ativa" type="button" (click)="insights.pedirPermissao()">Ativar</button></div>
        </div>
      }

      <div class="msgs">
        @for (d of dias(); track d.data) {
          <div class="day-label">{{ d.data | dia }}</div>
          @for (m of d.itens; track m.id) {
            <div class="msg" [class.eu]="m.eu">
              @if (m.nome) { <span class="quem">{{ m.nome }}</span> }
              <p>{{ m.texto }}</p>
              <span class="hora">{{ m.hora }}</span>
            </div>
          }
        } @empty {
          <div class="empty"><app-icon class="big" name="forum" [size]="40" />Nenhuma mensagem ainda.</div>
        }
      </div>

      <form class="enviar" (ngSubmit)="enviar()">
        <input name="texto" placeholder="Mensagem" autocomplete="off" maxlength="2000" [ngModel]="texto()" (ngModelChange)="texto.set($event)" />
        <button class="btn icon" type="submit" [disabled]="!texto().trim() || enviando()" aria-label="Enviar"><app-icon name="send" [size]="20" /></button>
      </form>
    </div>
  `,
  styles: `
    .page { padding-bottom: calc(var(--nav-h) + var(--safe-b) + 30px); min-height: calc(100dvh - 60px); }
    .ativa { margin-top: 8px; }
    .msgs { flex: 1; display: flex; flex-direction: column; gap: 4px; }
    .day-label { align-self: center; margin: 10px 0 4px; }
    .msg {
      align-self: flex-start; max-width: 80%; padding: 7px 12px; border-radius: 16px 16px 16px 4px;
      background: var(--card); border: 1px solid var(--line);
    }
    .msg.eu { align-self: flex-end; background: var(--primary); color: var(--primary-ink); border-color: transparent; border-radius: 16px 16px 4px 16px; }
    .msg p { white-space: pre-wrap; overflow-wrap: anywhere; }
    .quem { display: block; font-size: 0.75rem; font-weight: 700; color: var(--primary); }
    .hora { display: block; text-align: right; font-size: 0.68rem; opacity: 0.7; margin-top: 1px; }
    .enviar {
      position: sticky; bottom: calc(var(--nav-h) + var(--safe-b) + 30px);
      display: flex; gap: 8px; padding: 8px 0; background: var(--bg);
    }
    .enviar .btn { width: 46px; min-height: 46px; flex-shrink: 0; }
    @media (min-width: 720px) {
      .page { padding-bottom: 104px; }
      .enviar { bottom: 104px; }
    }
    @media (min-width: 1024px) {
      .page { padding-bottom: 16px; }
      .enviar { bottom: 16px; }
    }
  `,
})
export default class ChatPage {
  protected s = inject(Store);
  protected insights = inject(Insights);
  private chat = inject(Chat);
  private auth = inject(Auth);
  private toast = inject(Toast);

  protected texto = signal('');
  protected enviando = signal(false);

  protected dias = computed(() => {
    const eu = this.auth.user()?.id;
    const grupos = new Map<string, (Mensagem & { eu: boolean; nome: string; hora: string })[]>();
    let ant: Mensagem | undefined;
    for (const m of this.chat.mensagens()) {
      const d = new Date(m.criado_em);
      const dia = iso(d);
      const novoBloco = !ant || ant.user_id !== m.user_id || iso(new Date(ant.criado_em)) !== dia;
      const item = {
        ...m,
        eu: m.user_id === eu,
        nome: m.user_id !== eu && novoBloco ? (this.s.membroMap().get(m.user_id) ?? '') : '',
        hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };
      grupos.set(dia, [...(grupos.get(dia) ?? []), item]);
      ant = m;
    }
    return [...grupos.entries()].map(([data, itens]) => ({ data, itens }));
  });

  constructor() {
    this.chat.aberto.set(true);
    inject(DestroyRef).onDestroy(() => this.chat.aberto.set(false));
    effect(() => {
      this.chat.mensagens();
      untracked(() => {
        this.chat.marcarLidas();
        setTimeout(() => window.scrollTo({ top: document.body.scrollHeight }));
      });
    });
  }

  async enviar() {
    const t = this.texto().trim();
    if (!t) return;
    this.enviando.set(true);
    try {
      await this.chat.enviar(t);
      this.texto.set('');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.enviando.set(false);
    }
  }
}
