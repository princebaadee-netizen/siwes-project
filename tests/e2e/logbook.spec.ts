import { expect, test } from "@playwright/test";
import { signIn, stubApi } from "./fake-api";

/**
 * The day-by-day logbook: the flow a student uses every day of the
 * placement. The API is stubbed but stateful, so a saved entry really shows
 * up in the list the way it does against the real backend.
 */

const OPEN_DAY = {
  date: "2026-01-05",
  confirmedAttended: true,
  hasLogbookEntry: false,
  isPublicHoliday: false,
};

test.describe("the logbook", () => {
  test("records an entry for an attendance day", async ({ page }) => {
    await signIn(page);
    const log = await stubApi(page, { calendarDays: [OPEN_DAY] });

    await page.goto("/dashboard/logbook");

    await page.getByLabel("Date").fill("2026-01-05");    await page
      .getByPlaceholder(/rough notes are fine/i)
      .fill("Fixed the login page on the staff portal.");
    await page.getByRole("button", { name: "Save entry" }).click();

    await expect(page.getByText("Fixed the login page on the staff portal.")).toBeVisible();
    await expect(page.getByText("Entries (1)")).toBeVisible();

    const created = log.calls.find((c) => c.method === "POST" && c.path === "/logbook");
    expect(created?.body).toMatchObject({ date: "2026-01-05" });
  });

  test("refuses a date that is not an attendance day", async ({ page }) => {
    await signIn(page);
    await stubApi(page, { calendarDays: [OPEN_DAY] });

    await page.goto("/dashboard/logbook");

    await page.getByLabel("Date").fill("2026-01-06");

    await expect(
      page.getByText(/isn't a confirmed attendance day for your placement/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save entry" })).toBeDisabled();
  });

  test("keeps an existing entry visible", async ({ page }) => {
    await signIn(page);
    await stubApi(page, {
      calendarDays: [{ ...OPEN_DAY, hasLogbookEntry: true }],
      logbookEntries: [
        {
          id: "e1",
          activity: "Wrote the inventory tracker in Python.",
          evidenceUrl: null,
          status: "DRAFT",
          calendarDay: { date: "2026-01-05" },
        },
      ],
    });

    await page.goto("/dashboard/logbook");

    await expect(page.getByText("Wrote the inventory tracker in Python.")).toBeVisible();
    await expect(page.getByText("Entries (1)")).toBeVisible();
  });
});
