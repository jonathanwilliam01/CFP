import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Auth } from './auth';
import { supabase } from './supabase';

/**
 * Chaves do localStorage que seguem o usuário em todo aparelho (usuario_prefs.telas, migration 049).
 * Ficam só no aparelho: tema, cor, olho, menu recolhido, carteira, bloqueio, fila, chat, notificações do dia e caches.
 * Menu e Início já vão em user_metadata (Menus, Painel).
 */
const SINCRONIZA =
  /^cfp\.(revisados\.|lidas$|dispensados$|sugestoes$|fechamento|gastos\.|contas\.|desejos\.|calendario\.|relatorios\.|cartoes\.|saldos\.|cofrinho\.|entradas\.|inicio\.analises$|plan\.|config\.|recebimento$|lancar$|saldo$|calc$|horas\.semana$|ganho$|salario$|passos\.|tour$|tx\.|reserva\.|cdi$|pctcdi$|pctlci$|poupanca$)/;
/** Auth.sair apaga do aparelho; no banco continuam */
const SO_APARELHO_AO_APAGAR = /^cfp\.(salario|ganho|reserva\.)/;

let ouvir: ((k: string, v: string | null) => void) | undefined;

// atribuir localStorage.setItem grava um item chamado "setItem": o gancho vai no protótipo
function instalar() {
  const p = Storage.prototype;
  const set = p.setItem;
  const rem = p.removeItem;
  p.setItem = function (this: Storage, k: string, v: string) {
    set.call(this, k, v);
    if (this === localStorage) ouvir?.(k, String(v));
  };
  p.removeItem = function (this: Storage, k: string) {
    rem.call(this, k);
    if (this === localStorage) ouvir?.(k, null);
  };
}

/** Espelha as preferências de tela no banco, por usuário */
@Injectable({ providedIn: 'root' })
export class Preferencias {
  private auth = inject(Auth);
  private uid: string | null = null;
  private dados: Record<string, string> = {};
  private timer?: ReturnType<typeof setTimeout>;
  private aplicando = false;
  private buscado = 0;
  /** sobe quando chegaram valores do banco: serviços que leram o aparelho na abertura releem */
  readonly versao = signal(0);

  constructor() {
    if (!ouvir) instalar();
    ouvir = (k, v) => this.mudou(k, v);
    effect(() => {
      const id = this.auth.user()?.id ?? null;
      untracked(() => this.entrar(id));
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.enviar();
      else if (!this.timer && Date.now() - this.buscado > 60_000) this.baixar();
    });
  }

  private entrar(id: string | null) {
    if (id === this.uid) return;
    this.enviar();
    this.uid = id;
    this.dados = {};
    if (id) this.baixar();
  }

  /** Banco vale sobre o aparelho; o que só existe no aparelho sobe (primeiro uso) */
  private async baixar() {
    const id = this.uid;
    if (!id) return;
    this.buscado = Date.now();
    const { data, error } = await supabase.from('usuario_prefs').select('telas').maybeSingle();
    // sem a migration 049: segue só no aparelho
    if (error || id !== this.uid) return;
    const remoto: Record<string, string> = Object.fromEntries(
      Object.entries((data?.telas ?? {}) as Record<string, unknown>).filter(([k, v]) => SINCRONIZA.test(k) && typeof v === 'string'),
    ) as Record<string, string>;
    let mudou = false;
    this.aplicando = true;
    try {
      for (const [k, v] of Object.entries(remoto)) {
        if (localStorage.getItem(k) === v) continue;
        localStorage.setItem(k, v);
        mudou = true;
      }
    } finally {
      this.aplicando = false;
    }
    const locais = Object.keys(localStorage).filter((k) => SINCRONIZA.test(k) && !(k in remoto));
    this.dados = { ...remoto, ...Object.fromEntries(locais.map((k) => [k, localStorage.getItem(k)!])) };
    if (locais.length) this.agendar();
    if (mudou) this.versao.update((n) => n + 1);
  }

  private mudou(k: string, v: string | null) {
    if (this.aplicando || !this.uid || !SINCRONIZA.test(k)) return;
    if (v === null) {
      if (SO_APARELHO_AO_APAGAR.test(k)) return;
      delete this.dados[k];
    } else if (this.dados[k] === v) return;
    else this.dados[k] = v;
    this.agendar();
  }

  private agendar() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.enviar(), 2000);
  }

  private enviar() {
    if (!this.timer || !this.uid) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    supabase.from('usuario_prefs').upsert({ user_id: this.uid, telas: this.dados }).then(
      () => undefined,
      () => undefined,
    );
  }
}
