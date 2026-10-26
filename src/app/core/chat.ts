import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Toast } from '../shared/toast';
import { Auth } from './auth';
import { Mensagem } from './models';
import { Store } from './store';
import { q, supabase } from './supabase';

/** Chat da carteira em tempo real; avisa mensagens novas fora da tela do chat */
@Injectable({ providedIn: 'root' })
export class Chat {
  private s = inject(Store);
  private auth = inject(Auth);
  private toast = inject(Toast);

  readonly mensagens = signal<Mensagem[]>([]);
  /** tela do chat aberta */
  readonly aberto = signal(false);
  private lido = signal('');
  private canal: RealtimeChannel | null = null;

  readonly naoLidas = computed(() => {
    const eu = this.auth.user()?.id;
    return this.mensagens().filter((m) => m.user_id !== eu && m.criado_em > this.lido()).length;
  });

  constructor() {
    effect(() => {
      const id = this.auth.user() ? this.s.carteiraId() : null;
      untracked(() => this.assinar(id));
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.aberto()) this.marcarLidas();
    });
  }

  private async assinar(id: string | null) {
    if (this.canal) supabase.removeChannel(this.canal);
    this.canal = null;
    this.mensagens.set([]);
    if (!id) return;
    this.lido.set(localStorage.getItem(`cfp.chat.${id}`) ?? '');
    this.canal = supabase
      .channel(`chat-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `carteira_id=eq.${id}` }, (p) =>
        this.chegou(p.new as Mensagem),
      )
      .subscribe();
    const l = await q<Mensagem[]>(
      supabase.from('mensagens').select('id, user_id, texto, criado_em').eq('carteira_id', id).order('criado_em', { ascending: false }).limit(200),
    );
    if (id !== this.s.carteiraId()) return;
    // mantém o que chegou pelo realtime durante a carga
    this.mensagens.update((atual) => [...l.reverse(), ...atual.filter((m) => !l.some((x) => x.id === m.id))]);
  }

  async enviar(texto: string) {
    const m = await q<Mensagem>(
      supabase.from('mensagens').insert({ carteira_id: this.s.carteiraId(), texto }).select('id, user_id, texto, criado_em').single(),
    );
    this.chegou(m);
  }

  marcarLidas() {
    const ult = this.mensagens().at(-1)?.criado_em;
    const id = this.s.carteiraId();
    if (!ult || !id || ult <= this.lido()) return;
    this.lido.set(ult);
    localStorage.setItem(`cfp.chat.${id}`, ult);
  }

  private chegou(m: Mensagem) {
    if (this.mensagens().some((x) => x.id === m.id)) return;
    this.mensagens.update((l) => [...l, m]);
    if (m.user_id === this.auth.user()?.id) return;
    if (this.aberto() && !document.hidden) return this.marcarLidas();
    this.avisar(this.s.membroMap().get(m.user_id) ?? 'Chat', m.texto);
  }

  private async avisar(nome: string, texto: string) {
    if (!document.hidden) return this.toast.ok(`${nome}: ${texto.length > 60 ? texto.slice(0, 60) + '…' : texto}`);
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    // onActionClick: o service worker do Angular abre o chat ao tocar na notificação
    const op = { body: texto, icon: 'icons/icon-192x192.png', tag: `chat-${this.s.carteiraId()}`, data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: '/chat' } } } };
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(nome, op);
    else new Notification(nome, op);
  }
}
