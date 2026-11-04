import { expect, test as setup } from '@playwright/test';

setup('entrar', async ({ page }) => {
  const email = process.env.CFP_EMAIL;
  const senha = process.env.CFP_SENHA;
  setup.skip(!email || !senha, 'Defina CFP_EMAIL e CFP_SENHA');
  await page.goto('/login');
  await page.fill('input[name=email]', email!);
  await page.fill('input[name=senha]', senha!);
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  await expect(page.locator('app-shell')).toBeVisible();
  await page.context().storageState({ path: 'e2e/.auth/estado.json' });
});
