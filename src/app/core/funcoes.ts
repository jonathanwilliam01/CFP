import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { CanActivateChildFn, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { Admin } from './admin';
import { Auth } from './auth';
import { FuncaoStatus } from './models';
import { q, supabase } from './supabase';

export interface Funcao { chave: string; nome: string; rotas: string[] }

const f = (chave: string, nome: string): Funcao => ({ chave, nome, rotas: ['/' + chave] });

export const FUNCOES: Funcao[] = [
  f('importar', 'Importação'),
  f('chat', 'Chat'),
  f('cofrinhos', 'Cofrinhos'),
  f('viagens', 'Viagens'),
  f('desejos', 'Lista de desejos'),
  f('planejamento', 'Planejamento'),
  f('relatorios', 'Relatórios'),
  f('resumo', 'Resumo mensal'),
  f('retrospectiva', 'Retrospectiva'),
  f('imposto', 'Imposto de Renda'),
  f('calculadoras', 'Calculadoras'),
  f('inflacao', 'Inflação'),
  f('desafios', 'Desafios'),
  f('registros', 'Registros'),
  f('receber', 'A receber'),
  f('dividas', 'Dívidas'),
  f('orcamentos', 'Orçamentos'),
  f('saldos', 'Saldos e patrimônio'),
  f('parcelamentos', 'Parcelamentos'),
  f('beneficios', 'Benefícios'),
  f('calendario', 'Calendário'),
  f('fechamento', 'Fechamento'),
  f('assinaturas', 'Assinaturas'),
];

export function funcaoDaRota(url: string): Funcao | null {
  const p = url.split(/[?#]/)[0];
  return FUNCOES.find((x) => x.rotas.some((r) => p === r || p.startsWith(r + '/'))) ?? null;
}

export function bloqueio(url: string, status: Record<string, FuncaoStatus>, admin: boolean): FuncaoStatus | null {
  if (admin) return null;
  const s = status[funcaoDaRota(url)?.chave ?? ''];
  return s && !s.ativa ? s : null;
}

/** para onde a página de manutenção leva; null = ficar */
export function destinoManutencao(fn: Funcao | undefined, status: FuncaoStatus | undefined, eAdmin: boolean | null): string | null {
  if (!fn) return '/';
  if (status?.ativa !== false || eAdmin === true) return fn.rotas[0];
  return null;
}

@Injectable({ providedIn: 'root' })
export class Funcoes {
  private auth = inject(Auth);
  private admin = inject(Admin);
  private router = inject(Router);
  readonly status = signal<Record<string, FuncaoStatus>>({});
  private canal: RealtimeChannel | null = null;
  private uid: string | null | undefined;
  private carga: Promise<void> = Promise.resolve();

  constructor() {
    effect(() => {
      const id = this.auth.uid();
      untracked(() => this.assinar(id));
    });
    effect(() => {
      const st = this.status();
      const admin = this.admin.eAdmin() !== false;
      untracked(() => {
        const b = bloqueio(this.router.url, st, admin);
        if (b) this.router.navigate(['/manutencao', b.chave], { replaceUrl: true });
      });
    });
  }

  /** reflete já o que o admin salvou; o realtime só confirma */
  aplicar(s: FuncaoStatus) {
    this.status.update((r) => ({ ...r, [s.chave]: s }));
  }

  /** espera a primeira carga do usuário atual */
  async aguardar() {
    await this.auth.aguardar();
    this.assinar(this.auth.uid());
    await this.carga;
  }

  private assinar(id: string | null) {
    if (id === this.uid) return;
    this.uid = id;
    if (this.canal) supabase.removeChannel(this.canal);
    this.canal = null;
    this.status.set({});
    if (!id) {
      this.carga = Promise.resolve();
      return;
    }
    this.canal = supabase
      .channel('funcoes-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funcoes_status' }, (p) => {
        if (p.eventType === 'DELETE') {
          const { chave } = p.old as FuncaoStatus;
          this.status.update(({ [chave]: _, ...r }) => r);
        } else {
          const n = p.new as FuncaoStatus;
          this.status.update((r) => ({ ...r, [n.chave]: n }));
        }
      })
      .subscribe();
    this.carga = this.carregar(id);
  }

  private async carregar(id: string) {
    try {
      const l = (await q<FuncaoStatus[]>(supabase.from('funcoes_status').select('*'))) ?? [];
      if (this.uid !== id) return;
      // o realtime pode ter chegado antes da carga: ele vale mais
      this.status.update((r) => ({ ...Object.fromEntries(l.map((x) => [x.chave, x])), ...r }));
    } catch {
      /* offline: segue liberado */
    }
  }
}

export const funcaoGuard: CanActivateChildFn = async (_, state) => {
  const fs = inject(Funcoes);
  const admin = inject(Admin);
  const router = inject(Router);
  await fs.aguardar();
  const eAdmin = await firstValueFrom(toObservable(admin.eAdmin).pipe(filter((v) => v !== null)));
  const b = bloqueio(state.url, fs.status(), eAdmin);
  return b ? router.createUrlTree(['/manutencao', b.chave]) : true;
};
