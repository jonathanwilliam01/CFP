import { q, supabase } from './supabase';

/** Tabelas da carteira, na ordem em que podem ser restauradas (quem é referenciado vem antes) */
const TABELAS = [
  'categorias', 'cartoes', 'beneficios', 'parcelamentos', 'recorrencias', 'cofrinhos', 'contas_bancarias', 'gastos', 'entradas', 'pagamentos', 'cofrinho_movs',
  'orcamentos', 'orcamento_valores', 'orcamento_fechados', 'planos', 'registros', 'registro_itens', 'acertos', 'receber', 'dividas', 'desafios',
  'metas', 'transferencias',
];
const PAGINA = 1000;

export interface Backup {
  app: 'cfp';
  versao: 1;
  carteira: string;
  exportado_em: string;
  tabelas: Record<string, Record<string, unknown>[]>;
}

/** Tudo da carteira em JSON; tabela que ainda não existe no banco (migration pendente) fica de fora */
export async function exportar(carteiraId: string, nome: string): Promise<Backup> {
  const tabelas: Backup['tabelas'] = {};
  for (const t of TABELAS) {
    const linhas: Record<string, unknown>[] = [];
    try {
      for (let de = 0; ; de += PAGINA) {
        const l = await q<Record<string, unknown>[]>(supabase.from(t).select('*').eq('carteira_id', carteiraId).order('id').range(de, de + PAGINA - 1));
        linhas.push(...l);
        if (l.length < PAGINA) break;
      }
    } catch {
      continue;
    }
    tabelas[t] = linhas;
  }
  return { app: 'cfp', versao: 1, carteira: nome, exportado_em: new Date().toISOString(), tabelas };
}

export function lerBackup(texto: string): Backup {
  const b = JSON.parse(texto) as Backup;
  if (b?.app !== 'cfp' || !b.tabelas) throw new Error('Arquivo não é um backup do CFP');
  return b;
}

export const totalLinhas = (b: Backup) => Object.values(b.tabelas).reduce((a, l) => a + l.length, 0);

/** Grava na carteira atual: mesmo id é substituído, nada é apagado */
export async function restaurar(b: Backup, carteiraId: string) {
  for (const t of TABELAS) {
    // cartão padrão só pela RPC: o índice único não deixa dois padrões nem por um instante
    // retirada ligada a gasto o trigger recria ao gravar o gasto
    const linhas = (b.tabelas[t] ?? []).filter((l) => !(t === 'cofrinho_movs' && l['gasto_id'])).map((l) => ({ ...l, carteira_id: carteiraId, ...(t === 'cartoes' ? { padrao: false } : {}) }));
    // transferência já gravada fica (não se edita); nova mexe no saldo, que é regravado no fim
    const op = { onConflict: 'id', ...(t === 'transferencias' ? { ignoreDuplicates: true } : {}) };
    for (let i = 0; i < linhas.length; i += 500) await q(supabase.from(t).upsert(linhas.slice(i, i + 500), op));
  }
  // transferências e depósitos com conta mexem no saldo pelos triggers: volta ao saldo do backup
  const contas = (b.tabelas['contas_bancarias'] ?? []).map((l) => ({ ...l, carteira_id: carteiraId }));
  if (contas.length) await q(supabase.from('contas_bancarias').upsert(contas, { onConflict: 'id' }));
  const padrao = b.tabelas['cartoes']?.find((c) => c['padrao']);
  if (padrao) await q(supabase.rpc('definir_cartao_padrao', { p_cartao: padrao['id'] }));
}
