import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalPlatform = process.platform;
let testConfigDir: string | undefined;

afterEach(() => {
  vi.doUnmock("node:child_process");
  vi.resetModules();
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
  delete process.env.XDG_CONFIG_HOME;
  if (testConfigDir) fs.rmSync(testConfigDir, { recursive: true, force: true });
  testConfigDir = undefined;
});

describe("credential storage", () => {
  it("migrates a legacy macOS token into Keychain and hardens the config file", async () => {
    testConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "mgm-auth-test-"));
    process.env.XDG_CONFIG_HOME = testConfigDir;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });

    const execFileSync = vi.fn((_: string, args: string[]) => {
      if (args[0] === "find-generic-password") throw new Error("not found");
      return Buffer.from("");
    });
    vi.doMock("node:child_process", () => ({ execFileSync }));

    const configDir = path.join(testConfigDir, "mgm");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({ token: "legacy-token" }), { mode: 0o644 });

    const auth = await import("../src/auth.js");

    expect(auth.getToken()).toBe("legacy-token");
    expect(execFileSync).toHaveBeenCalledWith(
      "/usr/bin/security",
      ["add-generic-password", "-U", "-a", "oauth-token", "-s", "com.mostlygoodmetrics.cli", "-w", "legacy-token"],
      { stdio: "ignore" },
    );
    expect(JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf-8"))).not.toHaveProperty("token");
    expect(fs.statSync(path.join(configDir, "config.json")).mode & 0o777).toBe(0o600);
  });
});
