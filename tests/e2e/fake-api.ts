import type { Page, Route } from "@playwright/test";

/**
 * An in-browser stand-in for the NestJS API.
 *
 * The browser tests drive the real Next.js app but talk to this instead of a
 * server, which buys two things: the tests are deterministic (no AI calls, no
 * Postgres, no clock), and CI needs no database — a GitHub runner has no
 * Postgres instance to point the Prisma client at.
 *
 * Only the endpoints the tests actually exercise are modelled. Anything else
 * answers with a 404 that names the missing route, so an unmocked endpoint
 * shows up as a clear failure instead of an empty page.
 */

export const TOKEN_KEY = "siwes-auth-token";
export const ACCESS_TOKEN = "e2e-access-token";

export interface FakeAccount {
  emailVerified?: boolean;
  isAdmin?: boolean;
  fullName?: string;
  email?: string;
  purchases?: unknown[];
  projects?: unknown[];
  itPlacement?: unknown;
}

export interface FakeApiOptions {
  account?: FakeAccount;
  logbookEntries?: LogbookEntry[];
  calendarDays?: CalendarDay[];
  prices?: Record<string, number>;
}

interface LogbookEntry {
  id: string;
  activity: string;
  evidenceUrl?: string | null;
  status: string;
  calendarDay: { date: string; isPublicHoliday?: boolean; holidayName?: string | null };
}

interface CalendarDay {
  date: string;
  confirmedAttended?: boolean | null;
  hasLogbookEntry?: boolean;
  isPublicHoliday?: boolean;
  holidayName?: string | null;
}

const DEFAULT_PRICES = { IT_SIWES_PASS: 10000, PROJECT_PASS: 20000, BUNDLE: 27000 };

/**
 * Records every call the page made, so a test can assert on the requests the
 * UI produced (for example: that the resend button really called the API).
 */
export interface CallLog {
  calls: { method: string; path: string; body: unknown }[];
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export function reportPayload(logbookCount: number) {
  return {
    report: {
      id: "r1",
      institutionName: "",
      institutionAddress: "",
      faculty: "",
      department: "",
      programme: "",
      level: "",
      matricNumber: "",
      schoolSupervisor: "",
      companySupervisor: "",
      durationLabel: "",
      submissionDate: null,
      logoUrl: null,
      coverImageUrl: null,
      dedicationNames: [],
      status: "DRAFT",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    sections: [],
    canGenerate: true,
    logbookCount,
    defaults: {
      fullName: "Ada Student",
      school: "University of Lagos",
      department: "Computer Science",
      companyName: "Kola Ventures",
      companyAddress: "Ikeja",
      industrySector: "Software",
      startDate: null,
      endDate: null,
      durationLabel: null,
      projectTitle: null,
    },
  };
}

/**
 * Installs the stub on a page and returns the call log.
 */
export async function stubApi(page: Page, options: FakeApiOptions = {}): Promise<CallLog> {
  const account = options.account ?? {};
  const emailVerified = account.emailVerified ?? true;
  const isAdmin = account.isAdmin ?? false;
  const prices = options.prices ?? DEFAULT_PRICES;
  const log: CallLog = { calls: [] };

  // Mutable, so a saved entry really shows up in the list the way it would
  // against the real backend.
  const entries: LogbookEntry[] = [...(options.logbookEntries ?? [])];
  const calendarDays: CalendarDay[] = [...(options.calendarDays ?? [])];
  let nextId = entries.length + 1;

  const me = {
    id: "u1",
    fullName: account.fullName ?? "Ada Student",
    email: account.email ?? "ada@example.com",
    emailVerified,
    school: "University of Lagos",
    department: "Computer Science",
    moduleChoice: "BOTH",
    itPlacement: account.itPlacement ?? null,
    projects: account.projects ?? [],
    purchases: account.purchases ?? [],
    isAdmin,
    // The server owns this decision: admins and dev-unlocked runs are exempt.
    emailGateActive: !isAdmin && !emailVerified,
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = request.method();

    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    log.calls.push({ method, path, body });

    if (method === "POST" && path === "/auth/login") {
      return json(route, {
        accessToken: ACCESS_TOKEN,
        user: { id: "u1", email: me.email, fullName: me.fullName, emailVerified },
      });
    }
    if (method === "POST" && path === "/auth/signup") {
      return json(route, {
        accessToken: ACCESS_TOKEN,
        user: { id: "u1", email: me.email, fullName: me.fullName, emailVerified },
      });
    }
    if (method === "POST" && path === "/auth/resend-verification") {
      return json(route, { ok: true, emailVerified });
    }
    if (method === "POST" && path === "/auth/verify-email") {
      return json(route, { ok: true, emailVerified: true });
    }
    if (method === "GET" && path === "/users/me") {
      return json(route, me);
    }
    if (method === "GET" && path === "/payments/prices") {
      return json(route, prices);
    }
    if (method === "GET" && path === "/payments") {
      return json(route, account.purchases ?? []);
    }
    if (method === "GET" && path === "/usage") {
      return json(route, null);
    }
    if (method === "GET" && path === "/logbook") {
      return json(route, entries);
    }
    if (method === "POST" && path === "/logbook") {
      const created: LogbookEntry = {
        id: `e${nextId++}`,
        activity: (body as { activity?: string })?.activity ?? "",
        evidenceUrl: (body as { evidenceUrl?: string })?.evidenceUrl ?? null,
        status: "DRAFT",
        calendarDay: { date: (body as { date?: string })?.date ?? "" },
      };
      entries.push(created);
      const day = calendarDays.find((d) => d.date === created.calendarDay.date);
      if (day) day.hasLogbookEntry = true;
      return json(route, created);
    }
    if (method === "GET" && path === "/it-placement/calendar") {
      return json(route, { placementId: "p1", days: calendarDays });
    }
    if (method === "GET" && path === "/it-placement/me") {
      return json(route, account.itPlacement ?? null);
    }
    if (method === "GET" && path === "/projects") {
      return json(route, account.projects ?? []);
    }
    if (method === "GET" && path === "/report") {
      return json(route, reportPayload(entries.length));
    }
    if (method === "GET" && path === "/topics/fields") {
      return json(route, []);
    }
    if (method === "GET" && path === "/topics") {
      return json(route, []);
    }
    if (method === "POST" && path === "/auth/resend-verification-fallback") {
      return json(route, { ok: true });
    }

    return json(route, { message: `No fake route for ${method} ${path}` }, 404);
  });

  return log;
}

/**
 * Puts a token in localStorage before the app boots, so the dashboard's
 * "do we have a token?" check passes on the very first render.
 */
export async function signIn(page: Page) {
  await page.addInitScript(
    ([key, token]) => {
      window.localStorage.setItem(key as string, token as string);
    },
    [TOKEN_KEY, ACCESS_TOKEN] as const,
  );
}
