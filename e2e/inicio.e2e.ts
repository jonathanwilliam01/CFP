import { abrir, expect, test } from './apoio';

test('saldo do mês e recebimentos com dia/mês', async ({ page }) => {
  await abrir(page, '/');
  await expect(page.locator('.saldo strong')).toContainText('R$');
  const rec = page.locator('[bloco="recebimento"] .rec .l b');
  if (await rec.count()) await expect(rec.first()).toHaveText(/^\d{2}\/\d{2}$/);
  // alternar o compacto grava na conta: só confere que o botão existe
  await expect(page.getByRole('button', { name: /Só o resumo|Mostrar todos/ })).toBeVisible();
});

test('Contas: Por recebimento com dia/mês', async ({ page }) => {
  await abrir(page, '/contas');
  const rec = page.locator('.rec .l');
  if (await rec.count()) await expect(rec.first()).toHaveText(/^\d{2}\/\d{2} · /);
});
