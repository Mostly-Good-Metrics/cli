import { Command } from "commander";

/**
 * Prevent commander from calling process.exit or writing to stdout/stderr
 * directly. Applied recursively since subcommands are created before the
 * override is set on the root program.
 */
export function makeTestable(cmd: Command): Command {
  cmd.exitOverride();
  cmd.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  for (const sub of cmd.commands) {
    makeTestable(sub as Command);
  }
  return cmd;
}

export function run(program: Command, ...args: string[]): Promise<Command> {
  return program.parseAsync(["node", "mgm", ...args]);
}
