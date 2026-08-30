import { describe, expect, it } from "vitest";
import { buildSkillsInstallerArgs } from "../src/commands/skills.js";

describe("skills installer arguments", () => {
  it("lists the MGM skill source", () => {
    expect(buildSkillsInstallerArgs("list", {})).toEqual([
      "--yes", "skills", "add", "Mostly-Good-Metrics/skills", "--list",
    ]);
  });

  it("forwards installation scope, targets, selection, and confirmation", () => {
    expect(buildSkillsInstallerArgs("install", {
      global: true,
      agent: ["codex", "claude-code"],
      skill: ["instrument-my-app"],
      yes: true,
    })).toEqual([
      "--yes", "skills", "add", "Mostly-Good-Metrics/skills",
      "--global",
      "--agent", "codex",
      "--agent", "claude-code",
      "--skill", "instrument-my-app",
      "--yes",
    ]);
  });
});
