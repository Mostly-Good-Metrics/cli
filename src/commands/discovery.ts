import { Command } from "commander";
import * as output from "../output.js";

interface CommandSchema {
  path: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
    variadic: boolean;
  }>;
  options: Array<{
    flags: string;
    description: string;
    required: boolean;
    default?: unknown;
  }>;
  subcommands: string[];
}

function schemaFor(command: Command, path: string[], root?: Command): CommandSchema {
  const effectiveOptions = (): typeof command.options => {
    const commands: Command[] = [];
    let current: Command | null = command;
    while (current) {
      commands.unshift(current);
      if (current === root) break;
      current = current.parent;
    }
    const seen = new Set<string>();
    return commands.flatMap((item) => item.options).filter((option) => {
      if (seen.has(option.flags)) return false;
      seen.add(option.flags);
      return true;
    });
  };
  return {
    path: path.join(" "),
    description: command.description(),
    arguments: command.registeredArguments.map((arg) => ({
      name: arg.name(),
      description: arg.description,
      required: arg.required,
      variadic: arg.variadic,
    })),
    options: effectiveOptions().map((option) => ({
      flags: option.flags,
      description: option.description,
      required: option.mandatory,
      ...(option.defaultValue !== undefined ? { default: option.defaultValue } : {}),
    })),
    subcommands: command.commands.map((subcommand) => subcommand.name()),
  };
}

function findCommand(root: Command, path: string[]): Command | undefined {
  let command = root;
  for (const name of path) {
    const next = command.commands.find((subcommand) => subcommand.name() === name);
    if (!next) return undefined;
    command = next;
  }
  return command;
}

function allSchemas(command: Command, root: Command, path: string[] = []): CommandSchema[] {
  return command.commands
    .flatMap((subcommand) => {
      const subcommandPath = [...path, subcommand.name()];
      return [schemaFor(subcommand, subcommandPath, root), ...allSchemas(subcommand, root, subcommandPath)];
    });
}

export function registerDiscoveryCommands(program: Command): void {
  program
    .command("commands")
    .description("List every available command and its capabilities")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const commands = allSchemas(program, program);
      if (opts.json) {
        output.json(commands);
        return;
      }

      output.table(
        ["Command", "Description"],
        commands.map((command) => [command.path, command.description]),
      );
    });

  program
    .command("schema <command...>")
    .description("Show arguments, flags, and subcommands for a command path")
    .option("--json", "Output as JSON")
    .action((commandPath: string[], opts: { json?: boolean }) => {
      const command = findCommand(program, commandPath);
      if (!command) {
        throw new Error(`Unknown command: mgm ${commandPath.join(" ")}`);
      }

      const schema = schemaFor(command, commandPath, program);
      if (opts.json) {
        output.json(schema);
        return;
      }

      console.log(`mgm ${schema.path}`);
      console.log(schema.description);
      if (schema.arguments.length > 0) {
        console.log("\nArguments:");
        output.table(
          ["Name", "Required", "Description"],
          schema.arguments.map((arg) => [arg.name, arg.required ? "yes" : "no", arg.description]),
        );
      }
      if (schema.options.length > 0) {
        console.log("\nOptions:");
        output.table(
          ["Flags", "Required", "Description"],
          schema.options.map((option) => [option.flags, option.required ? "yes" : "no", option.description]),
        );
      }
    });
}
