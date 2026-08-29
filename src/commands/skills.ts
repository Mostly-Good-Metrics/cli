import { spawnSync } from "node:child_process";
import { Command } from "commander";
import { CliUsageError, isNoInput } from "../runtime.js";

const MGM_SKILLS_SOURCE = "Mostly-Good-Metrics/skills";

interface SkillsOptions {
  global?: boolean;
  agent?: string[];
  skill?: string[];
  yes?: boolean;
}

export function buildSkillsInstallerArgs(command: "install" | "list", opts: SkillsOptions): string[] {
  const args = ["--yes", "skills", "add", MGM_SKILLS_SOURCE];

  if (command === "list") return [...args, "--list"];
  if (opts.global) args.push("--global");
  for (const agent of opts.agent ?? []) args.push("--agent", agent);
  for (const skill of opts.skill ?? []) args.push("--skill", skill);
  if (opts.yes) args.push("--yes");

  return args;
}

function runSkillsInstaller(args: string[]): void {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(executable, args, { stdio: "inherit" });

  if (result.error) throw new CliUsageError(`Could not start the skills installer: ${result.error.message}`);
  if (result.status !== 0) throw new CliUsageError("The skills installer did not complete successfully.");
}

export function registerSkillsCommands(program: Command): void {
  const skills = program
    .command("skills")
    .description("Install MostlyGoodMetrics agent skills");

  skills
    .command("list")
    .description("List available MostlyGoodMetrics skills")
    .action(() => runSkillsInstaller(buildSkillsInstallerArgs("list", {})));

  skills
    .command("install")
    .description("Install MostlyGoodMetrics skills with the standard skills installer")
    .option("-g, --global", "Install globally instead of in the current project")
    .option("-a, --agent <agents...>", "Target agent(s), such as codex or claude-code")
    .option("-s, --skill <skills...>", "Install only named skill(s)")
    .option("-y, --yes", "Skip installer prompts")
    .action((opts: SkillsOptions) => {
      if (isNoInput() && !opts.yes) {
        throw new CliUsageError("skills install requires --yes when running with --no-input.");
      }
      runSkillsInstaller(buildSkillsInstallerArgs("install", opts));
    });
}
