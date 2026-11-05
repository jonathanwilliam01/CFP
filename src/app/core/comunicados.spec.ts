import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Auth } from './auth';
import { supabase } from './supabase';
import { Comunicados, itensPopover, noAr, statusComunicado } from './comunicados';
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

describe('Comunicados.marcarLidos', () => {
  it('falha no upsert não devolve o id a naoLidos', async () => {
    vi.spyOn(supabase, 'from').mockReturnValue({ upsert: () => Promise.reject(new Error('offline')) } as never);
    TestBed.configureTestingModule({ providers: [{ provide: Auth, useValue: { uid: signal(null) } }] });
    const s = TestBed.inject(Comunicados);
    (s as unknown as { todos: WritableSignal<Comunicado[]> }).todos.set([c({ id: 'z', inicio: new Date(Date.now() - 1000).toISOString(), fim: new Date(Date.now() + 1e6).toISOString() })]);
    expect(s.naoLidos().length).toBe(1);
    await s.marcarLidos(['z']);
    expect(s.naoLidos().length).toBe(0);
  });
});

describe('itensPopover', () => {
  it('mostra os vivos até o máximo e marca os novos da abertura', () => {
    const l = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    const r = itensPopover(l, new Set(['a', 'd']), 3);
    expect(r.map((x) => [x.id, x.novo])).toEqual([['a', true], ['b', false], ['c', false]]);
  });
});
