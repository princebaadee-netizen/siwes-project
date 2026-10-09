import { describe, expect, it } from "vitest";
import { formatNaira } from "./api";

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
