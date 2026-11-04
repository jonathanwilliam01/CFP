import { Page, expect, test as base } from '@playwright/test';

/** Erros de console e da página durante o teste; ruído de rede externa fica de fora */
export const test = base.extend<{ erros: string[] }>({
  erros: async ({ page }, use) => {
    const l: string[] = [];
    page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && l.push(m.text()));
    page.on('pageerror', (e) => l.push(e.message));
    await use(l);
  },
});
export { expect };

/** Abre a rota e espera os dados do mês */
export async function abrir(page: Page, rota: string) {
  await page.goto(rota);
  await expect(page.locator('app-shell main')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

/** Nada passa da largura da tela (sem rolagem de lado) */
export async function semRolagemLateral(page: Page) {
  const { largura, tela } = await page.evaluate(() => ({ largura: document.documentElement.scrollWidth, tela: innerWidth }));
  expect(largura, 'conteúdo mais largo que a tela').toBeLessThanOrEqual(tela + 1);
}

/** id do usuário logado (sessão do Supabase no localStorage) */
export function usuario(page: Page) {
  return page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x))!;
    return JSON.parse(localStorage.getItem(k)!).user.id as string;
  });
}
