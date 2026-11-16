import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { TERMOS_VERSAO } from './legal';
import { Push } from './push';
import { conviteGuardado } from './convite';
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
  private router = inject(Router);
  readonly suspensa = signal(false);
  readonly session = signal<Session | null>(null);
  readonly pronto = signal(false);
  /** Entrou pelo link de redefinição de senha */
  readonly recuperando = signal(linkRecuperacao);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly uid = computed(() => this.user()?.id ?? null);
  readonly foto = computed(() => (this.user()?.user_metadata?.['foto'] as Foto | null) ?? null);
  readonly nome = computed(() => {
    const m = this.user()?.user_metadata ?? {};
    // Google/Apple mandam full_name/name
    return (m['nome'] as string) || (m['full_name'] as string) || (m['name'] as string) || this.user()?.email?.split('@')[0] || '';
  });
  /** aceitou a versão atual dos Termos e da Política de privacidade */
  readonly aceitouTermos = computed(() => this.user()?.user_metadata?.['termos'] === TERMOS_VERSAO);

  private iniciado = supabase.auth.getSession().then(({ data }) => {
    this.session.set(data.session);
    this.pronto.set(true);
  });

  constructor() {
    supabase.auth.onAuthStateChange((e, s) => {
      this.session.set(s);
      if (e === 'PASSWORD_RECOVERY') this.recuperando.set(true);
    });
    effect(() => {
      const id = this.uid();
      untracked(() => this.checarSuspensao(id));
    });
    // suspensão no meio da sessão: confere de novo ao voltar para o app
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      this.suspensao = null;
      this.checarSuspensao(this.uid());
    });
  }

  private suspensao: { id: string; p: Promise<boolean> } | null = null;

  /** Uma consulta por usuário; falha de rede conta como não suspenso */
  suspenso(): Promise<boolean> {
    const id = this.uid();
    if (!id) return Promise.resolve(false);
    if (this.suspensao?.id !== id) {
      const p = Promise.resolve(supabase.rpc('estou_suspenso'))
        .then(({ data }) => data === true)
        .catch(() => false);
      this.suspensao = { id, p };
    }
    return this.suspensao.p;
  }

  private async checarSuspensao(id: string | null) {
    if (!id) return this.suspensa.set(false);
    const sus = await this.suspenso();
    if (this.uid() !== id) return;
    this.suspensa.set(sus);
    if (sus) this.router.navigateByUrl('/suspensa');
  }

  aguardar() {
    return this.iniciado;
  }

  /** true = falta o código das 2 etapas */
  async entrar(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(traduz(error.message));
    return this.precisaCodigo();
  }

  /** Google ou Apple: sai do app e volta logado */
  async entrarCom(provedor: 'google' | 'apple') {
    const { error } = await supabase.auth.signInWithOAuth({ provider: provedor, options: { redirectTo: location.origin } });
    if (error) throw new Error(traduz(error.message));
  }

  /** Conta com 2 etapas e sessão ainda sem o código (lido do token, sem rede) */
  async precisaCodigo() {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
  }

  private async fatorTotp() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw new Error(error.message);
    return data.totp.find((f) => f.status === 'verified') ?? null;
  }

  /** 2 etapas ativas nesta conta */
  async tem2Etapas() {
    return !!(await this.fatorTotp());
  }

  async verificarCodigo(codigo: string) {
    const f = await this.fatorTotp();
    if (!f) throw new Error('Verificação em duas etapas não está ativa');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code: codigo.replace(/\D/g, '') });
    if (error) throw new Error(traduz(error.message));
  }

  /** Começa a ativação: devolve QR (SVG em data URL) e a chave para digitar no app autenticador */
  async iniciar2Etapas() {
    // ativação abandonada deixa fator não verificado com o mesmo nome
    const l = await supabase.auth.mfa.listFactors();
    for (const f of l.data?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'CFP', issuer: 'CFP' });
    if (error) throw new Error(traduz(error.message));
    return { id: data.id, qr: data.totp.qr_code, chave: data.totp.secret };
  }

  async confirmar2Etapas(id: string, codigo: string) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: codigo.replace(/\D/g, '') });
    if (error) throw new Error(traduz(error.message));
  }

  async desativar2Etapas() {
    const f = await this.fatorTotp();
    if (!f) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) throw new Error(traduz(error.message));
    await supabase.auth.refreshSession();
  }

  async aceitarTermos() {
    const { error } = await supabase.auth.updateUser({ data: { termos: TERMOS_VERSAO, termos_em: new Date().toISOString() } });
    if (error) throw new Error(error.message);
  }

  /** LGPD: apaga a conta (Edge Function conta) e sai do aparelho */
  async excluirConta() {
    const { data, error } = await supabase.functions.invoke('conta', { body: { acao: 'excluir' } });
    if (error) {
      const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
      throw new Error(corpo?.erro ?? error.message);
    }
    if (!data?.ok) throw new Error(data?.erro ?? 'Não foi possível excluir a conta');
    await this.push.desativar().catch(() => undefined);
    for (const k of Object.keys(localStorage)) if (k.startsWith('cfp.') && !/^cfp\.(tema|cor)$/.test(k)) localStorage.removeItem(k);
    await supabase.auth.signOut({ scope: 'local' });
  }

  async cadastrar(nome: string, email: string, senha: string) {
    const { data, error } = await supabase.auth.signUp({ email, password: senha, options: { data: { nome, termos: TERMOS_VERSAO, termos_em: new Date().toISOString() } } });
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
    // dados da conta guardados no aparelho (preferências de tela ficam)
    for (const k of Object.keys(localStorage))
      if (/^cfp\.(nubank|carteira|salario|ganho|chat\.|reserva\.)/.test(k)) localStorage.removeItem(k);
    return supabase.auth.signOut();
  }
}

export function traduz(m: string) {
  if (/banned/i.test(m)) return 'Conta suspensa. Fale com o suporte.';
  if (/invalid login/i.test(m)) return 'E-mail ou senha incorretos';
  if (/already registered/i.test(m)) return 'E-mail já cadastrado';
  if (/email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar';
  if (/at least 6/i.test(m)) return 'A senha precisa ter ao menos 6 caracteres';
  if (/different from the old/i.test(m)) return 'A nova senha precisa ser diferente da atual';
  if (/invalid totp|invalid mfa|code.*(invalid|expired)/i.test(m)) return 'Código inválido ou vencido. Confira o app autenticador.';
  if (/provider is not enabled|unsupported provider/i.test(m)) return 'Esse login ainda não está disponível';
  return m;
}

// inject() só funciona antes do primeiro await
export const logadoGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.aguardar();
  // link de convite vai direto para criar a conta
  if (!auth.user()) return router.parseUrl(conviteGuardado() ? '/login' : '/apresentacao');
  return (await auth.precisaCodigo()) ? router.parseUrl('/verificar') : true;
};

/** Tela do código das 2 etapas: só com sessão que ainda precisa dele */
export const codigoGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.aguardar();
  if (!auth.user()) return router.parseUrl('/login');
  return (await auth.precisaCodigo()) ? true : router.parseUrl('/');
};

export const deslogadoGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.aguardar();
  if (!auth.user()) return true;
  return router.parseUrl((await auth.precisaCodigo()) ? '/verificar' : '/');
};

export const suspensaGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.aguardar();
  return (await auth.suspenso()) ? router.parseUrl('/suspensa') : true;
};
