import { describe, it, expect } from "vitest";
import {
  LOCALES,
  DEFAULT_LOCALE,
  isAppLocale,
  localizedPath,
  parseLocalePath,
  hreflangAlternates,
} from "@/lib/i18n/config";

describe("i18n config — locale URL helpers", () => {
  it("en is the default + unprefixed; bn is /bn-prefixed", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(LOCALES).toContain("bn");
    expect(localizedPath("en", "/cardiology")).toBe("/cardiology");
    expect(localizedPath("bn", "/cardiology")).toBe("/bn/cardiology");
    expect(localizedPath("bn", "/cardiology/dhaka")).toBe("/bn/cardiology/dhaka");
    expect(localizedPath("en", "/")).toBe("/");
    expect(localizedPath("bn", "/")).toBe("/bn");
  });

  it("isAppLocale guards unknown values", () => {
    expect(isAppLocale("bn")).toBe(true);
    expect(isAppLocale("fr")).toBe(false);
  });

  it("parseLocalePath round-trips with localizedPath", () => {
    expect(parseLocalePath("/bn/cardiology/dhaka")).toEqual({ locale: "bn", path: "/cardiology/dhaka" });
    expect(parseLocalePath("/bn")).toEqual({ locale: "bn", path: "/" });
    expect(parseLocalePath("/cardiology")).toEqual({ locale: "en", path: "/cardiology" });
    expect(parseLocalePath("/")).toEqual({ locale: "en", path: "/" });
    // a doctor slug that merely starts with "bn" must NOT be treated as a locale
    expect(parseLocalePath("/bnurul-islam-cardiologist")).toEqual({
      locale: "en",
      path: "/bnurul-islam-cardiologist",
    });
  });

  it("hreflangAlternates is reciprocal (en-BD, bn-BD, x-default)", () => {
    const alts = hreflangAlternates("/cardiology/dhaka");
    expect(alts).toEqual({
      "en-BD": "/cardiology/dhaka",
      "bn-BD": "/bn/cardiology/dhaka",
      "x-default": "/cardiology/dhaka",
    });
    expect(hreflangAlternates("/")["bn-BD"]).toBe("/bn");
  });
});
