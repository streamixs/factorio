import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatUptime,
} from "./format";

describe("formatDate", () => {
  it("formats an ISO date in French", () => {
    expect(formatDate("2026-11-24T12:00:00")).toBe("24/11/2026");
  });

  it("returns an em dash for missing or invalid values", () => {
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("includes the French date and time", () => {
    const value = formatDateTime("2026-11-24T12:00:00");
    expect(value).toContain("24/11/2026");
    expect(value).toContain("12:00");
  });

  it("returns an em dash for invalid values", () => {
    expect(formatDateTime("nope")).toBe("—");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-11-24T12:02:00");

  it("formats a recent past timestamp", () => {
    const value = formatRelativeTime("2026-11-24T12:00:00", now);
    expect(value).toContain("2");
    expect(value).toContain("minute");
  });

  it("formats a future timestamp", () => {
    const value = formatRelativeTime(
      "2026-11-24T15:00:00",
      Date.parse("2026-11-24T12:00:00"),
    );
    expect(value).toContain("3");
    expect(value).toContain("heure");
  });

  it("falls back for invalid values", () => {
    expect(formatRelativeTime("nope", now)).toBe("—");
  });
});

describe("formatUptime", () => {
  it("returns an em dash for missing or invalid values", () => {
    expect(formatUptime(undefined)).toBe("—");
    expect(formatUptime(null)).toBe("—");
    expect(formatUptime(-1)).toBe("—");
    expect(formatUptime(Number.NaN)).toBe("—");
  });

  it("formats seconds and minutes", () => {
    expect(formatUptime(0)).toBe("< 1 min");
    expect(formatUptime(59)).toBe("< 1 min");
    expect(formatUptime(60)).toBe("1 min");
    expect(formatUptime(90)).toBe("1 min");
    expect(formatUptime(59 * 60)).toBe("59 min");
  });

  it("formats hours", () => {
    expect(formatUptime(60 * 60)).toBe("1 h");
    expect(formatUptime(60 * 60 + 60)).toBe("1 h 1 min");
    expect(formatUptime(3 * 60 * 60 + 12 * 60)).toBe("3 h 12 min");
  });

  it("formats days", () => {
    expect(formatUptime(24 * 60 * 60)).toBe("1 j");
    expect(formatUptime(2 * 24 * 60 * 60 + 4 * 60 * 60)).toBe("2 j 4 h");
  });
});
