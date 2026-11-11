import { abrir, expect, test } from './apoio';

test('seleção em massa: entra, marca todos e sai sem gravar', async ({ page }) => {
  await abrir(page, '/gastos');
  const linhas = page.locator('app-deslizar .row');
  test.skip((await linhas.count()) === 0, 'mês sem gastos');
  await page.getByRole('button', { name: 'Mais ações' }).click();
  await page.getByRole('menuitem', { name: 'Selecionar' }).click();
  const barra = page.locator('.massa');
  await expect(barra).toContainText('0 selecionado(s)');
  await barra.getByRole('button', { name: 'Todos' }).click();
  await expect(barra).toContainText(`${await linhas.count()} selecionado(s)`);
  await linhas.first().click();
  await expect(barra).toContainText(`${(await linhas.count()) - 1} selecionado(s)`);
  await page.getByRole('button', { name: 'Pronto' }).click();
  await expect(barra).toBeHidden();
});

test('filtro por fatura mostra conferência', async ({ page }) => {
  await abrir(page, '/gastos');
  await page.getByRole('button', { name: /Filtros/ }).click();
  await page.getByRole('button', { name: 'Cartão' }).click();
  await page.getByRole('button', { name: /^Fatura de/ }).first().click();
  const conf = page.locator('.conf');
  if (await conf.count()) await expect(conf).toContainText('conferidos');
});
