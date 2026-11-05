import { describe, expect, it } from 'vitest';
import { noAr, statusComunicado } from './comunicados';
import { Comunicado } from './models';

const agora = new Date('2026-12-25T12:00:00-03:00');
const c = (o: Partial<Comunicado>): Comunicado => ({
  id: 'x', titulo: 't', texto: '', tag_id: null, inicio: '2026-12-24T00:00:00-03:00', fim: '2026-12-26T00:00:00-03:00', link: null, push: false,
  destaque: false, publicado: true, push_enviado_em: null, criado_em: '2026-12-01T00:00:00-03:00', ...o,
});

describe('comunicados', () => {
  const rascunho = c({ id: 'a', publicado: false });
  const agendado = c({ id: 'b', inicio: '2026-12-26T00:00:00-03:00', fim: '2026-12-30T00:00:00-03:00' });
  const noAr1 = c({ id: 'c' });
  const expirado = c({ id: 'd', fim: '2026-12-25T11:59:00-03:00' });

  it('status', () => {
    expect(statusComunicado(rascunho, agora)).toBe('rascunho');
    expect(statusComunicado(agendado, agora)).toBe('agendado');
    expect(statusComunicado(noAr1, agora)).toBe('no_ar');
    expect(statusComunicado(expirado, agora)).toBe('expirado');
  });
  it('noAr filtra e ordena por inicio desc', () => {
    const novo = c({ id: 'e', inicio: '2026-12-25T00:00:00-03:00' });
    expect(noAr([rascunho, agendado, noAr1, expirado], agora).map((x) => x.id)).toEqual(['c']);
    expect(noAr([noAr1, novo], agora).map((x) => x.id)).toEqual(['e', 'c']);
  });
  it('expira com o tempo', () => {
    expect(noAr([noAr1], new Date('2026-12-26T00:00:01-03:00'))).toEqual([]);
  });
});
