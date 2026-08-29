import { Command } from "commander";
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import * as client from "../client.js";
import * as auth from "../auth.js";
import * as output from "../output.js";
import { CliUsageError, isNoInput } from "../runtime.js";

const CLIENT_NAME = "MostlyGoodMetrics CLI";
// Bind and redirect to the same IPv4 loopback address. Using `localhost` in
// the redirect URI can resolve to IPv6 (`::1`) in a browser while the server
// is listening only on IPv4, leaving the browser unable to deliver the code.
const CALLBACK_HOST = "127.0.0.1";

function getAppUrl(): URL {
  const configuredUrl = process.env.MGM_APP_URL ?? "https://app.mostlygoodmetrics.com";
  let appUrl: URL;
  try {
    appUrl = new URL(configuredUrl);
  } catch {
    throw new CliUsageError("MGM_APP_URL must be a valid URL.");
  }

  const localHttp = appUrl.protocol === "http:" &&
    (appUrl.hostname === "localhost" || appUrl.hostname === "127.0.0.1" || appUrl.hostname === "::1");
  if (appUrl.protocol !== "https:" && !localHttp) {
    throw new CliUsageError("MGM_APP_URL must use HTTPS (except localhost development URLs).");
  }
  return appUrl;
}

// ============================================================================
// PKCE helpers
// ============================================================================

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

// ============================================================================
// Browser-based OAuth login
// ============================================================================

async function browserLogin(opts: { signup?: boolean } = {}): Promise<void> {
  const appUrl = getAppUrl();
  // 1. Start a local HTTP server to receive the callback
  const { port, waitForCallback, server } = await startCallbackServer();
  const redirectUri = `http://${CALLBACK_HOST}:${port}/callback`;

  // 2. Register as an OAuth client (or reuse cached if same redirect_uri)
  let clientId = auth.getClientId();
  const cachedRedirectUri = auth.getRedirectUri();

  if (!clientId || cachedRedirectUri !== redirectUri) {
    console.log("Registering CLI with MostlyGoodMetrics...");
    const res = await fetch(new URL("/oauth/register", appUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: CLIENT_NAME,
        redirect_uris: [redirectUri],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, unknown>;
      console.error(`Registration failed: ${err.error ?? res.statusText}`);
      server.close();
      process.exit(1);
    }

    const data = (await res.json()) as { client_id: string };
    clientId = data.client_id;
    auth.saveClientId(clientId, redirectUri);
  }

  // 3. Generate PKCE challenge
  const { verifier, challenge } = generatePKCE();

  // 4. Build authorization URL and open browser
  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    scope: "mcp:tools",
  });
  if (opts.signup) params.set("signup", "true");

  const authorizeUrl = new URL("/oauth/authorize", appUrl);
  authorizeUrl.search = params.toString();

  console.log(opts.signup ? "Opening browser to create an account..." : "Opening browser to log in...");
  console.log();
  openBrowser(authorizeUrl.toString());
  console.log("Waiting for authorization...");
  console.log("(If your browser didn't open, visit this URL:)");
  console.log(authorizeUrl.toString());
  console.log();

  // 5. Wait for the callback
  const callbackResult = await waitForCallback();
  server.close();

  if (callbackResult.error) {
    console.error(`Authorization failed: ${callbackResult.error}`);
    process.exit(1);
  }

  if (callbackResult.state !== state) {
    console.error("State mismatch — possible CSRF attack. Aborting.");
    process.exit(1);
  }

  // 6. Exchange code for token
  const tokenRes = await fetch(new URL("/oauth/token", appUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: callbackResult.code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = (await tokenRes.json().catch(() => ({}))) as Record<string, unknown>;
    console.error(`Token exchange failed: ${err.error ?? tokenRes.statusText}`);
    process.exit(1);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };
  auth.saveToken(tokenData.access_token);

  // Fetch user info
  try {
    const { user } = await client.getMe();
    auth.saveToken(tokenData.access_token, user.email);
    console.log(`Logged in as ${user.email}`);
  } catch {
    console.log("Logged in. Run `mgm whoami` to verify.");
  }
}

// ============================================================================
// Local callback server
// ============================================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface CallbackResult {
  code?: string;
  state?: string;
  error?: string;
}

