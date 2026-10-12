"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { Card, Button, FieldLabel, TextInput } from "@/components/ui";
import { PenLine, Sparkles, Loader2, Trash2, CalendarCheck, Check, Printer, Pencil } from "lucide-react";
import { api, clearToken, getToken, formatNaira } from "@/lib/api";

interface CalendarDay {
  date: string;
  isAttendanceDay: boolean;
  isPublicHoliday: boolean;
  holidayName: string | null;
  confirmedAttended: boolean | null;
  hasLogbookEntry: boolean;
}

type EntryStatus = "DRAFT" | "REVIEWED" | "FINALIZED";

interface LogbookEntry {
  id: string;
  activity: string;
  evidenceUrl: string | null;
  status: EntryStatus;
  calendarDay: { date: string };
}

const STATUS_ORDER: EntryStatus[] = ["DRAFT", "REVIEWED", "FINALIZED"];
const STATUS_LABELS: Record<EntryStatus, string> = {
  DRAFT: "Draft",
  REVIEWED: "Reviewed",
  FINALIZED: "Finalized",
};

function prettyDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function LogbookPage() {
  const { state, hydrated } = useAppStore();
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "bulk">("manual");
  const [bulkText, setBulkText] = useState("");
  const [entries, setEntries] = useState<LogbookEntry[]>([]);
  const [openDays, setOpenDays] = useState<CalendarDay[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [activity, setActivity] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingHolidays, setPendingHolidays] = useState<CalendarDay[]>([]);
  const [workedHolidays, setWorkedHolidays] = useState<Record<string, boolean>>({});
  const [savingHolidays, setSavingHolidays] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editActivity, setEditActivity] = useState("");
  const [editEvidence, setEditEvidence] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [aiDraft, setAiDraft] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [trial, setTrial] = useState<{
    total: number;
    used: number;
    remaining: number;
    spent: boolean;
  } | null>(null);
  const [hasItPass, setHasItPass] = useState(false);
  const [prices, setPrices] = useState({
    IT_SIWES_PASS: 10_000,
    PROJECT_PASS: 20_000,
    BUNDLE: 27_000,
  });

  const handleAuthFailure = useCallback(
    (err: any) => {
      if (err?.status === 401) {
        clearToken();
        router.replace("/login");
        return true;
      }
      return false;
    },
    [router]
  );

  const load = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [entryList, calendar, livePrices, placement, purchases] = await Promise.all([
        api.listLogbookEntries(),
        api.getCalendar(),
        api.getPrices().catch(() => null),
        api.getMyPlacement().catch(() => null),
        api.listPurchases().catch(() => [] as any[]),
      ]);
      setEntries(entryList);
      if (livePrices) setPrices(livePrices);
      if (placement?.trial) setTrial(placement.trial);
      // A successful bundle grants the IT/SIWES Pass too.
      setHasItPass(
        (purchases as any[]).some(
          (p) =>
            p.status === "SUCCESSFUL" &&
            (p.productType === "IT_SIWES_PASS" || p.productType === "BUNDLE")
        )
      );
      // The backend is the only place that knows which days are real
      // attendance days, so the picker is built from its calendar rather than
      // guessed from a date input.
      setOpenDays(
        calendar.days.filter((d) => d.confirmedAttended === true && !d.hasLogbookEntry)
      );
      // Attendance days that land on a public holiday start unconfirmed. Until
      // the student answers the single gating question they hold a null, which
      // bars them from the day picker and leaves the calendar unsettled.
      const holidayDays = (calendar.days as CalendarDay[]).filter(
        (d) => d.isPublicHoliday && d.confirmedAttended === null
      );
      setPendingHolidays(holidayDays);
      setWorkedHolidays((prev) => {
        const next: Record<string, boolean> = {};
        for (const d of holidayDays) next[d.date] = prev[d.date] ?? false;
        return next;
      });
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not load your logbook.");
      }
    } finally {
      setLoading(false);
    }
  }, [handleAuthFailure]);

  useEffect(() => {
    if (hydrated) load();
  }, [hydrated, load]);

  async function saveEntry() {
    if (!selectedDate || !activity.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.createLogbookEntry({
        date: selectedDate,
        activity: activity.trim(),
        evidenceUrl: evidenceUrl.trim() || undefined,
        source: aiDraft ? "AI_SINGLE_DAY" : undefined,
      });
      setEntries((prev) =>
        [...prev, created].sort((a, b) => a.calendarDay.date.localeCompare(b.calendarDay.date))
      );
      setOpenDays((prev) => prev.filter((d) => d.date !== created.calendarDay.date));
      setActivity("");
      setEvidenceUrl("");
      setSelectedDate("");
      setAiDraft(false);
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not save that entry.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function polishEntry() {
    if (!selectedDate || !activity.trim()) return;
    setPolishing(true);
    setError(null);
    try {
      const { activity: polished } = await api.polishLogbookEntry(
        selectedDate,
        activity.trim()
      );
      setActivity(polished);
      setAiDraft(true);
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not polish that entry.");
      }
    } finally {
      setPolishing(false);
    }
  }

  async function removeEntry(id: string) {
    setError(null);
    try {
      await api.deleteLogbookEntry(id);
      const removed = entries.find((e) => e.id === id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      // Deleting an entry reopens that day, so the calendar has to be refetched
      // rather than patched locally - the server owns what counts as open.
      if (removed) {
        const calendar = await api.getCalendar();
        setOpenDays(
          calendar.days.filter((d) => d.confirmedAttended === true && !d.hasLogbookEntry)
        );
      }
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not delete that entry.");
      }
    }
  }

  async function setEntryStatus(id: string, status: EntryStatus) {
    const previous = entries.find((e) => e.id === id)?.status;
    if (!previous || previous === status) return;
    setUpdatingId(id);
    setError(null);
    // Flip the pill straight away so the tap feels instant, then reconcile with
    // the server and roll back if it rejects the change.
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
    try {
      await api.updateLogbookEntry(id, { status });
    } catch (err: any) {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: previous } : e))
      );
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not update that entry's status.");
      }
    } finally {
      setUpdatingId(null);
    }
  }

  function startEdit(entry: LogbookEntry) {
    setEditingId(entry.id);
    setEditActivity(entry.activity);
    setEditEvidence(entry.evidenceUrl ?? "");
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditActivity("");
    setEditEvidence("");
  }

  async function saveEdit(id: string) {
    if (!editActivity.trim()) return;
    setSavingEdit(true);
    setError(null);
    try {
      const updated = await api.updateLogbookEntry(id, {
        activity: editActivity.trim(),
        evidenceUrl: editEvidence.trim(),
      });
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...updated } : e)));
      cancelEdit();
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not save your changes.");
      }
    } finally {
      setSavingEdit(false);
    }
  }

  async function saveHolidayAnswers() {
    setSavingHolidays(true);
    setError(null);
    try {
      const worked = Object.entries(workedHolidays)
        .filter(([, v]) => v)
        .map(([date]) => date);
      await api.confirmHolidays(worked);
      // The server flips worked days to confirmed (and unlocks them in the
      // picker) and everything else to not-attended, so refetch rather than
      // patching the two lists locally.
      await load();
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not save your holiday answers.");
      }
    } finally {
      setSavingHolidays(false);
    }
  }

  async function runBulkFillup() {
    if (!bulkText.trim()) return;
    setGenerating(true);
    setError(null);
    setBulkMessage(null);
    try {
      const result = await api.bulkFillup(bulkText.trim());
      // The generated entries land in the same calendar, so refetch to pick
      // them up (and to shrink the open-day list).
      await load();
      setBulkText("");
      if (result.message) {
        setBulkMessage(result.message);
      } else {
        const trialNote = result.trial ? " You're on the free 7-day trial." : "";
        const lockedNote = result.lockedRemaining
          ? ` ${result.lockedRemaining} more day(s) need the IT/SIWES Pass.`
          : "";
        setBulkMessage(
          `Drafted ${result.created} ${result.created === 1 ? "entry" : "entries"}.${trialNote}${lockedNote}`
        );
      }
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not generate your logbook.");
      }
    } finally {
      setGenerating(false);
    }
  }

  if (!hydrated) return null;

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="mb-1 font-slab text-2xl font-semibold text-ink">IT/SIWES Logbook</h1>
          <p className="text-ink/60">
            {state.placement.companyName
              ? `${state.placement.companyName} · ${state.placement.startDate || "—"} → ${state.placement.endDate || "—"}`
              : "Set up your placement in Account to get started."}
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()} className="shrink-0">
          <Printer size={15} /> Print / Save as PDF
        </Button>
      </div>

      <div className="mb-8 hidden print:block">
        <h1 className="font-slab text-2xl font-semibold text-ink">IT/SIWES Logbook</h1>
        <div className="mt-4 space-y-1 font-mono text-sm text-ink/80">
          <p>Name: {state.profile.fullName || "—"}</p>
          <p>School: {state.profile.school || "—"}</p>
          <p>Department: {state.profile.department || "—"}</p>
          <p>Company: {state.placement.companyName || "—"}</p>
          <p>
            Placement: {state.placement.startDate || "—"} → {state.placement.endDate || "—"}
          </p>
        </div>
      </div>

      {pendingHolidays.length > 0 && (
        <Card className="mb-6 print:hidden">
          <div className="mb-1 flex items-center gap-2 text-forest">
            <CalendarCheck size={18} />
            <h2 className="font-medium">Did you work on these public holidays?</h2>
          </div>
          <p className="mb-4 text-sm text-ink/60">
            These days are on your attendance pattern but fall on federal public
            holidays. Tick any you actually worked — the rest are marked as not attended.
          </p>
          <div className="space-y-2">
            {pendingHolidays.map((d) => {
              const worked = !!workedHolidays[d.date];
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() =>
                    setWorkedHolidays((prev) => ({ ...prev, [d.date]: !prev[d.date] }))
                  }
                  className={`focus-ring flex w-full items-center gap-3 rounded-md border px-3.5 py-3 text-left transition-colors ${
                    worked ? "border-forest bg-forest/5" : "border-line bg-white hover:border-forest/40"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      worked ? "border-forest bg-forest text-paper" : "border-line"
                    }`}
                  >
                    {worked && <Check size={13} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{prettyDate(d.date)}</span>
                    <span className="block text-xs text-ink/50">{d.holidayName ?? "Public holiday"}</span>
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-xs text-ink/40">
                    {worked ? "worked" : "didn't work"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={saveHolidayAnswers} disabled={savingHolidays}>
              {savingHolidays && <Loader2 size={15} className="animate-spin" />}
              {savingHolidays ? "Saving..." : "Save holiday answers"}
            </Button>
          </div>
        </Card>
      )}

      {trial && !hasItPass && (
        <div className="mb-6 print:hidden">
          {trial.spent ? (
            <p className="rounded-md bg-gold/15 px-4 py-3 text-sm text-gold-dark">
              Your free AI week is used up. New AI drafts need the IT/SIWES Pass (
              {formatNaira(prices.IT_SIWES_PASS)}) — buy it from Account.
            </p>
          ) : (
            <p className="rounded-md bg-forest/10 px-4 py-3 text-sm text-forest">
              Free AI trial: {trial.remaining} of {trial.total} day
              {trial.remaining === 1 ? "" : "s"} left.
            </p>
          )}
        </div>
      )}

      <div className="mb-6 inline-flex rounded-md border border-line bg-white p-1 print:hidden">
        <button
          onClick={() => setMode("manual")}
          className={`focus-ring flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-medium transition-colors ${
            mode === "manual" ? "bg-forest text-paper" : "text-ink/60"
          }`}
        >
          <PenLine size={15} /> Fill day by day
        </button>
        <button
          onClick={() => setMode("bulk")}
          className={`focus-ring flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-medium transition-colors ${
            mode === "bulk" ? "bg-forest text-paper" : "text-ink/60"
          }`}
        >
          <Sparkles size={15} /> Describe the whole IT
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-rust/10 px-4 py-3 text-sm text-rust print:hidden">{error}</p>
      )}

      {mode === "manual" && (
        <>
          <Card className="print:hidden">
            <FieldLabel>Log an attendance day</FieldLabel>
            <div className="space-y-4">
              <div>
                <FieldLabel>Date</FieldLabel>
                {loading ? (
                  <p className="flex items-center gap-2 py-2.5 text-sm text-ink/50">
                    <Loader2 size={15} className="animate-spin" /> Loading your calendar...
                  </p>
                ) : openDays.length === 0 ? (
                  <p className="rounded-md bg-line/40 px-3.5 py-2.5 text-sm text-ink/50">
                    Every attendance day already has an entry, or none are confirmed yet.
                  </p>
                ) : (
                  <TextInput
                    type="date"
                    value={selectedDate}
                    min={openDays[0].date}
                    max={openDays[openDays.length - 1].date}
                    onChange={(e) => {
                      const value = e.target.value;
                      // The list is the source of truth: a date typed outside
                      // the attendance pattern is rejected before it reaches the
                      // API, so the student gets an instant message instead of a
                      // round-trip failure.
                      setSelectedDate(openDays.some((d) => d.date === value) ? value : "");
                      setAiDraft(false);
                      if (value && !openDays.some((d) => d.date === value)) {
                        setError("That date isn't a confirmed attendance day for your placement.");
                      }
                    }}
                    list="attendance-days"
                  />
                )}
                <datalist id="attendance-days">
                  {openDays.map((d) => (
                    <option key={d.date} value={d.date}>
                      {d.isPublicHoliday ? d.holidayName ?? "Public holiday" : "Attendance day"}
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel>Today's activity</FieldLabel>
                  <button
                    type="button"
                    onClick={polishEntry}
                    disabled={polishing || saving || !selectedDate || !activity.trim()}
                    className="focus-ring inline-flex items-center gap-1.5 text-xs font-medium text-forest underline decoration-forest/30 underline-offset-4 disabled:opacity-40"
                  >
                    {polishing ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Sparkles size={13} />
                    )}
                    {polishing ? "Polishing..." : "Polish with AI"}
                  </button>
                </div>
                <textarea
                  className="focus-ring w-full rounded-md border border-line bg-white p-3.5 text-ink placeholder:text-ink/35"
                  rows={4}
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  placeholder="Rough notes are fine — jot down what you did, then let AI polish it."
                />
                {aiDraft && (
                  <p className="mt-1 text-xs text-forest">
                    Polished by AI — edit it if you like, then save.
                  </p>
                )}
              </div>
              <div>
                <FieldLabel>Evidence link (optional)</FieldLabel>
                <TextInput
                  type="url"
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button disabled={saving || loading || !selectedDate || !activity.trim()} onClick={saveEntry}>
                {saving && <Loader2 size={15} className="animate-spin" />}
                {saving ? "Saving..." : "Save entry"}
              </Button>
            </div>
          </Card>

          <h2 className="mb-3 mt-8 font-slab text-lg font-semibold text-ink">
            Entries ({entries.length})
          </h2>
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-ink/50">
              <Loader2 size={15} className="animate-spin" /> Loading your entries...
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-ink/50">No entries yet.</p>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <Card key={entry.id} className="py-4">
                  {editingId === entry.id ? (
                    <div className="space-y-4">
                      <p className="font-mono text-xs text-ink/40">
                        {prettyDate(entry.calendarDay.date)}
                      </p>
                      <div>
                        <FieldLabel>Activity</FieldLabel>
                        <textarea
                          rows={4}
                          value={editActivity}
                          onChange={(e) => setEditActivity(e.target.value)}
                          className="focus-ring w-full rounded-md border border-line bg-white p-3.5 text-ink"
                        />
                      </div>
                      <div>
                        <FieldLabel>Evidence link (optional)</FieldLabel>
                        <TextInput
                          type="url"
                          value={editEvidence}
                          onChange={(e) => setEditEvidence(e.target.value)}
                          placeholder="https://…"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={cancelEdit} disabled={savingEdit}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() => saveEdit(entry.id)}
                          disabled={savingEdit || !editActivity.trim()}
                        >
                          {savingEdit && <Loader2 size={15} className="animate-spin" />}
                          {savingEdit ? "Saving..." : "Save changes"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-ink/40">{prettyDate(entry.calendarDay.date)}</p>
                        <p className="mt-1 text-ink">{entry.activity}</p>
                        {entry.evidenceUrl && (
                          <a
                            href={entry.evidenceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block truncate font-mono text-xs text-forest underline underline-offset-2"
                          >
                            {entry.evidenceUrl}
                          </a>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <span className="hidden font-mono text-xs text-ink/40 print:inline">
                            {STATUS_LABELS[entry.status]}
                          </span>
                          <div className="inline-flex items-center rounded-md border border-line p-0.5 print:hidden">
                            {STATUS_ORDER.map((s) => (
                              <button
                                key={s}
                                type="button"
                                disabled={updatingId === entry.id || entry.status === s}
                                onClick={() => setEntryStatus(entry.id, s)}
                                className={`focus-ring rounded-sm px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-default ${
                                  entry.status === s
                                    ? "bg-forest text-paper"
                                    : "text-ink/50 hover:text-forest"
                                }`}
                              >
                                {STATUS_LABELS[s]}
                              </button>
                            ))}
                            {updatingId === entry.id && (
                              <Loader2 size={13} className="mx-1.5 my-auto animate-spin text-ink/40" />
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-center gap-1 print:hidden">
                        <button
                          onClick={() => startEdit(entry)}
                          aria-label="Edit entry"
                          className="focus-ring rounded-md p-1.5 text-ink/40 transition-colors hover:bg-forest/10 hover:text-forest"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => removeEntry(entry.id)}
                          aria-label="Delete entry"
                          className="focus-ring rounded-md p-1.5 text-ink/40 transition-colors hover:bg-rust/10 hover:text-rust"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {mode === "bulk" && (
        <Card className="print:hidden">
          <FieldLabel>Tell us about your IT experience</FieldLabel>
          <p className="mb-3 text-sm text-ink/50">
            e.g. &quot;I did IT at Zenith Bank from 18 June to 18 September. I learnt HTML, CSS and JavaScript,
            and helped maintain the internal staff portal.&quot;
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="focus-ring w-full rounded-md border border-line bg-white p-3.5 text-ink placeholder:text-ink/35"
            rows={5}
            placeholder="Describe your whole IT experience in your own words..."
          />
          {bulkMessage && (
            <p className="mt-4 rounded-md bg-forest/10 px-4 py-3 text-sm text-forest">
              {bulkMessage}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="font-mono text-xs text-ink/40">
              {hasItPass
                ? "IT/SIWES Pass active — draft as many days as you like."
                : trial?.spent
                  ? `Free AI week used up · the IT/SIWES Pass (${formatNaira(prices.IT_SIWES_PASS)}) unlocks the rest.`
                  : `Free trial: ${trial?.remaining ?? 7} of ${trial?.total ?? 7} AI days left · rest needs the IT/SIWES Pass (${formatNaira(prices.IT_SIWES_PASS)}).`}
            </p>
            <Button onClick={runBulkFillup} disabled={generating || !bulkText.trim()}>
              {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {generating ? "Drafting..." : "Generate logbook"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
