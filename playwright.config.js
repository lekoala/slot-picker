import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: "browser/**/*.spec.js",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:5123",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node test/server.js",
    url: "http://127.0.0.1:5123",
    reuseExistingServer: true,
    env: { PORT: "5123" },
    // Pipe stdio so Windows does not open a visible console window.
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
