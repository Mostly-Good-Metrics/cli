import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".mgm");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

interface Config {
  token?: string;
  email?: string;
  client_id?: string;
  redirect_uri?: string;
}

function readConfig(): Config {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}

export function getToken(): string | undefined {
  return readConfig().token;
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
