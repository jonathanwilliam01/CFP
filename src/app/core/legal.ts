import { environment } from '../../environments/environment';

/** Mudou o texto dos Termos ou da Política: troque a data e todos aceitam de novo */
export const TERMOS_VERSAO = '2026-11-16';
export const CONTATO = 'jonathanwillianps01@gmail.com';
export const PROVEDORES = ((environment as { oauth?: string[] }).oauth ?? []) as ('google' | 'apple')[];
