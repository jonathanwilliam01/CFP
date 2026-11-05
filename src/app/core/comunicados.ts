import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Auth } from './auth';
import { Comunicado, ComunicadoTag } from './models';
import { q, supabase } from './supabase';

export function statusComunicado(c: Comunicado, agora: Date): 'rascunho' | 'agendado' | 'no_ar' | 'expirado' {
  if (!c.publicado) return 'rascunho';
  const t = agora.getTime();
  if (new Date(c.inicio).getTime() > t) return 'agendado';
  return new Date(c.fim).getTime() > t ? 'no_ar' : 'expirado';
}

export function noAr(l: Comunicado[], agora: Date): Comunicado[] {
  return l.filter((c) => statusComunicado(c, agora) === 'no_ar').sort((a, b) => b.inicio.localeCompare(a.inicio));
}

@Injectable({ providedIn: 'root' })
export class Comunicados {
  private auth = inject(Auth);
  private todos = signal<Comunicado[]>([]);
  private tags = signal<ComunicadoTag[]>([]);
  private lidos = signal<Set<string>>(new Set());
  private agora = signal(new Date());
  private canal: RealtimeChannel | null = null;
  private uid: string | null | undefined;

  readonly lista = computed(() => {
    const t = new Map(this.tags().map((x) => [x.id, x]));
    return noAr(this.todos(), this.agora()).map((c) => ({ ...c, tag: (c.tag_id && t.get(c.tag_id)) || null }));
  });
  readonly naoLidos = computed(() => this.lista().filter((c) => !this.lidos().has(c.id)));
  readonly destaque = computed<Comunicado | null>(() => this.naoLidos().find((c) => c.destaque) ?? null);

  constructor() {
    let ticks = 0;
    setInterval(() => {
      this.agora.set(new Date());
      if (++ticks % 15 === 0) this.recarregar();
    }, 60_000);
    document.addEventListener('visibilitychange', () => !document.hidden && this.recarregar());
    effect(() => {
      const id = this.auth.uid();
      untracked(() => this.assinar(id));
    });
  }

  async marcarLidos(ids: string[]) {
    if (!ids.length) return;
    this.lidos.update((s) => new Set([...s, ...ids]));
    try {
      await q(supabase.from('comunicado_leituras').upsert(ids.map((comunicado_id) => ({ comunicado_id })), { onConflict: 'comunicado_id,user_id', ignoreDuplicates: true }));
    } catch {
      /* mantém lido local; volta a sincronizar na próxima carga */
    }
  }

  private recarregar() {
    if (this.uid) this.carregar(this.uid);
  }

  private assinar(id: string | null) {
    if (id === this.uid) return;
    this.uid = id;
    if (this.canal) supabase.removeChannel(this.canal);
    this.canal = null;
    this.todos.set([]);
    this.lidos.set(new Set());
    if (!id) return;
    this.canal = supabase
      .channel('comunicados')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comunicados' }, () => this.carregar(id))
      .subscribe();
    this.carregar(id);
  }

  private async carregar(id: string) {
    try {
      const [c, t, l] = await Promise.all([
        q<Comunicado[]>(supabase.from('comunicados').select('*')),
        q<ComunicadoTag[]>(supabase.from('comunicado_tags').select('*')),
        q<{ comunicado_id: string }[]>(supabase.from('comunicado_leituras').select('comunicado_id')),
      ]);
      if (this.uid !== id) return;
      this.todos.set(c ?? []);
      this.tags.set(t ?? []);
      this.lidos.set(new Set((l ?? []).map((x) => x.comunicado_id)));
    } catch {
      /* offline: mantém o que tem */
    }
  }
}
