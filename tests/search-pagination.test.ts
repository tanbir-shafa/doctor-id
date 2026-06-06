// @vitest-environment node
import { describe, it, expect } from "vitest";
import { clampPage, clampPageSize, MAX_PAGE } from "@/lib/db/queries/doctors";

describe("clampPage — deep-pagination DoS guard", () => {
  it("caps an absurd page request (skip-billions DoS)", () => {
    expect(clampPage(999_999_999)).toBe(MAX_PAGE);
  });

  it("floors at 1 for zero / negative / junk", () => {
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-5)).toBe(1);
    expect(clampPage("abc")).toBe(1);
    expect(clampPage(undefined)).toBe(1);
  });

  it("passes through a normal page", () => {
    expect(clampPage(3)).toBe(3);
    expect(clampPage(MAX_PAGE)).toBe(MAX_PAGE);
  });
});

describe("clampPageSize", () => {
  it("caps at 50 and floors at 5", () => {
    expect(clampPageSize(1000)).toBe(50);
    expect(clampPageSize(1)).toBe(5);
  });

  it("defaults junk to 20", () => {
    expect(clampPageSize(undefined)).toBe(20);
    expect(clampPageSize("xyz")).toBe(20);
  });
});
