import { describe, expect, it } from "vitest";

import { shouldBlockCreateSubmit } from "./create-form";

describe("shouldBlockCreateSubmit", () => {
  it("blocks Enter in a text input on the resources step", () => {
    expect(shouldBlockCreateSubmit(3, 3, "Enter", "INPUT")).toBe(true);
  });

  it("allows Enter on the identity and world steps", () => {
    expect(shouldBlockCreateSubmit(1, 3, "Enter", "INPUT")).toBe(false);
    expect(shouldBlockCreateSubmit(2, 3, "Enter", "INPUT")).toBe(false);
  });

  it("allows explicit button activation", () => {
    expect(shouldBlockCreateSubmit(3, 3, "Enter", "BUTTON")).toBe(false);
    expect(shouldBlockCreateSubmit(3, 3, " ", "BUTTON")).toBe(false);
  });

  it("does not block other keys or text areas", () => {
    expect(shouldBlockCreateSubmit(3, 3, " ", "INPUT")).toBe(false);
    expect(shouldBlockCreateSubmit(3, 3, "Enter", "TEXTAREA")).toBe(false);
  });
});
