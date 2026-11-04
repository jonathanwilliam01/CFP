import { abrir, expect, test } from './apoio';

// OCR baixa o motor e o português da internet na primeira vez: teste lento
test('lê o total do cupom pela foto (não salva o gasto)', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const p = await browser.newPage({ viewport: { width: 420, height: 560 } });
  await p.setContent(`<pre style="font: 22px monospace; padding: 24px; background: #fff; color: #000">SUPERMERCADO TESTE LTDA
CNPJ 12.345.678/0001-90
ARROZ 5KG          24,90
FEIJAO 1KG         24,90
SUBTOTAL           49,80
TOTAL R$           49,80
30/11/2026 18:22</pre>`);
  const foto = await p.screenshot({ type: 'png' });
  await p.close();

  await abrir(page, '/gastos');
  await page.getByRole('button', { name: 'Novo' }).click();
  const painel = page.getByRole('dialog');
  await painel.locator('input[type=file]').first().setInputFiles({ name: 'cupom.png', mimeType: 'image/png', buffer: foto });
  await painel.getByRole('button', { name: 'Ler da foto' }).click();
  await expect(painel.locator('input[name=valor]')).toHaveValue('49,80', { timeout: 150_000 });
  await expect(painel.locator('input[name=descricao]')).toHaveValue(/supermercado teste/i);
  await painel.getByRole('button', { name: 'Fechar' }).click();
});
