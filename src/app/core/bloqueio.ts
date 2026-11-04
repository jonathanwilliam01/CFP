import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Auth } from './auth';

/** Escolha do aparelho: hash do PIN, credencial da biometria (WebAuthn) e minutos fora do app até bloquear */
export interface ConfigBloqueio {
  salt: string;
  pin: string;
  cred: string | null;
  minutos: number;
}

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const aleatorio = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function hash(salt: string, pin: string) {
  return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)));
}

/**
 * Trava a tela ao abrir e ao voltar ao app. Só protege a tela neste aparelho: a sessão continua no navegador,
 * então a biometria não é conferida no servidor, basta o aparelho confirmar quem está usando.
 */
@Injectable({ providedIn: 'root' })
export class Bloqueio {
  private auth = inject(Auth);
  private uid = computed(() => this.auth.user()?.id ?? null);
  readonly cfg = signal<ConfigBloqueio | null>(null);
  readonly travado = signal(false);
  /** fora do app (ou janela sem foco): tela coberta para a prévia do seletor de apps não mostrar valores */
  readonly coberto = signal(false);
  /** conta as voltas ao app (visível de novo): pedir a biometria outra vez */
  readonly voltou = signal(0);
  constructor() {
    // ao abrir (ou recarregar puxando a tela, ou o celular reabrir o app que tinha fechado) só trava se passou do tempo
    effect(() => {
      const id = this.uid();
      untracked(() => {
        const c = id ? this.ler(id) : null;
        this.cfg.set(c);
        this.travado.set(!!c && this.passou(c, true));
      });
    });
    document.addEventListener('visibilitychange', () => {
      const c = this.cfg();
      if (!c) return;
      this.coberto.set(document.hidden);
      if (document.hidden) {
        this.marcarSaida();
        if (!c.minutos) this.travado.set(true);
      } else {
        if (this.passou(c)) this.travado.set(true);
        this.voltou.update((n) => n + 1);
      }
    });
    addEventListener('pagehide', () => this.cfg() && this.marcarSaida());
    // blur chega antes do print da prévia em alguns celulares
    addEventListener('blur', () => this.cfg() && this.coberto.set(true));
    addEventListener('focus', () => !document.hidden && this.coberto.set(false));
  }

  private chave = () => `cfp.bloqueio.${this.uid()}`;
  private chaveSaida = () => `cfp.bloqueio.saiu.${this.uid()}`;

  /** Hora em que saiu destravado (fica no aparelho para valer depois de recarregar); travado não guarda */
  private marcarSaida() {
    if (this.travado()) localStorage.removeItem(this.chaveSaida());
    else localStorage.setItem(this.chaveSaida(), String(Date.now()));
  }

  /** Fora do app por mais que o tempo escolhido; ao abrir, uns segundos de folga para recarregar a página */
  private passou(c: ConfigBloqueio, abrindo = false) {
    const saiu = Number(localStorage.getItem(this.chaveSaida()) ?? 0);
    const limite = Math.max(c.minutos * 60_000, abrindo ? 5_000 : 0);
    return !saiu || Date.now() - saiu >= limite;
  }

  private ler(id: string): ConfigBloqueio | null {
    try {
      return JSON.parse(localStorage.getItem(`cfp.bloqueio.${id}`) ?? 'null');
    } catch {
      return null;
    }
  }

  private gravar(c: ConfigBloqueio | null) {
    if (c) localStorage.setItem(this.chave(), JSON.stringify(c));
    else localStorage.removeItem(this.chave());
    this.cfg.set(c);
  }

  async bioDisponivel() {
    try {
      return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch {
      return false;
    }
  }

  async ativar(pin: string, bio: boolean, minutos: number) {
    const salt = b64(aleatorio(16));
    const cred = bio ? await this.registrar() : null;
    this.gravar({ salt, pin: await hash(salt, pin), cred, minutos });
    localStorage.setItem(this.chaveSaida(), String(Date.now()));
  }

  minutos(m: number) {
    const c = this.cfg();
    if (c) this.gravar({ ...c, minutos: m });
  }

  private destravar() {
    this.travado.set(false);
    localStorage.setItem(this.chaveSaida(), String(Date.now()));
  }

  desativar() {
    localStorage.removeItem(this.chaveSaida());
    this.gravar(null);
    this.travado.set(false);
  }

  async conferirPin(pin: string) {
    const c = this.cfg();
    const ok = !!c && (await hash(c.salt, pin)) === c.pin;
    if (ok) this.destravar();
    return ok;
  }

  /** Pede a digital/rosto do aparelho; cancelado devolve false */
  async biometria() {
    const c = this.cfg();
    if (!c?.cred) return false;
    try {
      await navigator.credentials.get({
        publicKey: { challenge: aleatorio(32), allowCredentials: [{ type: 'public-key', id: deB64(c.cred) }], userVerification: 'required', timeout: 60_000 },
      });
      this.destravar();
      return true;
    } catch {
      return false;
    }
  }

  private async registrar() {
    const u = this.auth.user()!;
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: aleatorio(32),
        rp: { name: 'CFP' },
        user: { id: new TextEncoder().encode(u.id), name: u.email ?? u.id, displayName: this.auth.nome() || 'CFP' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error('Biometria não registrada');
    return b64(cred.rawId);
  }
}
