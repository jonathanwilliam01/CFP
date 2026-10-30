import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Toast } from '../shared/toast';
import { Auth } from './auth';
import { Store } from './store';
import { q, supabase } from './supabase';

type Dados = Record<string, unknown>;

/** Lançamento novo; o id vem do aparelho para o reenvio não duplicar */
export type ItemFila =
  | { tipo: 'inserir'; tabela: 'gastos' | 'entradas'; dados: Dados }
  | { tipo: 'parcelamento'; params: Dados }
  | { tipo: 'fixa'; dados: Dados; pago: { mes: string; valor: number; pago_em: string } | null };

/** user_id: só quem lançou envia (outro login no aparelho não manda os lançamentos dele) */
type Guardado = ItemFila & { carteira_id: string; user_id?: string };

const CHAVE = 'cfp.fila';

/** Falha de rede (sem internet), não erro do banco */
export const semRede = (e: unknown) =>
  !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(e instanceof Error ? e.message : String(e));

/** Lançamentos feitos sem internet: ficam no aparelho e são enviados quando a conexão volta */
@Injectable({ providedIn: 'root' })
export class Fila {
  private s = inject(Store);
  private auth = inject(Auth);
  private toast = inject(Toast);

  readonly itens = signal<Guardado[]>(this.ler());
  private enviando = false;

  constructor() {
    addEventListener('online', () => this.enviar());
    effect(() => {
      if (this.auth.user()) untracked(() => this.enviar());
    });
  }

  private ler(): Guardado[] {
    try {
      return JSON.parse(localStorage.getItem(CHAVE) ?? '[]');
    } catch {
      return [];
    }
  }

  private gravar(l: Guardado[]) {
    this.itens.set(l);
    localStorage.setItem(CHAVE, JSON.stringify(l));
  }

  guardar(item: ItemFila) {
    this.gravar([...this.itens(), { ...item, carteira_id: this.s.carteiraId()!, user_id: this.auth.user()?.id }]);
  }

  /** Envia já (com internet) e atualiza a tela */
  async executar(item: ItemFila, carteira = this.s.carteiraId()!) {
    if (item.tipo === 'inserir') await this.inserir(item.tabela, { ...item.dados, carteira_id: carteira });
    else if (item.tipo === 'parcelamento') await q(supabase.rpc('criar_parcelamento', { ...item.params, p_carteira: carteira }));
    else {
      await this.inserir('recorrencias', { ...item.dados, carteira_id: carteira });
      if (item.pago)
        await q(supabase.from('pagamentos').upsert(
          { ...item.pago, carteira_id: carteira, tipo: 'recorrencia', ref_id: item.dados['id'] },
          { onConflict: 'tipo,ref_id,mes' },
        ));
    }
    if (carteira !== this.s.carteiraId()) return;
    if (item.tipo === 'fixa') await this.s.recarregar('recorrencias');
    await this.s.carregarMes();
  }

  // reenvio de algo que já tinha chegado ao banco: chave repetida conta como enviado
  private async inserir(tabela: string, dados: Dados) {
    const { error } = await supabase.from(tabela).insert(dados);
    if (error && error.code !== '23505') throw new Error(error.message);
  }

  async enviar() {
    const eu = this.auth.user()?.id;
    const meu = (i: Guardado) => !!eu && (!i.user_id || i.user_id === eu);
    if (this.enviando || !this.itens().some(meu) || !navigator.onLine) return;
    this.enviando = true;
    let n = 0;
    try {
      let item: Guardado | undefined;
      while ((item = this.itens().find(meu))) {
        try {
          await this.executar(item, item.carteira_id);
          n++;
        } catch (e) {
          if (semRede(e)) break;
          this.toast.erro(`Lançamento guardado não enviado: ${e instanceof Error ? e.message : e}`);
        }
        this.gravar(this.itens().filter((i) => i !== item));
      }
    } finally {
      this.enviando = false;
    }
    if (n) this.toast.ok(n === 1 ? 'Lançamento guardado enviado' : `${n} lançamentos guardados enviados`);
  }
}
