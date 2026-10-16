import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { VERSION } from "../src/program.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

describe("version", () => {
  // `npm version` updates package.json but not the VERSION constant, so the
  // two silently drifted: 0.1.3 shipped reporting an older number. Anything
  // released from here on must agree.
  it("matches package.json", () => {
    expect(VERSION).toBe(pkg.version);
  });
});
