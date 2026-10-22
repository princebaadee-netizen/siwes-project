import { expect, test } from "@playwright/test";
import { signIn, stubApi } from "./fake-api";

/**
 * The email gate: an unconfirmed address may sign in and use everything that
 * costs nothing, but the AI actions and the checkout are closed until the
 * address is confirmed. These tests drive the real UI — the button states and
 * the prompt — rather than the guard, which is covered by the backend tests.
 */

test.describe("the email-verification gate", () => {
  test("closes the AI actions and explains why", async ({ page }) => {
    await signIn(page);
    await stubApi(page, { account: { emailVerified: false } });

    await page.goto("/dashboard/logbook");

    await expect(page.getByText(/verify your email address to use AI drafting/i)).toBeVisible();

    // The single-day polish button is disabled.
    await expect(page.getByRole("button", { name: "Polish with AI" })).toBeDisabled();

    // So is the bulk fill-up.
    await page.getByRole("button", { name: /describe the whole IT/i }).click();
    await page
      .getByPlaceholder(/describe your whole IT experience/i)
      .fill("I did IT at Zenith Bank and learnt JavaScript.");
    await expect(page.getByRole("button", { name: "Generate logbook" })).toBeDisabled();
  });

  test("closes the checkout", async ({ page }) => {
    await signIn(page);
    await stubApi(page, { account: { emailVerified: false } });

    await page.goto("/dashboard/account");

    await expect(page.getByText(/verify your email address to buy a pass/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Buy" }).first()).toBeDisabled();
  });

  test("leaves everything open for a confirmed address", async ({ page }) => {
    await signIn(page);
    await stubApi(page, { account: { emailVerified: true } });

    await page.goto("/dashboard/logbook");

    await expect(page.getByText(/verify your email address/i)).toHaveCount(0);

    await page.getByRole("button", { name: /describe the whole IT/i }).click();
    await page
      .getByPlaceholder(/describe your whole IT experience/i)
      .fill("I did IT at Zenith Bank and learnt JavaScript.");
    await expect(page.getByRole("button", { name: "Generate logbook" })).toBeEnabled();
  });

  test("resends the verification email on request", async ({ page }) => {
    await signIn(page);
    const log = await stubApi(page, { account: { emailVerified: false } });

    await page.goto("/dashboard/logbook");

    await page.getByRole("button", { name: "Resend email" }).click();

    await expect(page.getByText(/verification email sent/i)).toBeVisible();
    expect(log.calls.some((c) => c.method === "POST" && c.path === "/auth/resend-verification")).toBe(true);
  });

  test("leaves an admin alone", async ({ page }) => {
    // The server decides: admins skip the gate, so the UI must not close
    // actions the backend would happily open.
    await signIn(page);
    await stubApi(page, { account: { emailVerified: false, isAdmin: true } });

    await page.goto("/dashboard/logbook");

    await expect(page.getByText(/verify your email address/i)).toHaveCount(0);
    await page.getByRole("button", { name: /describe the whole IT/i }).click();
    await page
      .getByPlaceholder(/describe your whole IT experience/i)
      .fill("I did IT at Zenith Bank and learnt JavaScript.");
    await expect(page.getByRole("button", { name: "Generate logbook" })).toBeEnabled();
  });
});
