import { expect, test } from './apoio';

test('painel admin', async ({ page, erros }) => {
  await page.goto('/admin');
  if (process.env['CFP_ADMIN'] === '1') {
    await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(erros).toEqual([]);
  } else {
    await expect(page).toHaveURL(/\/$/);
  }
});
