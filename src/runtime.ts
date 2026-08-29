import readline from "node:readline/promises";

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

interface RuntimeOptions {
  input?: boolean;
  jq?: string;
  yes?: boolean;
}

let runtimeOptions: RuntimeOptions = {};

export function configureRuntimeOptions(options: RuntimeOptions): void {
  runtimeOptions = options;
}

export function getRuntimeOptions(): Readonly<RuntimeOptions> {
  return runtimeOptions;
}

export function isNoInput(): boolean {
  return runtimeOptions.input === false;
}

export async function requireConfirmation(action: string): Promise<void> {
  if (runtimeOptions.yes) return;
  if (isNoInput() || !process.stdin.isTTY) {
    throw new CliUsageError(`${action} requires --yes when running without interactive input.`);
  }

  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question(`${action}. Continue? [y/N] `);
    if (answer.trim().toLowerCase() !== "y" && answer.trim().toLowerCase() !== "yes") {
      throw new CliUsageError("Cancelled.");
    }
  } finally {
    prompt.close();
  }
}
