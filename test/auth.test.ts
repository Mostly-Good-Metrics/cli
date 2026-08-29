import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalPlatform = process.platform;
let testConfigDir: string | undefined;

afterEach(() => {
  vi.doUnmock("@napi-rs/keyring");
  vi.resetModules();
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  delete process.env.XDG_CONFIG_HOME;
  if (testConfigDir) fs.rmSync(testConfigDir, { recursive: true, force: true });
  testConfigDir = undefined;
});

describe("credential storage", () => {
  it("migrates a legacy token into the native credential store and hardens the config file", async () => {
    testConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "mgm-auth-test-"));
    process.env.XDG_CONFIG_HOME = testConfigDir;
    let storedToken: string | undefined;
    const getPassword = vi.fn(() => {
      if (!storedToken) throw new Error("not found");
      return storedToken;
    });
    const setPassword = vi.fn((token: string) => { storedToken = token; });
    const Entry = vi.fn(function () {
      return { getPassword, setPassword, deletePassword: vi.fn() };
    });
    vi.doMock("@napi-rs/keyring", () => ({ Entry }));

    const configDir = path.join(testConfigDir, "mgm");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({ token: "legacy-token" }), { mode: 0o644 });

    const auth = await import("../src/auth.js");

    expect(auth.getToken()).toBe("legacy-token");
    expect(Entry).toHaveBeenCalledWith("com.mostlygoodmetrics.cli", "oauth-token");
    expect(setPassword).toHaveBeenCalledWith("legacy-token");
    expect(JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf-8"))).toMatchObject({ token: "legacy-token" });
    expect(fs.statSync(path.join(configDir, "config.json")).mode & 0o777).toBe(0o600);
  });

  it("keeps the protected file fallback when a keychain write cannot be read back", async () => {
    testConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "mgm-auth-test-"));
    process.env.XDG_CONFIG_HOME = testConfigDir;
    const Entry = vi.fn(function () {
      return {
        getPassword: () => { throw new Error("not found"); },
        setPassword: vi.fn(),
        deletePassword: vi.fn(),
      };
    });
    vi.doMock("@napi-rs/keyring", () => ({ Entry }));

    const auth = await import("../src/auth.js");
    auth.saveToken("new-token", "josh@example.com");

    const config = JSON.parse(fs.readFileSync(path.join(testConfigDir, "mgm", "config.json"), "utf-8"));
    expect(config).toMatchObject({ token: "new-token", email: "josh@example.com" });
    expect(fs.statSync(path.join(testConfigDir, "mgm", "config.json")).mode & 0o777).toBe(0o600);
  });
});
