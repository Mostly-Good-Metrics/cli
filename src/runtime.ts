import readline from "node:readline/promises";

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export async function requireConfirmation(
  opts: { yes?: boolean; input?: boolean },
  action: string,
): Promise<void> {
  if (opts.yes) return;
  if (opts.input === false || !process.stdin.isTTY) {
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
