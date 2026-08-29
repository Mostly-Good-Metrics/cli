import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

function getConfigDir(): string {
  const platform = process.platform;
  if (platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "mgm");
  }
  // macOS and Linux: follow XDG_CONFIG_HOME, default to ~/.config
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "mgm");
}

const CONFIG_DIR = getConfigDir();
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const KEYCHAIN_SERVICE = "com.mostlygoodmetrics.cli";
const KEYCHAIN_ACCOUNT = "oauth-token";

// Migrate from legacy ~/.mgm/config.json if it exists
const LEGACY_CONFIG = path.join(os.homedir(), ".mgm", "config.json");
try {
  if (fs.existsSync(LEGACY_CONFIG) && !fs.existsSync(CONFIG_FILE)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.copyFileSync(LEGACY_CONFIG, CONFIG_FILE);
    fs.chmodSync(CONFIG_FILE, 0o600);
    fs.unlinkSync(LEGACY_CONFIG);
    try { fs.rmdirSync(path.dirname(LEGACY_CONFIG)); } catch {}
  }
} catch {}

interface Config {
  token?: string;
  email?: string;
  client_id?: string;
  redirect_uri?: string;
}

function readConfig(): Config {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as Config;
    // Ensure legacy/file-fallback credentials are never left world-readable.
    try { fs.chmodSync(CONFIG_FILE, 0o600); } catch {}
    return config;
  } catch {
    return {};
  }
}

function writeConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const temporaryFile = `${CONFIG_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.chmodSync(temporaryFile, 0o600);
  fs.renameSync(temporaryFile, CONFIG_FILE);
  // chmod is required for existing files, where writeFile's mode is ignored.
  fs.chmodSync(CONFIG_FILE, 0o600);
}

function readKeychainToken(): string | undefined {
  if (process.platform !== "darwin") return undefined;
  try {
    const token = execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

function saveKeychainToken(token: string): boolean {
  if (process.platform !== "darwin") return false;
  try {
    execFileSync(
      "/usr/bin/security",
      ["add-generic-password", "-U", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE, "-w", token],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

function deleteKeychainToken(): void {
  if (process.platform !== "darwin") return;
  try {
    execFileSync(
      "/usr/bin/security",
      ["delete-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE],
      { stdio: "ignore" },
    );
  } catch {
    // The key may not exist yet; removing local fallback state still logs out.
  }
}

export function getToken(): string | undefined {
  if (process.env.MGM_TOKEN) return process.env.MGM_TOKEN;
  const keychainToken = readKeychainToken();
  if (keychainToken) return keychainToken;

  const config = readConfig();
  const legacyToken = config.token;
  if (legacyToken && saveKeychainToken(legacyToken)) {
    delete config.token;
    writeConfig(config);
    return legacyToken;
  }
  return legacyToken;
}

export function getEmail(): string | undefined {
  return readConfig().email;
}

export function getClientId(): string | undefined {
  return readConfig().client_id;
}

export function getRedirectUri(): string | undefined {
  return readConfig().redirect_uri;
}

export function saveToken(token: string, email?: string): void {
  const config = readConfig();
  if (saveKeychainToken(token)) {
    delete config.token;
  } else {
    // Do not let a stale Keychain value silently override this new login.
    deleteKeychainToken();
    config.token = token;
  }
  if (email) config.email = email;
  writeConfig(config);
}

export function saveClientId(clientId: string, redirectUri?: string): void {
  const config = readConfig();
  config.client_id = clientId;
  if (redirectUri) config.redirect_uri = redirectUri;
  writeConfig(config);
}

export function clearToken(): void {
  const config = readConfig();
  deleteKeychainToken();
  delete config.token;
  delete config.email;
  writeConfig(config);
}

export function requireToken(): string {
  const token = getToken();
  if (!token) {
    console.error("Not logged in. Run `mgm login` first.");
    process.exit(1);
  }
  return token;
}
