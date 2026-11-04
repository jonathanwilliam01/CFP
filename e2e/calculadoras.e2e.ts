import { abrir, expect, test } from './apoio';

test('13º em duas parcelas: 1ª é metade sem desconto', async ({ page }) => {
  await abrir(page, '/calculadoras');
  await page.locator('.escolha').click();
  await page.getByRole('button', { name: /13º salário/ }).click();
  await page.getByLabel('Salário bruto').fill('10.000,00');
  await expect(page.locator('.veredito').first()).toContainText('1ª parcela R$ 5.000,00');
  await page.getByRole('button', { name: 'Parcela única' }).click();
  await expect(page.locator('.veredito').first()).toContainText('Parcela única');
});
