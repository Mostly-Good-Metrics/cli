import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Entry } from "@napi-rs/keyring";

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

function credentialEntry(): Entry {
  return new Entry(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
}

function readKeychainToken(): string | undefined {
  try {
    const token = credentialEntry().getPassword();
    return token || undefined;
  } catch {
    return undefined;
  }
}

function saveKeychainToken(token: string): boolean {
  try {
    credentialEntry().setPassword(token);
    return true;
  } catch {
    return false;
  }
}

function deleteKeychainToken(): void {
  try {
    credentialEntry().deletePassword();
  } catch {
    // The credential may not exist or the OS store may be unavailable.
  }
}

export function getToken(): string | undefined {
  if (process.env.MGM_TOKEN) return process.env.MGM_TOKEN;
  const keychainToken = readKeychainToken();
  if (keychainToken) return keychainToken;

  const config = readConfig();
  const legacyToken = config.token;
  if (legacyToken) {
    // Best-effort native-store migration. Retain the protected fallback: a
    // handful of keychain backends do not survive process boundaries.
    saveKeychainToken(legacyToken);
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
  // Keep the mode-0600 file fallback alongside the native credential store.
  // On some macOS setups a keychain write succeeds within the login process
  // but is not available to a later CLI invocation. The fallback makes the
  // successful OAuth session durable in that case.
  saveKeychainToken(token);
  config.token = token;
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
