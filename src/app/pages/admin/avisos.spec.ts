import { describe, expect, it } from 'vitest';
import { avisoDaVersao } from './aviso-form';

describe('avisoDaVersao', () => {
  it('monta título, texto com 3 itens e link', () => {
    expect(avisoDaVersao({ versao: 'v1.26.11.9', data: '2026-11-05', itens: ['a', 'b', 'c', 'd'] })).toEqual({
      titulo: 'Chegou a v1.26.11.9',
      texto: 'a · b · c',
      link: '/novidades',
    });
  });
  it('corta em 280 caracteres', () => {
    const r = avisoDaVersao({ versao: 'v1', data: '', itens: ['x'.repeat(400)] });
    expect(r.texto).toHaveLength(280);
    expect(r.texto.endsWith('…')).toBe(true);
  });
});
