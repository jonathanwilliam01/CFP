import { Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { q, supabase } from './supabase';

/** Web Push pela Edge Function push: chat e contas vencendo mesmo com o app fechado */
@Injectable({ providedIn: 'root' })
export class Push {
  private sw = inject(SwPush);
  /** service worker ativo (só no build de produção) e chave VAPID configurada */
  readonly disponivel = this.sw.isEnabled && !!environment.vapidPublicKey;
  readonly ativo = signal(false);

  constructor() {
    if (this.sw.isEnabled) this.sw.subscription.subscribe((s) => this.ativo.set(!!s));
  }

  async ativar() {
    const s = await this.sw.requestSubscription({ serverPublicKey: environment.vapidPublicKey });
    const { keys } = s.toJSON();
    await q(supabase.from('push_inscricoes').upsert({ endpoint: s.endpoint, p256dh: keys!['p256dh'], auth: keys!['auth'] }));
  }

  async desativar() {
    if (!this.sw.isEnabled) return;
    const s = await firstValueFrom(this.sw.subscription);
    if (!s) return;
    await q(supabase.from('push_inscricoes').delete().eq('endpoint', s.endpoint));
    await this.sw.unsubscribe();
  }
}
