import { defineConfig } from '@playwright/test';

// Boots both servers the test needs:
//  - the feat router (flask, :5099, cwd back/)
//  - the Angular dev server (:4200)
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:4200',
  },
  webServer: [
    {
      command: '.venv/bin/python -c "from app import app; app.run(port=5099, use_reloader=False)"',
      cwd: '../../back',
      port: 5099,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm start',
      port: 4200,
      // reuse a manually started `ng serve` (the "run it like prod" flow);
      // CI always boots its own
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
