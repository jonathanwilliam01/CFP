import { ErrorHandler, Injectable, effect, inject } from '@angular/core';
import { Auth } from './auth';
import { hoje } from './datas';
import { supabase } from './supabase';
import { VERSAO } from './versao';

export const aparelho = (ua: string, standalone: boolean) =>
  `${/Mobi|Android|iPhone|iPad/i.test(ua) ? 'celular' : 'desktop'} · ${standalone ? 'app' : 'navegador'}`;

export const deveRegistrar = (marca: string | null, uid: string, dia: string) =>
  marca !== `${uid}:${dia}`;

export function resumoErro(e: unknown) {
  const err = e as { message?: unknown; stack?: unknown } | null;
  const mensagem = typeof e === 'string' ? e : String(err?.message ?? e);
  const detalhe = typeof err?.stack === 'string' ? err.stack : '';
  return { mensagem: mensagem.slice(0, 500), detalhe: detalhe.slice(0, 2000) };
}

/** no máximo 10 erros por sessão, sem repetir a mesma mensagem; marca a mensagem quando aceita */
export function deveReportar(enviados: Set<string>, mensagem: string) {
  if (enviados.size >= 10 || enviados.has(mensagem)) return false;
  enviados.add(mensagem);
  return true;
}

const CHAVE = 'cfp.acesso';

@Injectable({ providedIn: 'root' })
export class Telemetria {
  constructor() {
    const uid = inject(Auth).uid;
    effect(() => {
      const id = uid();
      if (!id) return;
      try {
        const dia = hoje();
        if (!deveRegistrar(localStorage.getItem(CHAVE), id, dia)) return;
        localStorage.setItem(CHAVE, `${id}:${dia}`);
        const standalone = matchMedia('(display-mode: standalone)').matches;
        supabase
          .rpc('registrar_acesso', { p_versao: VERSAO, p_aparelho: aparelho(navigator.userAgent, standalone) })
          .then(undefined, () => {});
      } catch {
        // telemetria nunca atrapalha
      }
    });
  }
}

@Injectable()
export class ErroGlobal implements ErrorHandler {
  private enviando = false;
  private enviados = new Set<string>();

  handleError(e: unknown) {
    console.error(e);
    if (this.enviando) return;
    this.enviando = true;
    try {
      const { mensagem, detalhe } = resumoErro(e);
      if (!deveReportar(this.enviados, mensagem)) return;
      supabase
        .rpc('registrar_erro', {
          p_versao: VERSAO,
          p_rota: location.pathname,
          p_mensagem: mensagem,
          p_detalhe: detalhe,
          p_navegador: navigator.userAgent,
        })
        .then(undefined, () => {});
    } catch {
      // ignora erro do próprio envio
    } finally {
      this.enviando = false;
    }
  }
}
