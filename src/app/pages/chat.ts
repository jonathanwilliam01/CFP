import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { Chat } from '../core/chat';
import { iso } from '../core/datas';
import { BrlPipe, DiaPipe } from '../core/formato';
import { Insights } from '../core/insights';
import { Gasto, Membro, Mensagem } from '../core/models';
import { Store } from '../core/store';
import { Avatar } from '../shared/avatar';
import { Icon } from '../shared/icon';
import { Lancar } from '../shared/lancar';
import { Toast } from '../shared/toast';
import { q, supabase } from '../core/supabase';
import { Visor } from '../shared/visor';

@Component({
  imports: [FormsModule, RouterLink, BrlPipe, DiaPipe, Avatar, Icon, Visor],
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
            <div class="linha" [class.eu]="m.eu">
              @if (m.membro; as mb) {
                <button type="button" class="foto" [disabled]="!mb.foto" (click)="foto.set(mb.foto?.url ?? null)" [attr.aria-label]="'Ver foto de ' + mb.nome">
                  <app-avatar [size]="30" [foto]="mb.foto ?? null" [nome]="mb.nome" />
                </button>
              } @else if (!m.eu) {
                <span class="foto"></span>
              }
              <div class="msg" [class.eu]="m.eu">
                @if (m.membro) { <span class="quem">{{ m.membro.nome }}</span> }
                @if (m.gasto_id) {
                  @if (gastos().get(m.gasto_id); as g) {
                    <button type="button" class="ref" (click)="lancar.editarGasto(g)"><app-icon name="receipt_long" [size]="16" /><span>{{ g.descricao }} · {{ g.valor | brl }}</span></button>
                  } @else {
                    <span class="ref"><app-icon name="receipt_long" [size]="16" /><span>Gasto excluído</span></span>
                  }
                }
                <p>{{ m.texto }}</p>
                <span class="hora">{{ m.hora }}</span>
              </div>
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

    <app-visor [(url)]="foto" />
  `,
  styles: `
    .page { padding-bottom: calc(var(--nav-h) + var(--safe-b) + 30px); min-height: calc(100dvh - 60px); }
    .ativa { margin-top: 8px; }
    .msgs { flex: 1; display: flex; flex-direction: column; gap: 4px; }
    .day-label { align-self: center; margin: 10px 0 4px; }
    .linha { display: flex; align-items: flex-end; gap: 6px; }
    .linha.eu { justify-content: flex-end; }
    .foto { width: 30px; flex-shrink: 0; border: 0; padding: 0; background: none; border-radius: 50%; cursor: pointer; align-self: flex-start; }
    .foto:disabled { cursor: default; }
    .msg {
      max-width: 80%; padding: 7px 12px; border-radius: 16px 16px 16px 4px;
      background: var(--card); border: 1px solid var(--line);
    }
    .msg.eu { background: var(--primary); color: var(--primary-ink); border-color: transparent; border-radius: 16px 16px 4px 16px; }
    .msg p { white-space: pre-wrap; overflow-wrap: anywhere; }
    .ref {
      display: flex; align-items: center; gap: 6px; margin: 2px 0 4px; padding: 5px 8px; border-radius: 10px; border: 0;
      background: rgb(127 127 127 / 0.14); color: inherit; font: inherit; font-size: 0.8rem; font-weight: 700; cursor: pointer; text-align: left; max-width: 100%;
    }
    .ref span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  protected foto = signal<string | null>(null);
  protected lancar = inject(Lancar);
  /** gastos comentados que não estão no mês carregado */
  private extras = signal<Gasto[]>([]);
  protected gastos = computed(() => new Map([...this.extras(), ...this.s.gastos()].map((g) => [g.id, g])));

  protected dias = computed(() => {
    const eu = this.auth.user()?.id;
    const grupos = new Map<string, (Mensagem & { eu: boolean; membro?: Membro; hora: string })[]>();
    let ant: Mensagem | undefined;
    for (const m of this.chat.mensagens()) {
      const d = new Date(m.criado_em);
      const dia = iso(d);
      const novoBloco = !ant || ant.user_id !== m.user_id || iso(new Date(ant.criado_em)) !== dia;
      const item = {
        ...m,
        eu: m.user_id === eu,
        // foto e nome só na primeira mensagem do bloco
        membro: m.user_id !== eu && novoBloco ? this.s.membroPorId().get(m.user_id) : undefined,
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
      const ids = [...new Set(this.chat.mensagens().map((m) => m.gasto_id).filter((x): x is string => !!x))];
      untracked(() => {
        const faltam = ids.filter((id) => !this.gastos().has(id));
        if (faltam.length)
          q<Gasto[]>(supabase.from('gastos').select('*').in('id', faltam)).then((l) => this.extras.update((a) => [...a, ...l]), () => undefined);
      });
    });
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
