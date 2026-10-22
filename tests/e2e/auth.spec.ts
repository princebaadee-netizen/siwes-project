import { expect, test } from "@playwright/test";
import { signIn, stubApi } from "./fake-api";

test.describe("signing in", () => {
  test("sends a signed-out visitor to the login page", async ({ page }) => {
    await stubApi(page);

    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /sign in to your account/i })).toBeVisible();
  });

  test("signs in and lands on the dashboard", async ({ page }) => {
    const log = await stubApi(page);

    await page.goto("/login");
    await page.getByPlaceholder("you@example.com").fill("ada@example.com");
    await page.getByPlaceholder("Your password").fill("hunter2hunter2");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    expect(log.calls.some((c) => c.path === "/auth/login")).toBe(true);
  });

  test("shows the server's message when the login is refused", async ({ page }) => {
    await page.route("**/api/**", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/auth/login")) {
        return route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ message: "Email or password is wrong." }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/login");
    await page.getByPlaceholder("you@example.com").fill("ada@example.com");
    await page.getByPlaceholder("Your password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Email or password is wrong.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("the dashboard shell", () => {
  test("keeps a signed-in student on the dashboard", async ({ page }) => {
    await signIn(page);
    await stubApi(page);

    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
  });
});
