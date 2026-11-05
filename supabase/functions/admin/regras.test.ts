import { assertEquals } from 'jsr:@std/assert@1';
import { podeAgir } from './regras.ts';

Deno.test('recusa agir sobre a própria conta', () => {
  assertEquals(podeAgir('a', 'a', 'excluir'), 'Não é possível agir sobre a própria conta');
});

Deno.test('recusa ação desconhecida', () => {
  assertEquals(podeAgir('a', 'b', 'apagar'), 'Ação inválida');
});

Deno.test('permite ação válida em outra conta', () => {
  for (const a of ['suspender', 'reativar', 'excluir']) assertEquals(podeAgir('a', 'b', a), null);
});

Deno.test('recusa agir sobre outro admin', () => {
  for (const a of ['suspender', 'reativar', 'excluir']) assertEquals(podeAgir('a', 'b', a, true), 'Não é possível agir sobre outro admin');
});