function startCallbackServer(): Promise<{
  port: number;
  waitForCallback: () => Promise<CallbackResult>;
  server: http.Server;
}> {
  return new Promise((resolve) => {
    let onCallback: (result: CallbackResult) => void;
    const callbackPromise = new Promise<CallbackResult>((res) => {
      onCallback = res;
    });

    const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://${CALLBACK_HOST}`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code") ?? undefined;
        const state = url.searchParams.get("state") ?? undefined;
        const error = url.searchParams.get("error") ?? undefined;

        // Show a nice page in the browser
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        if (code) {
          res.end(`
            <html><head><meta charset="utf-8"></head><body style="font-family: system-ui; text-align: center; padding: 60px;">
              <h1 style="color: #667eea;">✓ Logged in!</h1>
              <p>You can close this tab and return to the terminal.</p>
            </body></html>
          `);
        } else {
          res.end(`
            <html><head><meta charset="utf-8"></head><body style="font-family: system-ui; text-align: center; padding: 60px;">
              <h1 style="color: #ef4444;">Authorization failed</h1>
              <p>${escapeHtml(error ?? "Unknown error")}. Return to the terminal.</p>
            </body></html>
          `);
        }

        onCallback({ code, state, error });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    // Try fixed port first (so cached client_id works), fall back to random
    server.on("error", () => {
      server.listen(0, CALLBACK_HOST, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        resolve({ port, waitForCallback: () => callbackPromise, server });
      });
    });
    server.listen(19891, CALLBACK_HOST, () => {
      resolve({ port: 19891, waitForCallback: () => callbackPromise, server });
    });
  });
}

// ============================================================================
// Open browser (cross-platform)
// ============================================================================

function openBrowser(url: string): void {
  try {
    const platform = process.platform;
    if (platform === "darwin") {
      execFileSync("/usr/bin/open", [url], { stdio: "ignore" });
    } else if (platform === "win32") {
      execFileSync("rundll32.exe", ["url.dll,FileProtocolHandler", url], { stdio: "ignore" });
    } else {
      execFileSync("xdg-open", [url], { stdio: "ignore" });
    }
  } catch {
    // Browser open failed — user will use the printed URL
  }
}

// ============================================================================
// Commands
// ============================================================================

export function registerAuthCommands(program: Command): void {
  program
    .command("login")
    .description("Log in via browser (opens authorization page)")
    .option("--token <token>", "Use an existing session token directly")
    .action(async (opts: { token?: string }) => {
      if (opts.token) {
        // Direct token login (for CI, scripts, etc.)
        auth.saveToken(opts.token);
        try {
          const { user } = await client.getMe();
          auth.saveToken(opts.token, user.email);
          console.log(`Logged in as ${user.email}`);
        } catch {
          console.log("Token saved. Could not verify — check with `mgm whoami`.");
        }
        return;
      }

      if (isNoInput()) {
        throw new CliUsageError("login requires --token when --no-input is set.");
      }

      await browserLogin();
    });

  program
    .command("signup")
    .description("Create a new MostlyGoodMetrics account (opens browser)")
    .action(async () => {
      if (isNoInput()) {
        throw new CliUsageError("signup cannot run with --no-input. Create an account in the browser first.");
      }
      await browserLogin({ signup: true });
    });

  program
    .command("whoami")
    .description("Show current user and organization")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      auth.requireToken();
      const data = await client.getMe();

      if (opts.json) {
        output.json(data);
        return;
      }

      console.log(`Email: ${data.user.email}`);
      console.log(`User ID: ${data.user.id}`);
      if (data.organizations.length > 0) {
        console.log();
        console.log("Organizations:");
        output.table(
          ["Name", "Slug", "Plan", "Role"],
          data.organizations.map((o) => [o.name, o.slug, o.plan ?? "-", o.role ?? "-"]),
        );
      }
    });

  program
    .command("logout")
    .description("Clear stored session token")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const token = auth.getToken();
      if (token) {
        try {
          await client.logout();
        } catch {}
      }
      auth.clearToken();
      if (opts.json) {
        output.json({ status: "logged_out" });
        return;
      }
      console.log("Logged out.");
    });
}
