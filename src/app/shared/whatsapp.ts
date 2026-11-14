import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Auth } from '../core/auth';
import { Store } from '../core/store';
import { q, supabase } from '../core/supabase';
import { Icon } from './icon';
import { Toast } from './toast';

/** Conecta o WhatsApp do membro ao bot (migration 047): código de 6 dígitos mandado ao número do bot */
@Component({
  selector: 'app-whatsapp',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form">
      @if (carregando()) {
        <p class="small muted">Carregando…</p>
      } @else if (!numero()) {
        <p class="small muted">O bot do WhatsApp ainda não foi configurado neste app (README → WhatsApp).</p>
      } @else if (telefone(); as t) {
        <p class="small tit"><app-icon name="check_circle" [size]="18" />Conectado: {{ t }}</p>
        <p class="small muted">Mande "mercado 50 nubank" ou encaminhe a notificação do banco. "desfazer" apaga o último; "resumo" mostra o mês.</p>
        <div class="linha">
          <a class="btn" [href]="link()" target="_blank" rel="noopener"><app-icon name="chat" [size]="18" />Abrir conversa</a>
          <button class="btn ghost" type="button" (click)="desconectar()" [disabled]="ocupado()">Desconectar</button>
        </div>
      } @else {
        <p class="small muted">Lance gastos mandando mensagem pelo WhatsApp, do seu jeito ou encaminhando a notificação do banco. Cada um conecta o próprio número.</p>
        @if (codigo(); as c) {
          <p class="codigo">Mande <b>CFP {{ c }}</b> para o bot (vale 15 minutos)</p>
          <div class="linha">
            <a class="btn" [href]="link('CFP ' + c)" target="_blank" rel="noopener"><app-icon name="send" [size]="18" />Abrir WhatsApp com o código</a>
            <button class="btn ghost" type="button" (click)="carregar()">Já mandei</button>
          </div>
        } @else {
          <button class="btn" type="button" (click)="conectar()" [disabled]="ocupado()"><app-icon name="chat" [size]="18" />Conectar WhatsApp</button>
        }
      }
    </div>
  `,
  styles: `
    .linha { display: flex; gap: 8px; flex-wrap: wrap; }
    .codigo { font-size: 0.95rem; }
    .codigo b { font-size: 1.1rem; letter-spacing: 0.04em; }
  `,
})
export class Whatsapp {
  private s = inject(Store);
  private auth = inject(Auth);
  private toast = inject(Toast);
  protected carregando = signal(true);
  protected ocupado = signal(false);
  protected numero = signal<string | null>(null);
  protected tel = signal<string | null>(null);
  protected codigo = signal<string | null>(null);
  /** +55 11 9****-1234 */
  protected telefone = computed(() => {
    const t = this.tel();
    return t ? `+${t.slice(0, 2)} ${t.slice(2, 4)} ${t.slice(4, 5)}****-${t.slice(-4)}` : null;
  });

  constructor() {
    this.carregar();
  }

  link(texto = '') {
    return `https://wa.me/${(this.numero() ?? '').replace(/\D/g, '')}${texto ? '?text=' + encodeURIComponent(texto) : ''}`;
  }

  async carregar() {
    try {
      const [cfg, v] = await Promise.all([
        q<{ numero: string | null } | null>(supabase.from('whatsapp_config').select('numero').maybeSingle()),
        q<{ telefone: string | null } | null>(supabase.from('whatsapp_vinculos').select('telefone').eq('user_id', this.auth.uid()!).maybeSingle()),
      ]);
      this.numero.set(cfg?.numero ?? null);
      this.tel.set(v?.telefone ?? null);
      if (v?.telefone) this.codigo.set(null);
    } catch {
      this.numero.set(null);
    } finally {
      this.carregando.set(false);
    }
  }

  async conectar() {
    this.ocupado.set(true);
    try {
      const c = await q<string>(supabase.rpc('whatsapp_codigo', { p_carteira: this.s.carteiraId() }));
      this.codigo.set(c);
      window.open(this.link('CFP ' + c), '_blank', 'noopener');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }

  async desconectar() {
    this.ocupado.set(true);
    try {
      await q(supabase.from('whatsapp_vinculos').delete().eq('user_id', this.auth.uid()!));
      this.tel.set(null);
      this.toast.ok('WhatsApp desconectado');
    } catch (e) {
      this.toast.erro(e);
    } finally {
      this.ocupado.set(false);
    }
  }
}
