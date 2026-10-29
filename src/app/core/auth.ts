import { Injectable, computed, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { Push } from './push';
import { linkRecuperacao, q, supabase } from './supabase';

/** Foto de perfil: imagem original + enquadramento (zoom e deslocamento em % do círculo) */
export interface Foto {
  url: string;
  zoom: number;
  x: number;
  y: number;
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private push = inject(Push);
  readonly session = signal<Session | null>(null);
  readonly pronto = signal(false);
  /** Entrou pelo link de redefinição de senha */
  readonly recuperando = signal(linkRecuperacao);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly foto = computed(() => (this.user()?.user_metadata?.['foto'] as Foto | null) ?? null);
  readonly nome = computed(() => (this.user()?.user_metadata?.['nome'] as string) || this.user()?.email?.split('@')[0] || '');

  private iniciado = supabase.auth.getSession().then(({ data }) => {
    this.session.set(data.session);
    this.pronto.set(true);
  });

  constructor() {
    supabase.auth.onAuthStateChange((e, s) => {
      this.session.set(s);
      if (e === 'PASSWORD_RECOVERY') this.recuperando.set(true);
    });
  }

  aguardar() {
    return this.iniciado;
  }

  async entrar(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(traduz(error.message));
  }

  async cadastrar(nome: string, email: string, senha: string) {
    const { data, error } = await supabase.auth.signUp({ email, password: senha, options: { data: { nome } } });
    if (error) throw new Error(traduz(error.message));
    return !!data.session;
  }

  async recuperar(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    if (error) throw new Error(traduz(error.message));
  }

  async trocarSenha(senha: string) {
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) throw new Error(traduz(error.message));
    this.recuperando.set(false);
  }

  /** Envia nova imagem (se houver) e grava o enquadramento */
  async salvarFoto(imagem: Blob | null, ajuste: Omit<Foto, 'url'>) {
    let url = this.foto()?.url;
    if (imagem) {
      const caminho = `${this.user()!.id}/foto.jpg`;
      await q(supabase.storage.from('avatares').upload(caminho, imagem, { upsert: true, contentType: 'image/jpeg' }));
      url = `${supabase.storage.from('avatares').getPublicUrl(caminho).data.publicUrl}?v=${Date.now()}`;
    }
    if (!url) return;
    const { error } = await supabase.auth.updateUser({ data: { foto: { url, ...ajuste } } });
    if (error) throw new Error(error.message);
  }

  async removerFoto() {
    await q(supabase.storage.from('avatares').remove([`${this.user()!.id}/foto.jpg`]));
    const { error } = await supabase.auth.updateUser({ data: { foto: null } });
    if (error) throw new Error(error.message);
  }

  async sair() {
    // tira o push deste aparelho enquanto ainda tem sessão; sem esperar o service worker para sempre
    await Promise.race([this.push.desativar().catch(() => undefined), new Promise((ok) => setTimeout(ok, 3000))]);
    return supabase.auth.signOut();
  }
}

function traduz(m: string) {
  if (/invalid login/i.test(m)) return 'E-mail ou senha incorretos';
  if (/already registered/i.test(m)) return 'E-mail já cadastrado';
  if (/email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar';
  if (/at least 6/i.test(m)) return 'A senha precisa ter ao menos 6 caracteres';
  if (/different from the old/i.test(m)) return 'A nova senha precisa ser diferente da atual';
  return m;
}

// inject() só funciona antes do primeiro await
export const logadoGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.aguardar();
  return auth.user() ? true : router.parseUrl('/apresentacao');
};

export const deslogadoGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.aguardar();
  return auth.user() ? router.parseUrl('/') : true;
};
