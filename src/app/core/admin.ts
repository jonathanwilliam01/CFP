import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';
import { AdminErros, AdminLog, AdminMetricas, AdminUsuario, Comunicado, ComunicadoTag } from './models';
import { q, supabase } from './supabase';

async function ehAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}

@Injectable({ providedIn: 'root' })
export class Admin {
  private auth = inject(Auth);
  readonly eAdmin = signal<boolean | null>(null);

  constructor() {
    effect(() => {
      const id = this.auth.uid();
      untracked(async () => {
        this.eAdmin.set(id ? null : false);
        if (!id) return;
        const r = await ehAdmin().catch(() => false);
        if (this.auth.uid() === id) this.eAdmin.set(r);
      });
    });
  }

  async usuarios() {
    return (await q<AdminUsuario[]>(supabase.rpc('admin_usuarios'))) ?? [];
  }

  metricas(dias: number) {
    return q<AdminMetricas>(supabase.rpc('admin_metricas', { p_dias: dias }));
  }

  erros(dias: number) {
    return q<AdminErros>(supabase.rpc('admin_erros', { p_dias: dias }));
  }

  async log(acao?: string) {
    return (await q<AdminLog[]>(supabase.rpc('admin_log_lista', { p_acao: acao ?? null }))) ?? [];
  }

  async agir(acao: 'suspender' | 'reativar' | 'excluir', userId: string, motivo?: string) {
    const { error } = await supabase.functions.invoke('admin', { body: { acao, user_id: userId, motivo } });
    if (!error) return;
    let msg = error.message;
    try {
      msg = (await (error as { context: Response }).context.json()).erro || msg;
    } catch {
      /* sem corpo */
    }
    throw new Error(msg);
  }

  async redefinirSenha(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    if (error) throw new Error(error.message);
    await q(supabase.rpc('admin_registrar', { p_acao: 'senha', p_alvo: email }));
  }

  async salvarFuncao(chave: string, ativa: boolean, mensagem: string | null) {
    await q(
      supabase.from('funcoes_status').upsert({ chave, ativa, mensagem, desde: new Date().toISOString(), por: this.auth.user()!.id }),
    );
  }

  async comunicados() {
    return (await q<Comunicado[]>(supabase.rpc('admin_comunicados'))) ?? [];
  }

  salvarComunicado(c: Partial<Comunicado>) {
    const { lidos, total_usuarios, ...linha } = c;
    return q<Comunicado>(supabase.from('comunicados').upsert(linha).select().single());
  }

  async excluirComunicado(id: string) {
    await q(supabase.from('comunicados').delete().eq('id', id));
  }

  async tags() {
    return (await q<ComunicadoTag[]>(supabase.from('comunicado_tags').select('*').order('nome'))) ?? [];
  }

  async salvarTag(t: Partial<ComunicadoTag>) {
    await q(supabase.from('comunicado_tags').upsert(t));
  }
}

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.aguardar();
  return auth.user() && (await ehAdmin().catch(() => false)) ? true : router.parseUrl('/');
};
