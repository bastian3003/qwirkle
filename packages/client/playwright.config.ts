import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
/** Short turns, so the countdown test does not wait a full minute. */
export const TURN_TIME_MS = 20_000;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    ...devices['Pixel 7'],
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'de-DE',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  // Builds the client and serves it from the real game server.
  webServer: {
    command: `npm run build && cd ../server && PORT=${PORT} HOST=127.0.0.1 TURN_TIME_MS=${TURN_TIME_MS} STATIC_DIR=../client/dist npx tsx src/index.ts`,
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
