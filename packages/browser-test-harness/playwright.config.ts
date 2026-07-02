import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './generated',
  outputDir: './test-results',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: 'json',
  use: {
    headless: true,
    screenshot: 'on',
    video: 'off',
    trace: 'off',
    baseURL: process.env['SPECLYN_BASE_URL'],
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
