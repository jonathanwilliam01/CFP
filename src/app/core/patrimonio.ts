import { Injectable, inject, signal } from '@angular/core';
import { addMeses, hoje, mesAtual } from './datas';
import { historicoReajustes } from './financas';
import { soma } from './formato';
import { FotoPatrimonio } from './models';
import { Store } from './store';
import { q, supabase } from './supabase';

export type Patrimonio = Omit<FotoPatrimonio, 'id'>;

export const liquido = (p: Patrimonio) => p.bancos + p.cofrinhos + p.receber - p.dividas - p.parcelas;

/** Patrimônio de hoje (bancos + cofrinhos + a receber − dívidas − parcelas futuras) e a foto de cada mês */
@Injectable({ providedIn: 'root' })
export class Patrimonios {
  private s = inject(Store);
  readonly fotos = signal<FotoPatrimonio[]>([]);

  async atual(): Promise<Patrimonio> {
    const s = this.s;
    const id = s.carteiraId()!;
    const cadeias = new Map(s.dividas().map((d) => [d.id, d.recorrencia_id ? historicoReajustes(s.recorrencias(), d.recorrencia_id).map((r) => r.id) : []]));
    const refs = [...cadeias.values()].flat();
    const [pagas, futuras] = await Promise.all([
      refs.length
        ? q<{ ref_id: string }[]>(supabase.from('pagamentos').select('ref_id').eq('tipo', 'recorrencia').in('ref_id', refs).not('pago_em', 'is', null))
        : Promise.resolve([]),
      q<{ valor: number }[]>(
        supabase.from('gastos').select('valor').eq('carteira_id', id).not('parcela', 'is', null)
          .or(`fatura_mes.gt.${mesAtual()},and(fatura_mes.is.null,data.gt.${hoje()})`),
      ),
    ]);
    const dividas = soma(s.dividas(), (d) => {
      const daConta = pagas.filter((p) => cadeias.get(d.id)!.includes(p.ref_id)).length;
      return Math.max(0, d.num_parcelas - Math.min(d.num_parcelas, d.pagas + daConta)) * d.valor_parcela;
    });
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return {
      mes: mesAtual(),
      bancos: r2(soma(s.contasBancarias().filter((c) => c.ativo), (c) => c.saldo)),
      cofrinhos: r2(soma([...s.guardadoPorCofrinho().values()], (v) => v)),
      receber: r2(soma(s.receber().filter((r) => !r.recebido_em), (r) => r.valor)),
      dividas: r2(dividas),
      parcelas: r2(soma(futuras, (g) => g.valor)),
    };
  }

  /** Grava (ou atualiza) a foto do mês atual; sem a migration 035 não faz nada */
  async fotografar(p?: Patrimonio) {
    try {
      const v = p ?? (await this.atual());
      await q(supabase.from('patrimonio').upsert({ ...v, carteira_id: this.s.carteiraId(), atualizado_em: new Date().toISOString() }, { onConflict: 'carteira_id,mes' }));
    } catch {
      // tabela ausente ou sem rede: tenta de novo na próxima vez
    }
  }

  async carregar(meses = 24) {
    try {
      this.fotos.set(
        await q<FotoPatrimonio[]>(supabase.from('patrimonio').select('*').eq('carteira_id', this.s.carteiraId()!).gte('mes', addMeses(mesAtual(), -meses + 1)).order('mes')),
      );
    } catch {
      this.fotos.set([]);
    }
  }

  /** Uma vez por dia ao abrir o app */
  async diaria() {
    const k = `cfp.patrimonio.${this.s.carteiraId()}`;
    if (localStorage.getItem(k) === hoje()) return;
    if (!this.s.contasBancarias().length && !this.s.cofrinhos().length) return;
    await this.fotografar();
    localStorage.setItem(k, hoje());
  }
}
