import { q, supabase } from './supabase';

/** Tabelas da carteira, na ordem em que podem ser restauradas (quem é referenciado vem antes) */
const TABELAS = [
  'categorias', 'cartoes', 'beneficios', 'parcelamentos', 'recorrencias', 'gastos', 'entradas', 'pagamentos', 'cofrinhos', 'cofrinho_movs',
  'orcamentos', 'orcamento_valores', 'orcamento_fechados', 'planos', 'registros', 'registro_itens', 'acertos', 'receber', 'dividas', 'desafios',
  'contas_bancarias',
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
    const linhas = (b.tabelas[t] ?? []).map((l) => ({ ...l, carteira_id: carteiraId, ...(t === 'cartoes' ? { padrao: false } : {}) }));
    for (let i = 0; i < linhas.length; i += 500) await q(supabase.from(t).upsert(linhas.slice(i, i + 500), { onConflict: 'id' }));
  }
  const padrao = b.tabelas['cartoes']?.find((c) => c['padrao']);
  if (padrao) await q(supabase.rpc('definir_cartao_padrao', { p_cartao: padrao['id'] }));
}
