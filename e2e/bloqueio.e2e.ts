import { abrir, expect, test, usuario } from './apoio';

// O bloqueio fica só no aparelho (localStorage): o teste liga e desliga no próprio navegador
test('recarregar respeita o tempo do bloqueio', async ({ page }) => {
  await abrir(page, '/');
  const uid = await usuario(page);
  const ligar = (saiuHaMs: number) =>
    page.evaluate(
      ([uid, saiu]) => {
        localStorage.setItem(`cfp.bloqueio.${uid}`, JSON.stringify({ salt: 'x', pin: 'x', cred: null, minutos: 1 }));
        localStorage.setItem(`cfp.bloqueio.saiu.${uid}`, String(Date.now() - (saiu as number)));
      },
      [uid, saiuHaMs] as const,
    );
  try {
    await ligar(1000);
    await page.reload();
    await expect(page.locator('app-shell main')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'App bloqueado' })).toBeHidden();

    // reabrir depois de 2 min fora (aba nova: recarregar a mesma conta como "agora")
    await ligar(2 * 60_000);
    const outra = await page.context().newPage();
    await outra.goto('/');
    await expect(outra.getByRole('dialog', { name: 'App bloqueado' })).toBeVisible();
    await outra.close();
  } finally {
    await page.evaluate((uid) => {
      localStorage.removeItem(`cfp.bloqueio.${uid}`);
      localStorage.removeItem(`cfp.bloqueio.saiu.${uid}`);
    }, uid);
  }
});
