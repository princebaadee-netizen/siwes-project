// Same-origin: Next.js proxies /api/* to the Nest backend (see next.config.js).
// Nothing to configure here, and no CORS to keep in sync.
const API_URL = "/api";
const TOKEN_KEY = "siwes-auth-token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    // Network-level failure: backend down, blocked by CORS, or the request
    // took too long. "Failed to fetch" is not something a student can act on.
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    // Never surface a raw status phrase like "Internal Server Error" — it hides
    // the actual cause and is indistinguishable from a genuinely unrelated fault.
    const message =
      body?.message ??
      (res.status >= 500
        ? "The server had a problem handling that request. Please try again."
        : "Request failed. Please try again.");
    throw new ApiError(Array.isArray(message) ? message.join(", ") : message, res.status);
  }
  return body as T;
}

export interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; fullName: string; emailVerified: boolean };
}

export type TopicSource = "MANUAL" | "BANK" | "AI_SUGGESTED";

export interface ProjectTopic {
  id: string;
  title: string;
  field: string;
  description: string | null;
}

export interface SuggestedTopic {
  title: string;
  description: string;
}

export interface PublicHoliday {
  id: string;
  date: string;
  name: string;
  year: number;
}

export type GenerationType =
  | "EXTRACTION"
  | "BULK_LOGBOOK"
  | "CHAPTER_DRAFT"
  | "SINGLE_DAY_POLISH"
  | "TOPIC_SUGGESTION"
  | "REPORT_SECTION";

export interface UsageEntry {
  id: string;
  type: GenerationType;
  estimatedTokens: number | null;
  estimatedCostKobo: number | null;
  createdAt: string;
}

export interface UsageSummary {
  totals: { generations: number; tokens: number; costKobo: number };
  byType: { type: GenerationType; generations: number; tokens: number; costKobo: number }[];
  recent: UsageEntry[];
  pricing: { inputKoboPerMtok: number; outputKoboPerMtok: number };
}

export type ReportSectionKind =
  | "ABSTRACT"
  | "DEDICATION"
  | "ACKNOWLEDGMENT"
  | "INTRODUCTION"
  | "INDUSTRIAL_EXPERIENCE"
  | "SKILLS_ACQUIRED"
  | "DISCUSSION_CONCLUSION";

export type ReportSectionStatus = "DRAFT" | "REVIEWED" | "FINALIZED";

export interface ReportSectionView {
  kind: ReportSectionKind;
  title: string;
  chapter: number | null;
  content: string | null;
  status: ReportSectionStatus;
  regenerationsUsed: number;
}

export interface SiwesReport {
  id: string;
  userId: string;
  institutionName: string | null;
  institutionAddress: string | null;
  faculty: string | null;
  department: string | null;
  programme: string | null;
  level: string | null;
  matricNumber: string | null;
  schoolSupervisor: string | null;
  companySupervisor: string | null;
  durationLabel: string | null;
  submissionDate: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  dedicationNames: string[];
  status: "DRAFT" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
}

export interface ReportDefaults {
  fullName: string;
  school: string;
  department: string;
  companyName: string;
  companyAddress: string;
  industrySector: string;
  startDate: string | null;
  endDate: string | null;
  durationLabel: string | null;
  projectTitle: string | null;
}

export interface ReportPayload {
  report: SiwesReport;
  sections: ReportSectionView[];
  canGenerate: boolean;
  logbookCount: number;
  defaults: ReportDefaults;
}

export type ReportUpdate = Partial<
  Pick<
    SiwesReport,
    | "institutionName"
    | "institutionAddress"
    | "faculty"
    | "department"
    | "programme"
    | "level"
    | "matricNumber"
    | "schoolSupervisor"
    | "companySupervisor"
    | "durationLabel"
    | "submissionDate"
    | "dedicationNames"
  >
>;

export interface ReportGenerationResult extends ReportPayload {
  generated: ReportSectionKind[];
  failed: ReportSectionKind[];
}

/**
 * POSTs a multipart body. Unlike `request`, it must NOT set
 * Content-Type — the browser adds the multipart boundary itself.
 */
async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = body?.message ?? "Upload failed. Please try again.";
    throw new ApiError(Array.isArray(message) ? message.join(", ") : message, res.status);
  }
  return body as T;
}

