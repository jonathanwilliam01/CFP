import { abrir, expect, semRolagemLateral, test } from './apoio';

const ROTAS = [
  '/', '/gastos', '/contas', '/entradas', '/receber', '/cartoes', '/saldos', '/beneficios', '/parcelamentos', '/assinaturas', '/dividas',
  '/cofrinhos', '/orcamentos', '/desafios', '/desejos', '/viagens', '/registros', '/planejamento', '/calculadoras', '/fechamento',
  '/relatorios', '/resumo', '/retrospectiva', '/inflacao', '/imposto', '/calendario', '/notificacoes', '/config', '/novidades', '/importar', '/chat',
];

for (const rota of ROTAS) {
  test(`abre ${rota} sem erro e sem rolar de lado`, async ({ page, erros }) => {
    await abrir(page, rota);
    if (rota !== '/') await expect(page.locator('main h1').first()).toBeVisible();
    await semRolagemLateral(page);
    expect(erros).toEqual([]);
  });
}
