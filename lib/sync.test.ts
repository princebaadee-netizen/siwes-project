import { describe, expect, it } from "vitest";
import { applyProfile } from "./sync";
import { emptyState } from "./types";

describe("applyProfile", () => {
  it("returns the state untouched when there is no profile", () => {
    expect(applyProfile(emptyState, null)).toBe(emptyState);
  });

  it("hydrates profile, placement and project from the server record", () => {
    const next = applyProfile(emptyState, {
      fullName: "Ada Obi",
      school: "UNILAG",
      department: "Computer Science",
      moduleChoice: "BOTH",
      itPlacement: {
        companyName: "Acme Ltd",
        companyAddress: "1 Broad St",
        industrySector: "Tech",
        startDate: "2026-06-01T00:00:00.000Z",
        endDate: "2026-11-30T00:00:00.000Z",
        daysPerWeek: 3,
        attendancePattern: ["mon", "wed", "fri"],
      },
      projects: [{ title: "Smart Logbook", supervisorName: "Dr. Bello" }],
    });

    expect(next.onboardingComplete).toBe(true);
    expect(next.moduleChoice).toBe("both");
    expect(next.profile).toEqual({
      fullName: "Ada Obi",
      school: "UNILAG",
      department: "Computer Science",
    });
    // The date input wants a bare YYYY-MM-DD.
    expect(next.placement.startDate).toBe("2026-06-01");
    expect(next.placement.endDate).toBe("2026-11-30");
    expect(next.placement.attendancePattern).toEqual(["mon", "wed", "fri"]);
    expect(next.project).toEqual({ title: "Smart Logbook", supervisorName: "Dr. Bello" });
  });

  it("keeps the cached values when server fields are blank", () => {
    const base = {
      ...emptyState,
      profile: { fullName: "Keep Me", school: "Old School", department: "Old Dept" },
    };

    const next = applyProfile(base, { fullName: "", school: "", department: "", projects: [] });

    expect(next.profile).toEqual({
      fullName: "Keep Me",
      school: "Old School",
      department: "Old Dept",
    });
  });

  it("falls back to the existing module choice for an unknown value", () => {
    const next = applyProfile({ ...emptyState, moduleChoice: "logbook" }, { moduleChoice: "WEIRD" });
    expect(next.moduleChoice).toBe("logbook");
  });
});
