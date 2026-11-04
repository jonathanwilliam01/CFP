import { defineConfig, devices } from '@playwright/test';

// Conta em CFP_EMAIL/CFP_SENHA (de preferência uma conta só de teste). Os testes só navegam:
// o que eles mexem fica no navegador do teste (localStorage), nada é salvo na carteira.
const porta = Number(process.env.E2E_PORTA ?? 4310);

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${porta}`, trace: 'retain-on-failure', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  webServer: { command: `npx ng serve --port ${porta}`, url: `http://localhost:${porta}`, reuseExistingServer: true, timeout: 180_000 },
  projects: [
    { name: 'login', testMatch: 'login.setup.ts' },
    {
      name: 'celular',
      dependencies: ['login'],
      use: { ...devices['Pixel 7'], storageState: 'e2e/.auth/estado.json' },
    },
    {
      name: 'computador',
      dependencies: ['login'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 }, storageState: 'e2e/.auth/estado.json' },
      testIgnore: ['gestos.e2e.ts'],
    },
  ],
});
