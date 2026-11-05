import MARCAS from './marcas-banco.json';
import { supabase } from './supabase';

export interface MigracaoFaltando { migracao: string; itens: string[] }

export function mapearFaltando(marcas: Record<string, string[]>, falta: Set<string>): MigracaoFaltando[] {
  return Object.keys(marcas)
    .map((migracao) => ({ migracao, itens: marcas[migracao].filter((i) => falta.has(i)) }))
    .filter((m) => m.itens.length);
}

export async function migracoesFaltando(): Promise<MigracaoFaltando[]> {
  const marcas = MARCAS as Record<string, string[]>;
  const { data, error } = await supabase.rpc('colunas_faltando', { p_itens: Object.values(marcas).flat() });
  if (error) throw new Error(error.message);
  return mapearFaltando(marcas, new Set((data as string[] | null) ?? []));
}
