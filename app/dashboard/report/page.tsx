"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BadgeCheck,
  Check,
  Download,
  FileText,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { Button, Card, FieldLabel, TextInput } from "@/components/ui";
import { VerifyEmailNotice } from "@/components/verify-email-notice";
import {
  api,
  clearToken,
  getToken,
  isEmailNotVerified,
  ReportPayload,
  ReportSectionKind,
  ReportSectionStatus,
  ReportSectionView,
} from "@/lib/api";

const STATUS_ORDER: ReportSectionStatus[] = ["DRAFT", "REVIEWED", "FINALIZED"];
const STATUS_LABELS: Record<ReportSectionStatus, string> = {
  DRAFT: "Draft",
  REVIEWED: "Reviewed",
  FINALIZED: "Finalized",
};

interface CoverForm {
  institutionName: string;
  institutionAddress: string;
  faculty: string;
  department: string;
  programme: string;
  level: string;
  matricNumber: string;
  schoolSupervisor: string;
  companySupervisor: string;
  durationLabel: string;
  submissionDate: string;
  dedicationNames: string;
}

const EMPTY_COVER: CoverForm = {
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
  submissionDate: "",
  dedicationNames: "",
};

function toDateInput(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export default function ReportPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [emailBlocked, setEmailBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState<CoverForm>(EMPTY_COVER);
  const [savingCover, setSavingCover] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);

  const [generatingAll, setGeneratingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string | null>(null);
  const [generatingKind, setGeneratingKind] = useState<ReportSectionKind | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const [editingKind, setEditingKind] = useState<ReportSectionKind | null>(null);
  const [editContent, setEditContent] = useState("");
  const [savingSection, setSavingSection] = useState<ReportSectionKind | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<ReportSectionKind | null>(null);

  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [savingReportStatus, setSavingReportStatus] = useState<"complete" | "reopen" | null>(null);

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
      const [data, me] = await Promise.all([
        api.getReport(),
        // The server decides whether the gate applies (admins and dev runs are
        // exempt), so trust its flag rather than guessing from emailVerified.
        api.getMe().catch(() => null),
      ]);
      setEmailBlocked(me?.emailGateActive === true);
      setPayload(data);
      setForm({
        institutionName: data.report.institutionName ?? data.defaults.school ?? "",
        institutionAddress: data.report.institutionAddress ?? "",
        faculty: data.report.faculty ?? "",
        department: data.report.department ?? data.defaults.department ?? "",
        programme: data.report.programme ?? "",
        level: data.report.level ?? "",
        matricNumber: data.report.matricNumber ?? "",
        schoolSupervisor: data.report.schoolSupervisor ?? "",
        companySupervisor: data.report.companySupervisor ?? "",
        durationLabel: data.report.durationLabel ?? data.defaults.durationLabel ?? "",
        submissionDate: toDateInput(data.report.submissionDate),
        dedicationNames: (data.report.dedicationNames ?? []).join(", "),
      });
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not load your report.");
      }
    } finally {
      setLoading(false);
    }
  }, [handleAuthFailure]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(message: string) {
    setSuccess(message);
    setError(null);
  }

  function setField<K extends keyof CoverForm>(key: K, value: CoverForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function replaceSection(updated: ReportSectionView) {
    setPayload((prev) =>
      prev
        ? { ...prev, sections: prev.sections.map((s) => (s.kind === updated.kind ? updated : s)) }
        : prev
    );
  }

  async function saveCover() {
    setSavingCover(true);
    setError(null);
    try {
      const { report, sections } = await api.updateReport({
        institutionName: form.institutionName.trim(),
        institutionAddress: form.institutionAddress.trim(),
        faculty: form.faculty.trim(),
        department: form.department.trim(),
        programme: form.programme.trim(),
        level: form.level.trim(),
        matricNumber: form.matricNumber.trim(),
        schoolSupervisor: form.schoolSupervisor.trim(),
        companySupervisor: form.companySupervisor.trim(),
        durationLabel: form.durationLabel.trim(),
        submissionDate: form.submissionDate || undefined,
        dedicationNames: form.dedicationNames
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean),
      });
      setPayload((prev) => (prev ? { ...prev, report, sections } : prev));
      flash("Report details saved.");
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not save your report details.");
      }
    } finally {
      setSavingCover(false);
    }
  }

  async function uploadImage(field: "logo" | "cover", file: File | undefined) {
    if (!file) return;
    setUploading(field);
    setError(null);
    try {
      const { report, sections } = await api.uploadReportImage(field, file);
      setPayload((prev) => (prev ? { ...prev, report, sections } : prev));
      flash(field === "logo" ? "Logo uploaded." : "Cover image uploaded.");
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not upload that image.");
      }
    } finally {
      setUploading(null);
    }
  }

  /**
   * Writes every blank section with its own request, in document order.
   *
   * Sections are written one at a time on purpose: the AI service is throttled
   * per minute, so a single request that generated the whole report ran for
   * minutes, waited through rate-limit retries, and was eventually cut off by
   * the proxy — surfacing as a generic 500. One section per request keeps each
   * call short and lets the progress below update as the report is written.
   */
  async function generateAll() {
    const pending = (payload?.sections ?? []).filter((s) => !s.content?.trim());
    if (pending.length === 0) {
      flash("Every section already has content — nothing new to write.");
      return;
    }

    setGeneratingAll(true);
    setError(null);
    setSuccess(null);

    const failed: string[] = [];
    let lastError: string | null = null;
    let written = 0;

    try {
      for (let i = 0; i < pending.length; i++) {
        const section = pending[i];
        const label = `Writing ${i + 1} of ${pending.length}: ${section.title}`;
        setGenerationProgress(label);
        setGeneratingKind(section.kind);
        try {
          const updated = await api.generateReportSection(section.kind);
          replaceSection(updated);
          written++;
        } catch (err: any) {
          setGeneratingKind(null);
          if (err?.status === 401) {
            handleAuthFailure(err);
            return;
          }
          // The server may still refuse if the address was never confirmed.
          if (isEmailNotVerified(err)) setEmailBlocked(true);
          lastError = err?.message || null;
          failed.push(section.title);
        }
      }
    } finally {
      setGenerationProgress(null);
      setGeneratingKind(null);
      setGeneratingAll(false);
    }

    if (failed.length === 0) {
      flash(`Wrote ${written} section${written === 1 ? "" : "s"}.`);
    } else if (written === 0) {
      setError(lastError || `Could not write any section — ${failed.length} failed.`);
    } else {
      flash(
        `Wrote ${written} section${written === 1 ? "" : "s"}. ` +
          `${failed.length} section${failed.length === 1 ? "" : "s"} could not be written — ` +
          `${failed.join(", ")}. Try writing ${failed.length === 1 ? "it" : "those"} again.`
      );
    }
  }

  async function writeSection(kind: ReportSectionKind, isRegeneration: boolean) {
    setGeneratingKind(kind);
    setError(null);
    setSuccess(null);
    try {
      const note = notes[kind]?.trim() || undefined;
      const updated = isRegeneration
        ? await api.regenerateReportSection(kind, note)
        : await api.generateReportSection(kind, note);
      replaceSection(updated);
      setNotes((prev) => ({ ...prev, [kind]: "" }));
      flash(isRegeneration ? "Section rewritten." : "Section written.");
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        // The server may still refuse if the address was never confirmed.
        if (isEmailNotVerified(err)) setEmailBlocked(true);
        setError(err?.message || "Could not write that section.");
      }
    } finally {
      setGeneratingKind(null);
    }
  }

  function startEdit(section: ReportSectionView) {
    setEditingKind(section.kind);
    setEditContent(section.content ?? "");
  }

  async function saveSection(kind: ReportSectionKind) {
    setSavingSection(kind);
    setError(null);
    try {
      const updated = await api.updateReportSection(kind, { content: editContent });
      replaceSection(updated);
      setEditingKind(null);
      flash("Section saved.");
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not save that section.");
      }
    } finally {
      setSavingSection(null);
    }
  }

  async function setSectionStatus(kind: ReportSectionKind, status: ReportSectionStatus) {
    const previous = payload?.sections.find((s) => s.kind === kind)?.status;
    if (!previous || previous === status) return;
    setUpdatingStatus(kind);
    setError(null);
    // Optimistically flip the pill, then roll back if the server rejects it.
    setPayload((prev) =>
      prev
        ? { ...prev, sections: prev.sections.map((s) => (s.kind === kind ? { ...s, status } : s)) }
        : prev
    );
    try {
      const updated = await api.updateReportSection(kind, { status });
      replaceSection(updated);
    } catch (err: any) {
      if (payload) {
        setPayload((prev) =>
          prev
            ? {
                ...prev,
                sections: prev.sections.map((s) =>
                  s.kind === kind ? { ...s, status: previous } : s
                ),
              }
            : prev
        );
      }
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not update that section's status.");
      }
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function download(format: "pdf" | "docx") {
    setDownloading(format);
    setError(null);
    try {
      if (format === "pdf") await api.downloadReportPdf();
      else await api.downloadReportDocx();
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not download your report.");
      }
    } finally {
      setDownloading(null);
    }
  }

  async function updateReportStatus(action: "complete" | "reopen") {
    setSavingReportStatus(action);
    setError(null);
    try {
      if (action === "complete") await api.markReportComplete();
      else await api.reopenReport();
      await load();
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not update the report status.");
      }
    } finally {
      setSavingReportStatus(null);
    }
  }

  const hasContent = useMemo(
    () => !!payload?.sections.some((s) => s.content?.trim()),
    [payload]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink/50">
        <Loader2 size={15} className="animate-spin" /> Loading your report...
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="max-w-2xl">
        <p className="rounded-md bg-rust/10 px-4 py-3 text-sm text-rust">
          {error ?? "Could not load your report."}
        </p>
      </div>
    );
  }

  const { canGenerate, logbookCount, defaults, sections } = payload;
  const isComplete = payload.report.status === "COMPLETED";
  const finalizedCount = sections.filter((s) => s.status === "FINALIZED").length;

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="mb-1 font-slab text-2xl font-semibold text-ink">SIWES Report</h1>
          <p className="text-ink/60">
            Written from your logbook, then downloadable as a PDF or Word document.
          </p>
        </div>
        {hasContent && (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => download("pdf")} disabled={downloading !== null}>
              {downloading === "pdf" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Download size={15} />
              )}
              PDF
            </Button>
            <Button variant="outline" onClick={() => download("docx")} disabled={downloading !== null}>
              {downloading === "docx" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Download size={15} />
              )}
              Word
            </Button>
          </div>
        )}
      </div>

      {hasContent && (
        <Card className="mb-6 flex items-center justify-between gap-4 print:hidden">
          <div>
            <p className="font-mono text-sm text-ink/50">
              {finalizedCount} of {sections.length} sections finalized
            </p>
            <span
              className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-medium ${
                isComplete ? "bg-forest/10 text-forest" : "bg-gold/20 text-gold-dark"
              }`}
            >
              {isComplete ? "Completed" : "In progress"}
            </span>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {isComplete ? (
              <Button
                variant="outline"
                onClick={() => updateReportStatus("reopen")}
                disabled={savingReportStatus !== null}
              >
                {savingReportStatus === "reopen" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <RotateCcw size={15} />
                )}
                {savingReportStatus === "reopen" ? "Reopening..." : "Reopen for revisions"}
              </Button>
            ) : (
              <Button
                onClick={() => updateReportStatus("complete")}
                disabled={savingReportStatus !== null}
              >
                {savingReportStatus === "complete" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <BadgeCheck size={15} />
                )}
                {savingReportStatus === "complete" ? "Completing..." : "Mark as complete"}
              </Button>
            )}
          </div>
        </Card>
      )}

      {isComplete && (
        <p className="mb-4 rounded-md bg-forest/10 px-4 py-3 text-sm text-forest">
          This report is marked complete and is now read-only. Reopen it any time, free of
          charge, if you need to make revisions.
        </p>
      )}

      {success && (
        <p className="mb-4 flex items-center gap-2 rounded-md bg-forest/10 px-4 py-3 text-sm text-forest">
          <Check size={15} /> {success}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-md bg-rust/10 px-4 py-3 text-sm text-rust">{error}</p>
      )}

      {emailBlocked && (
        <div className="mb-6">
          <VerifyEmailNotice
            message="Verify your email address to write your report with AI."
            onVerified={load}
          />
        </div>
      )}

      {!canGenerate && (
        <p className="mb-6 flex items-start gap-2 rounded-md bg-gold/15 px-4 py-3 text-sm text-gold-dark">
          <Lock size={15} className="mt-0.5 shrink-0" />
          <span>
            Writing the report with AI needs the IT/SIWES Pass.{" "}
            <Link href="/dashboard/account" className="font-medium underline underline-offset-4">
              Get it from Account
            </Link>{" "}
            — you can still fill in your details and edit sections below.
          </span>
        </p>
      )}

      {/* Generate */}
      {!isComplete && (
      <Card className="mb-6 print:hidden">
        <h2 className="font-medium text-ink">Write your report</h2>
        {logbookCount === 0 ? (
          <p className="mt-1 text-sm text-ink/60">
            Your logbook is empty.{" "}
            <Link href="/dashboard/logbook" className="font-medium text-forest underline underline-offset-4">
              Fill it in first
            </Link>
            , then come back and the report will be written from it.
          </p>
        ) : (
          <>
            <p className="mt-1 mb-4 text-sm text-ink/60">
              This writes every section still blank, using your {logbookCount} logbook{" "}
              {logbookCount === 1 ? "entry" : "entries"}, placement and project. You can rewrite any
              part afterwards.
            </p>
            <div className="flex justify-end">
              <Button onClick={generateAll} disabled={generatingAll || !canGenerate || emailBlocked}>
                {generatingAll ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Sparkles size={15} />
                )}
                {generatingAll
                  ? generationProgress ?? "Writing your report..."
                  : "Generate full report"}
              </Button>
            </div>
          </>
        )}
      </Card>
      )}

      {/* Cover / title details */}
      {!isComplete && (
      <Card className="mb-6 space-y-4 print:hidden">
        <div>
          <h2 className="font-medium text-ink">Cover &amp; title page</h2>
          <p className="mt-1 text-sm text-ink/60">
            These appear on the front pages, the dedication and the acknowledgment.
          </p>
        </div>
        <div>
          <FieldLabel>Institution name</FieldLabel>
          <TextInput
            value={form.institutionName}
            onChange={(e) => setField("institutionName", e.target.value)}
            placeholder={defaults.school || "e.g. University of Port Harcourt"}
          />
        </div>
        <div>
          <FieldLabel>Institution address</FieldLabel>
          <TextInput
            value={form.institutionAddress}
            onChange={(e) => setField("institutionAddress", e.target.value)}
            placeholder="e.g. Choba, Port Harcourt, Rivers State"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Faculty</FieldLabel>
            <TextInput
              value={form.faculty}
              onChange={(e) => setField("faculty", e.target.value)}
              placeholder="e.g. Physical Sciences"
            />
          </div>
          <div>
            <FieldLabel>Department</FieldLabel>
            <TextInput
              value={form.department}
              onChange={(e) => setField("department", e.target.value)}
              placeholder={defaults.department || "e.g. Computer Science"}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Programme</FieldLabel>
            <TextInput
              value={form.programme}
              onChange={(e) => setField("programme", e.target.value)}
              placeholder="e.g. B.Sc. Computer Science"
            />
          </div>
          <div>
            <FieldLabel>Level</FieldLabel>
            <TextInput
              value={form.level}
              onChange={(e) => setField("level", e.target.value)}
              placeholder="e.g. 400 Level"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Matric number</FieldLabel>
            <TextInput
              value={form.matricNumber}
              onChange={(e) => setField("matricNumber", e.target.value)}
              placeholder="e.g. U2020/1234567"
            />
          </div>
          <div>
            <FieldLabel>Duration</FieldLabel>
            <TextInput
              value={form.durationLabel}
              onChange={(e) => setField("durationLabel", e.target.value)}
              placeholder={defaults.durationLabel || "e.g. Six Months"}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>School supervisor</FieldLabel>
            <TextInput
              value={form.schoolSupervisor}
              onChange={(e) => setField("schoolSupervisor", e.target.value)}
              placeholder="e.g. Dr. A. B. Wokoma"
            />
          </div>
          <div>
            <FieldLabel>Industry supervisor</FieldLabel>
            <TextInput
              value={form.companySupervisor}
              onChange={(e) => setField("companySupervisor", e.target.value)}
              placeholder="e.g. Mr. J. Okoro"
            />
          </div>
        </div>
        <div>
          <FieldLabel>Submission date</FieldLabel>
          <TextInput
            type="date"
            value={form.submissionDate}
            onChange={(e) => setField("submissionDate", e.target.value)}
          />
        </div>
        <div>
          <FieldLabel>Names for the dedication (comma-separated)</FieldLabel>
          <TextInput
            value={form.dedicationNames}
            onChange={(e) => setField("dedicationNames", e.target.value)}
            placeholder="e.g. my parents, my siblings, God"
          />
        </div>

        <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Institution logo (optional)</FieldLabel>
            <input
              type="file"
              accept="image/*"
              disabled={uploading !== null}
              onChange={(e) => uploadImage("logo", e.target.files?.[0])}
              className="focus-ring block w-full text-sm text-ink/70 file:mr-3 file:rounded-md file:border-0 file:bg-forest/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-forest"
            />
            {uploading === "logo" && (
              <p className="mt-1 flex items-center gap-2 text-xs text-ink/50">
                <Loader2 size={13} className="animate-spin" /> Uploading...
              </p>
            )}
          </div>
          <div>
            <FieldLabel>Ready-made cover page (optional)</FieldLabel>
            <input
              type="file"
              accept="image/*"
              disabled={uploading !== null}
              onChange={(e) => uploadImage("cover", e.target.files?.[0])}
              className="focus-ring block w-full text-sm text-ink/70 file:mr-3 file:rounded-md file:border-0 file:bg-forest/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-forest"
            />
            {uploading === "cover" && (
              <p className="mt-1 flex items-center gap-2 text-xs text-ink/50">
                <Loader2 size={13} className="animate-spin" /> Uploading...
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={saveCover} disabled={savingCover}>
            {savingCover && <Loader2 size={15} className="animate-spin" />}
            {savingCover ? "Saving..." : "Save details"}
          </Button>
        </div>
      </Card>
      )}

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((section) => {
          const isEditing = editingKind === section.kind;
          const isGenerating = generatingKind === section.kind;
          const hasSectionContent = !!section.content?.trim();
          return (
            <Card key={section.kind} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {section.chapter !== null && (
                    <span className="rounded bg-forest/10 px-2 py-0.5 font-mono text-xs font-medium text-forest">
                      Ch. {section.chapter}
                    </span>
                  )}
                  <h2 className="font-slab text-lg font-semibold text-ink">{section.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink/40">
                    {section.regenerationsUsed > 0
                      ? `${section.regenerationsUsed} rewrite${section.regenerationsUsed === 1 ? "" : "s"}`
                      : ""}
                  </span>
                  {isComplete ? (
                    <span className="font-mono text-xs text-ink/40">
                      {STATUS_LABELS[section.status]}
                    </span>
                  ) : (
                  <div className="inline-flex items-center rounded-md border border-line p-0.5">
                    {STATUS_ORDER.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={
                          updatingStatus === section.kind || section.status === s || !hasSectionContent
                        }
                        onClick={() => setSectionStatus(section.kind, s)}
                        className={`focus-ring rounded-sm px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-default ${
                          section.status === s
                            ? "bg-forest text-paper"
                            : "text-ink/50 hover:text-forest"
                        }`}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                    {updatingStatus === section.kind && (
                      <Loader2 size={13} className="mx-1.5 my-auto animate-spin text-ink/40" />
                    )}
                  </div>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  <textarea
                    rows={10}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="focus-ring w-full rounded-md border border-line bg-white p-3.5 text-sm leading-relaxed text-ink"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setEditingKind(null)} disabled={savingSection === section.kind}>
                      <X size={15} /> Cancel
                    </Button>
                    <Button onClick={() => saveSection(section.kind)} disabled={savingSection === section.kind}>
                      {savingSection === section.kind ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Check size={15} />
                      )}
                      {savingSection === section.kind ? "Saving..." : "Save section"}
                    </Button>
                  </div>
                </div>
              ) : hasSectionContent ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                  {section.content}
                </p>
              ) : (
                <p className="text-sm italic text-ink/40">Not written yet.</p>
              )}

              {!isEditing && !isComplete && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 print:hidden">
                  <TextInput
                    value={notes[section.kind] ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [section.kind]: e.target.value }))}
                    placeholder="Optional guidance for the AI (e.g. mention the weekend shift)"
                    className="w-full sm:max-w-sm"
                  />
                  <div className="flex gap-2">
                    {hasSectionContent && (
                      <Button variant="ghost" onClick={() => startEdit(section)} disabled={isGenerating}>
                        <Pencil size={15} /> Edit
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => writeSection(section.kind, hasSectionContent)}
                      disabled={isGenerating || generatingAll || !canGenerate || emailBlocked}
                    >
                      {isGenerating ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : hasSectionContent ? (
                        <RefreshCw size={15} />
                      ) : (
                        <Sparkles size={15} />
                      )}
                      {isGenerating
                        ? "Writing..."
                        : hasSectionContent
                          ? "Rewrite with AI"
                          : "Write with AI"}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Downloads */}
      <Card className="mt-6 print:hidden">
        <h2 className="font-medium text-ink">Download your report</h2>
        <p className="mt-1 mb-4 text-sm text-ink/60">
          Save it as a PDF (ready to print) or a Word document you can still edit.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => download("pdf")} disabled={downloading !== null}>
            {downloading === "pdf" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <FileText size={15} />
            )}
            Download PDF
          </Button>
          <Button variant="outline" onClick={() => download("docx")} disabled={downloading !== null}>
            {downloading === "docx" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Download size={15} />
            )}
            Download Word (.docx)
          </Button>
        </div>
      </Card>
    </div>
  );
}
