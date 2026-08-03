import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as output from "../src/output.js";

let logs: string[];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("table", () => {
  it("pads columns to the widest cell", () => {
    output.table(["ID", "Name"], [["p_1", "My App"], ["p_22", "X"]]);

    expect(logs[0]).toBe("ID    Name  ");
    expect(logs[1]).toBe("----  ------");
    expect(logs[2]).toBe("p_1   My App");
    expect(logs[3]).toBe("p_22  X     ");
  });

  it("handles rows with fewer cells than headers", () => {
    output.table(["A", "B"], [["x"]]);
    expect(logs[2]).toBe("x");
  });
});

describe("json", () => {
  it("pretty-prints JSON", () => {
    output.json({ a: 1 });
    expect(JSON.parse(logs[0])).toEqual({ a: 1 });
    expect(logs[0]).toContain("\n");
  });
});

describe("formatTrend", () => {
  it("prefixes positive trends with +", () => {
    expect(output.formatTrend(0.123)).toBe("+12.3%");
  });

  it("keeps the minus sign on negative trends", () => {
    expect(output.formatTrend(-0.05)).toBe("-5.0%");
  });

  it("treats zero as positive", () => {
    expect(output.formatTrend(0)).toBe("+0.0%");
  });
});

describe("formatNumber", () => {
  it("adds thousands separators", () => {
    expect(output.formatNumber(1234567)).toBe((1234567).toLocaleString());
  });
});

describe("truncate", () => {
  it("leaves short strings alone", () => {
    expect(output.truncate("short", 10)).toBe("short");
  });

  it("truncates long strings with an ellipsis", () => {
    expect(output.truncate("abcdefghij", 5)).toBe("abcd…");
    expect(output.truncate("abcdefghij", 5)).toHaveLength(5);
  });
});