/** Fetches a binary export with the auth header, then saves it via a blob. */
async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  if (!res.ok) {
    throw new ApiError("Could not download your report. Please try again.", res.status);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const filename = match?.[1] ?? fallbackName;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  signup: (fullName: string, email: string, password: string) =>
    request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ fullName, email, password }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string; devResetUrl?: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  verifyEmail: (token: string) =>
    request<{ ok: boolean }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  resendVerification: () =>
    request<{ ok: boolean; emailVerified: boolean }>("/auth/resend-verification", {
      method: "POST",
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  getMe: () => request<any>("/users/me"),

  updateMe: (data: { fullName?: string; school?: string; department?: string; moduleChoice?: "LOGBOOK" | "PROJECT" | "BOTH" }) =>
    request<any>("/users/me", { method: "PATCH", body: JSON.stringify(data) }),

  createPlacement: (data: {
    companyName: string;
    companyAddress?: string;
    industrySector?: string;
    startDate: string;
    endDate: string;
    daysPerWeek: number;
    attendancePattern: string[];
  }) => request<any>("/it-placement", { method: "POST", body: JSON.stringify(data) }),

  getMyPlacement: () => request<any>("/it-placement/me"),

  getCalendar: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<{ placementId: string; days: any[] }>(`/it-placement/calendar${suffix}`);
  },

  confirmHolidays: (confirmedDates: string[]) =>
    request<any>("/it-placement/confirm-holidays", {
      method: "POST",
      body: JSON.stringify({ confirmedDates }),
    }),

  listLogbookEntries: () => request<any[]>("/logbook"),

  createLogbookEntry: (data: {
    date: string;
    activity: string;
    evidenceUrl?: string;
    source?: "MANUAL" | "AI_SINGLE_DAY";
  }) => request<any>("/logbook", { method: "POST", body: JSON.stringify(data) }),

  polishLogbookEntry: (date: string, notes: string) =>
    request<{ activity: string }>("/logbook/polish", {
      method: "POST",
      body: JSON.stringify({ date, notes }),
    }),

  updateLogbookEntry: (id: string, data: { activity?: string; evidenceUrl?: string; status?: string }) =>
    request<any>(`/logbook/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteLogbookEntry: (id: string) => request<any>(`/logbook/${id}`, { method: "DELETE" }),

  bulkFillup: (description: string) =>
    request<{ created: number; lockedRemaining: number; trial: boolean; message?: string }>(
      "/logbook/bulk",
      { method: "POST", body: JSON.stringify({ description }) }
    ),

  createProject: (data: { title: string; supervisorName?: string; topicSource?: TopicSource }) =>
    request<any>("/projects", { method: "POST", body: JSON.stringify(data) }),

  listTopics: (params?: { field?: string; q?: string }) => {
    const query = new URLSearchParams();
    if (params?.field) query.set("field", params.field);
    if (params?.q) query.set("q", params.q);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<ProjectTopic[]>(`/topics${suffix}`);
  },

  listTopicFields: () => request<string[]>("/topics/fields"),

  adminListTopics: () => request<ProjectTopic[]>("/admin/topics"),

  createTopic: (data: { title: string; field: string; description?: string }) =>
    request<ProjectTopic>("/admin/topics", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateTopic: (
    id: string,
    data: { title?: string; field?: string; description?: string },
  ) =>
    request<ProjectTopic>(`/admin/topics/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteTopic: (id: string) =>
    request<{ ok: boolean }>(`/admin/topics/${id}`, { method: "DELETE" }),

  adminListHolidays: () => request<PublicHoliday[]>("/admin/holidays"),

  createHoliday: (data: { date: string; name: string }) =>
    request<PublicHoliday>("/admin/holidays", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateHoliday: (id: string, data: { date?: string; name?: string }) =>
    request<PublicHoliday>(`/admin/holidays/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteHoliday: (id: string) =>
    request<{ ok: boolean }>(`/admin/holidays/${id}`, { method: "DELETE" }),

  suggestTopics: (params?: { field?: string; interests?: string }) =>
    request<{ field: string; topics: SuggestedTopic[] }>("/projects/suggest-topics", {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    }),

  getMyProjects: () => request<any[]>("/projects"),

  getProject: (id: string) => request<any>(`/projects/${id}`),

  markProjectComplete: (id: string) =>
    request<any>(`/projects/${id}/mark-complete`, { method: "POST" }),

  reopenProject: (id: string) => request<any>(`/projects/${id}/reopen`, { method: "POST" }),

  draftChapter: (projectId: string, chapterNumber: number, rawInputText: string) =>
    request<any>(`/projects/${projectId}/chapters/${chapterNumber}/draft`, {
      method: "POST",
      body: JSON.stringify({ rawInputText }),
    }),

  regenerateChapter: (projectId: string, chapterNumber: number, rawInputText?: string) =>
    request<any>(`/projects/${projectId}/chapters/${chapterNumber}/regenerate`, {
      method: "POST",
      body: JSON.stringify({ rawInputText }),
    }),

  updateChapterStatus: (projectId: string, chapterNumber: number, status: string) =>
    request<any>(`/projects/${projectId}/chapters/${chapterNumber}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  listReferences: (projectId: string) => request<any[]>(`/projects/${projectId}/references`),

  addReference: (
    projectId: string,
    data: { citationText: string; sourceType: string; doiOrIsbnOrLink?: string }
  ) =>
    request<any>(`/projects/${projectId}/references`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteReference: (projectId: string, referenceId: string) =>
    request<any>(`/projects/${projectId}/references/${referenceId}`, { method: "DELETE" }),

  verifyReference: (projectId: string, referenceId: string) =>
    request<any>(`/projects/${projectId}/references/${referenceId}/verify`, { method: "POST" }),

  initializePayment: (productType: string) =>
    request<{
      devMode: boolean;
      status: string;
      reference: string;
      authorizationUrl?: string;
      accessCode?: string;
    }>("/payments/initialize", { method: "POST", body: JSON.stringify({ productType }) }),

  verifyPayment: (reference: string) => request<any>(`/payments/verify/${reference}`),

  listPurchases: () => request<any[]>("/payments"),

  getPrices: () =>
    request<{ IT_SIWES_PASS: number; PROJECT_PASS: number; BUNDLE: number }>("/payments/prices"),

  getUsage: (limit?: number) =>
    request<UsageSummary>(`/usage${limit ? `?limit=${limit}` : ""}`),

  getReport: () => request<ReportPayload>("/report"),

  markReportComplete: () =>
    request<{ report: SiwesReport; sections: ReportSectionView[] }>("/report/mark-complete", {
      method: "POST",
    }),

  reopenReport: () =>
    request<{ report: SiwesReport; sections: ReportSectionView[] }>("/report/reopen", {
      method: "POST",
    }),

  updateReport: (data: ReportUpdate) =>
    request<{ report: SiwesReport; sections: ReportSectionView[] }>("/report", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  updateReportSection: (
    kind: ReportSectionKind,
    data: { content?: string; status?: ReportSectionStatus }
  ) =>
    request<ReportSectionView>(`/report/sections/${kind}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  generateReportSection: (kind: ReportSectionKind, notes?: string) =>
    request<ReportSectionView>(`/report/sections/${kind}/generate`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),

  regenerateReportSection: (kind: ReportSectionKind, notes?: string) =>
    request<ReportSectionView>(`/report/sections/${kind}/regenerate`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),

  generateAllReport: () =>
    request<ReportGenerationResult>("/report/generate-all", { method: "POST" }),

  uploadReportImage: (field: "logo" | "cover", file: File) => {
    const form = new FormData();
    form.append("file", file);
    return requestForm<{ report: SiwesReport; sections: ReportSectionView[] }>(
      `/report/${field === "logo" ? "logo" : "cover-image"}`,
      form
    );
  },

  downloadReportPdf: () => downloadFile("/report/export.pdf", "siwes-report.pdf"),

  downloadReportDocx: () => downloadFile("/report/export.docx", "siwes-report.docx"),
};

/** Prices come from the backend in naira; render them as ₦10,000. */
export function formatNaira(naira: number): string {
  return `₦${Math.round(naira).toLocaleString("en-NG")}`;
}

/** AI spend is stored and returned in kobo (₦1 = 100 kobo). */
export function formatKobo(kobo: number): string {
  return formatNaira(kobo / 100);
}

export { ApiError };
