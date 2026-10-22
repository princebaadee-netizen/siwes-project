import { describe, expect, it, vi } from "vitest";
import { formatNaira, isEmailNotVerified } from "./api";

describe("formatNaira", () => {
  it("renders naira with thousands separators", () => {
    expect(formatNaira(10000)).toBe("₦10,000");
    expect(formatNaira(27000)).toBe("₦27,000");
  });

  it("rounds to whole naira", () => {
    expect(formatNaira(1999.6)).toBe("₦2,000");
  });

  it("handles zero", () => {
    expect(formatNaira(0)).toBe("₦0");
  });
});

describe("isEmailNotVerified", () => {
  it("ignores errors that are not API errors", () => {
    expect(isEmailNotVerified(new Error("boom"))).toBe(false);
    expect(isEmailNotVerified(undefined)).toBe(false);
    expect(isEmailNotVerified(null)).toBe(false);
    expect(isEmailNotVerified("EMAIL_NOT_VERIFIED")).toBe(false);
  });

  it("ignores API errors with a different code", async () => {
    const res = new Response(
      JSON.stringify({ message: "Nope", code: "SOMETHING_ELSE" }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
    const fetchMock = vi.fn().mockResolvedValue(res);
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { api } = await import("./api");
      await expect(api.initializePayment("BUNDLE")).rejects.toThrow("Nope");
      const err = await api.initializePayment("BUNDLE").catch((e) => e);
      expect(isEmailNotVerified(err)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("recognises the email gate refusal", async () => {
    const res = new Response(
      JSON.stringify({
        message: "Verify your email address to use AI features and buy a pass.",
        code: "EMAIL_NOT_VERIFIED",
      }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
    try {
      const { api } = await import("./api");
      const err = await api.initializePayment("BUNDLE").catch((e) => e);
      expect(isEmailNotVerified(err)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
