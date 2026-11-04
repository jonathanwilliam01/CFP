import { abrir, expect, test } from './apoio';

/** Toque sintético: o touchscreen do Playwright só faz tap */
async function arrastar(page: import('@playwright/test').Page, de: [number, number], para: [number, number]) {
  await page.evaluate(([de, para]) => {
    const main = document.querySelector('app-shell main')!;
    const t = (x: number, y: number) => new Touch({ identifier: 1, target: main, clientX: x, clientY: y });
    main.dispatchEvent(new TouchEvent('touchstart', { touches: [t(...de)], changedTouches: [t(...de)], bubbles: true }));
    for (let i = 1; i <= 5; i++) {
      const x = de[0] + ((para[0] - de[0]) * i) / 5;
      const y = de[1] + ((para[1] - de[1]) * i) / 5;
      main.dispatchEvent(new TouchEvent('touchmove', { touches: [t(x, y)], changedTouches: [t(x, y)], bubbles: true }));
    }
    main.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(...para)], bubbles: true }));
  }, [de, para] as const);
}

test('puxar para baixo atualiza sem recarregar a página', async ({ page }) => {
  await abrir(page, '/gastos');
  await page.evaluate(() => ((window as unknown as { marca: number }).marca = 1));
  await arrastar(page, [200, 300], [200, 600]);
  await expect(page.locator('.puxar')).toBeVisible();
  await expect(page.locator('.puxar')).toBeHidden({ timeout: 15_000 });
  // mesma página: a marca continua lá
  expect(await page.evaluate(() => (window as unknown as { marca?: number }).marca)).toBe(1);
});

test('arrastar para o lado troca o mês', async ({ page }) => {
  await abrir(page, '/gastos');
  const mes = page.locator('app-shell .top').getByText(/\d{4}/).first();
  const antes = await mes.textContent();
  await arrastar(page, [320, 700], [60, 705]);
  await expect(mes).not.toHaveText(antes!);
});
