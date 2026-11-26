import { describe, expect, it } from "vitest";

import {
  parseCpu,
  parseMemory,
  validateResourceQuantities,
} from "./resource-quantities";

describe("parseCpu", () => {
  it("parses millicores and cores", () => {
    expect(parseCpu("500m")).toBe(500);
    expect(parseCpu("2")).toBe(2000);
    expect(parseCpu("1.5")).toBe(1500);
  });

  it("parses microcores and nanocores", () => {
    expect(parseCpu("1000u")).toBe(1);
    expect(parseCpu("1000000n")).toBe(1);
  });

  it("rejects invalid values", () => {
    expect(parseCpu("abc")).toBeUndefined();
    expect(parseCpu("1Gi")).toBeUndefined();
    expect(parseCpu("")).toBeUndefined();
  });
});

describe("parseMemory", () => {
  it("parses binary units", () => {
    expect(parseMemory("512Mi")).toBe(512 * 1024 ** 2);
    expect(parseMemory("1Gi")).toBe(1024 ** 3);
  });

  it("parses decimal units", () => {
    expect(parseMemory("1G")).toBe(1e9);
    expect(parseMemory("1024K")).toBe(1024 * 1000);
  });

  it("parses a plain number of bytes", () => {
    expect(parseMemory("100")).toBe(100);
  });

  it("rejects invalid values", () => {
    expect(parseMemory("abc")).toBeUndefined();
    expect(parseMemory("")).toBeUndefined();
  });
});

describe("validateResourceQuantities", () => {
  it("ignores missing resources", () => {
    expect(validateResourceQuantities(undefined)).toBeUndefined();
  });

  it("accepts valid requests and limits", () => {
    expect(
      validateResourceQuantities({
        cpuRequest: "500m",
        cpuLimit: "2",
        memoryRequest: "1Gi",
        memoryLimit: "4Gi",
      }),
    ).toBeUndefined();
  });

  it("accepts equal requests and limits", () => {
    expect(
      validateResourceQuantities({
        cpuRequest: "1",
        cpuLimit: "1",
        memoryRequest: "1Gi",
        memoryLimit: "1Gi",
      }),
    ).toBeUndefined();
  });

  it("ignores empty fields", () => {
    expect(
      validateResourceQuantities({
        cpuRequest: "",
        cpuLimit: "1",
      }),
    ).toBeUndefined();
  });

  it("rejects an invalid CPU quantity", () => {
    const issue = validateResourceQuantities({ cpuRequest: "abc" });

    expect(issue?.field).toBe("cpuRequest");
    expect(issue?.message).toContain("CPU request");
    expect(issue?.message).toContain("quantité Kubernetes invalide");
  });

  it("rejects an invalid memory quantity", () => {
    const issue = validateResourceQuantities({ memoryLimit: "10GiB" });

    expect(issue?.field).toBe("memoryLimit");
    expect(issue?.message).toContain("Mémoire limit");
    expect(issue?.message).toContain("quantité Kubernetes invalide");
  });

  it("rejects a CPU limit below the request", () => {
    const issue = validateResourceQuantities({
      cpuRequest: "1",
      cpuLimit: "500m",
    });

    expect(issue).toEqual({
      field: "cpuLimit",
      message:
        "La limite CPU doit être supérieure ou égale à la CPU request.",
    });
  });

  it("rejects a memory limit below the request", () => {
    const issue = validateResourceQuantities({
      memoryRequest: "2Gi",
      memoryLimit: "1Gi",
    });

    expect(issue).toEqual({
      field: "memoryLimit",
      message:
        "La limite mémoire doit être supérieure ou égale à la mémoire request.",
    });
  });
});
