import { describe, expect, it } from "vitest";

import { serverNameFromLocation } from "./server-route";

describe("serverNameFromLocation", () => {
  it("reads the canonical query parameter", () => {
    expect(serverNameFromLocation("?name=test-123", "/servers/view")).toBe(
      "test-123",
    );
    expect(serverNameFromLocation("name=test", "/servers/view")).toBe("test");
  });

  it("falls back to the path segment", () => {
    expect(serverNameFromLocation("", "/servers/test-123")).toBe("test-123");
    expect(serverNameFromLocation("", "/servers/test%2D123")).toBe("test-123");
  });

  it("ignores the view and creation routes", () => {
    expect(serverNameFromLocation("", "/servers/view")).toBe("");
    expect(serverNameFromLocation("", "/servers/new")).toBe("");
    expect(serverNameFromLocation("", "/")).toBe("");
  });

  it("keeps the raw segment when decoding fails", () => {
    expect(serverNameFromLocation("", "/servers/%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("does not use an empty query value as a name", () => {
    expect(serverNameFromLocation("?name=", "/servers/view")).toBe("");
  });
});
