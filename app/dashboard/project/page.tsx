"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, ProgressRing, FieldLabel, TextInput } from "@/components/ui";
import {
  Lock,
  CheckCircle2,
  Circle,
  Loader2,
  RotateCcw,
  BadgeCheck,
  Sparkles,
  Printer,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Plus,
} from "lucide-react";
import { api, clearToken, getToken, formatNaira } from "@/lib/api";

type ChapterStatus = "DRAFT" | "REVIEWED" | "FINALIZED";

interface Chapter {
  id: string;
  chapterNumber: number;
  title: string;
  status: ChapterStatus;
  isFreeUnlocked: boolean;
  content: string | null;
  regenerationsUsed: number;
}

interface Project {
  id: string;
  title: string;
  supervisorName: string | null;
  status: "IN_PROGRESS" | "COMPLETED";
  completedAt: string | null;
  chapters: Chapter[];
}

type VerificationTier = "API_VERIFIED" | "LINK_CHECKED" | "STUDENT_CONFIRMED";

interface Reference {
  id: string;
  citationText: string;
  sourceType: string;
  doiOrIsbnOrLink: string | null;
  formattedCitation: string | null;
  isVerified: boolean;
  verificationTier: VerificationTier;
  verifiedVia: string | null;
}

const CHAPTER_STATUS_LABEL: Record<ChapterStatus, string> = {
  DRAFT: "Draft",
  REVIEWED: "Reviewed",
  FINALIZED: "Finalized",
};

const SOURCE_TYPES: { value: string; label: string }[] = [
  { value: "JOURNAL_ARTICLE", label: "Journal article" },
  { value: "CONFERENCE_PAPER", label: "Conference paper" },
  { value: "BOOK", label: "Book" },
  { value: "DATASET", label: "Dataset" },
  { value: "THESIS", label: "Thesis" },
  { value: "REPORT", label: "Report" },
  { value: "STANDARD", label: "Standard" },
  { value: "WEBSITE", label: "Website" },
];

export default function ProjectPage() {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [hasProjectPass, setHasProjectPass] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"complete" | "reopen" | null>(null);
  const [drafting, setDrafting] = useState<number | null>(null);
  const [openChapter, setOpenChapter] = useState<number | null>(null);
  const [chapterNotes, setChapterNotes] = useState<Record<number, string>>({});
  const [references, setReferences] = useState<Reference[]>([]);
  const [refText, setRefText] = useState("");
  const [refSource, setRefSource] = useState("JOURNAL_ARTICLE");
  const [refLink, setRefLink] = useState("");
  const [refSaving, setRefSaving] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [prices, setPrices] = useState({
    IT_SIWES_PASS: 10_000,
    PROJECT_PASS: 20_000,
    BUNDLE: 27_000,
  });
  const [error, setError] = useState<string | null>(null);

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
      const [projects, me, livePrices] = await Promise.all([
        api.getMyProjects(),
        api.getMe().catch(() => null),
        api.getPrices().catch(() => null),
      ]);
      if (livePrices) setPrices(livePrices);
      const first = Array.isArray(projects) ? projects[0] ?? null : null;
      setProject(first);
      setHasProjectPass(
        !!me &&
          Array.isArray(me.purchases) &&
          me.purchases.some(
            (p: any) => p.productType === "PROJECT_PASS" && p.status === "SUCCESSFUL"
          )
      );
      if (first) {
        const refs = await api.listReferences(first.id).catch(() => []);
        setReferences(Array.isArray(refs) ? refs : []);
      } else {
        setReferences([]);
      }
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not load your project.");
      }
    } finally {
      setLoading(false);
    }
  }, [handleAuthFailure]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(action: "complete" | "reopen") {
    if (!project) return;
    setSaving(action);
    setError(null);
    try {
      if (action === "complete") {
        await api.markProjectComplete(project.id);
      } else {
        await api.reopenProject(project.id);
      }
      await load();
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not update the project status.");
      }
    } finally {
      setSaving(null);
    }
  }

  async function draftChapter(chapterNumber: number) {
    if (!project) return;
    const chapter = project.chapters.find((c) => c.chapterNumber === chapterNumber);
    const notes = (chapterNotes[chapterNumber] ?? "").trim();
    if (!notes) {
      setError("Add some notes for the AI to work from.");
      return;
    }
    setDrafting(chapterNumber);
    setError(null);
    try {
      // A chapter that already has content is being regenerated, which counts
      // against its allowance; a blank one is a first draft.
      const updated = chapter?.content
        ? await api.regenerateChapter(project.id, chapterNumber, notes)
        : await api.draftChapter(project.id, chapterNumber, notes);
      setProject((prev) =>
        prev
          ? {
              ...prev,
              chapters: prev.chapters.map((c) =>
                c.chapterNumber === chapterNumber
                  ? {
                      ...c,
                      content: updated.content,
                      status: updated.status,
                      regenerationsUsed: updated.regenerationsUsed ?? c.regenerationsUsed,
                    }
                  : c
              ),
            }
          : prev
      );
      setError(null);
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not draft that chapter.");
      }
    } finally {
      setDrafting(null);
    }
  }

  async function addReference() {
    if (!project) return;
    const citationText = refText.trim();
    if (!citationText) {
      setError("Add the citation text first.");
      return;
    }
    setRefSaving(true);
    setError(null);
    try {
      const created = await api.addReference(project.id, {
        citationText,
        sourceType: refSource,
        doiOrIsbnOrLink: refLink.trim() || undefined,
      });
      setReferences((prev) => [...prev, created]);
      setRefText("");
      setRefLink("");
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not add that reference.");
      }
    } finally {
      setRefSaving(false);
    }
  }

  async function removeReference(id: string) {
    if (!project) return;
    setError(null);
    try {
      await api.deleteReference(project.id, id);
      setReferences((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not remove that reference.");
      }
    }
  }

  async function verifyReference(id: string) {
    if (!project) return;
    setVerifying(id);
    setError(null);
    try {
      const updated = await api.verifyReference(project.id, id);
      setReferences((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not verify that reference.");
      }
    } finally {
      setVerifying(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink/50">
        <Loader2 size={15} className="animate-spin" /> Loading your project...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-2xl">
        <h1 className="mb-1 font-slab text-2xl font-semibold text-ink">Final Year Project</h1>
        <p className="mb-6 text-ink/60">No project set up yet.</p>
        <Card>
          <p className="text-ink/70">
            Create your project from the{" "}
            <Link href="/dashboard/account" className="font-medium text-forest underline decoration-forest/30 underline-offset-4">
              Account
            </Link>{" "}
            tab and its five chapters will be generated automatically.
          </p>
        </Card>
      </div>
    );
  }

  const chapters = project.chapters ?? [];
  const finalized = chapters.filter((c) => c.status === "FINALIZED").length;
  const percent = chapters.length ? Math.round((finalized / chapters.length) * 100) : 0;
  const isComplete = project.status === "COMPLETED";

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 font-slab text-2xl font-semibold text-ink">Final Year Project</h1>
          <p className="text-ink/60">{project.title}</p>
          {project.supervisorName && (
            <p className="mt-0.5 text-sm text-ink/50">Supervisor: {project.supervisorName}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button variant="outline" onClick={() => window.print()} className="print:hidden">
            <Printer size={15} /> Print / Save as PDF
          </Button>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              isComplete ? "bg-forest/10 text-forest" : "bg-gold/20 text-gold-dark"
            }`}
          >
            {isComplete ? "Completed" : "In progress"}
          </span>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-rust/10 px-4 py-3 text-sm text-rust print:hidden">{error}</p>
      )}

      <Card className="mb-6 flex items-center justify-between gap-4">
        <ProgressRing percent={percent} label="chapters finalized" />
        <div className="text-right">
          <p className="font-mono text-sm text-ink/50">
            {finalized} of {chapters.length} finalized
          </p>
          {isComplete ? (
            <Button
              variant="outline"
              className="mt-2 print:hidden"
              onClick={() => updateStatus("reopen")}
              disabled={saving !== null}
            >
              {saving === "reopen" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <RotateCcw size={15} />
              )}
              {saving === "reopen" ? "Reopening..." : "Reopen for revisions"}
            </Button>
          ) : (
            <Button
              className="mt-2 print:hidden"
              onClick={() => updateStatus("complete")}
              disabled={saving !== null}
            >
              {saving === "complete" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <BadgeCheck size={15} />
              )}
              {saving === "complete" ? "Completing..." : "Mark as complete"}
            </Button>
          )}
        </div>
      </Card>

      {isComplete && (
        <p className="mb-4 rounded-md bg-forest/10 px-4 py-3 text-sm text-forest">
          This project is marked complete and is now read-only. Reopen it any time, free
          of charge, if you need to make revisions.
        </p>
      )}

      <div className="space-y-3">
        {chapters.map((ch) => {
          const unlocked = ch.isFreeUnlocked || hasProjectPass;
          const canDraft = unlocked && !isComplete;
          const expanded = openChapter === ch.chapterNumber;
          return (
            <Card key={ch.id} className="py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {ch.status === "FINALIZED" ? (
                    <CheckCircle2 size={18} className="text-forest" />
                  ) : (
                    <Circle size={18} className="text-ink/25" />
                  )}
                  <div>
                    <p className="font-mono text-xs text-ink/40">Chapter {ch.chapterNumber}</p>
                    <p className="font-medium text-ink">{ch.title}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {ch.isFreeUnlocked && (
                    <span className="rounded-full bg-gold/20 px-3 py-1 text-xs font-medium text-gold-dark">
                      Free
                    </span>
                  )}
                  {!unlocked && (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-ink/40">
                      <Lock size={13} /> Needs Project Pass
                    </span>
                  )}
                  <span className="font-mono text-xs text-ink/40">
                    {CHAPTER_STATUS_LABEL[ch.status]}
                  </span>
                  {canDraft && (
                    <button
                      type="button"
                      onClick={() => setOpenChapter(expanded ? null : ch.chapterNumber)}
                      className="focus-ring inline-flex items-center gap-1.5 text-xs font-medium text-forest underline decoration-forest/30 underline-offset-4 print:hidden"
                    >
                      <Sparkles size={13} />
                      {expanded ? "Close" : ch.content ? "Edit / regenerate" : "Write with AI"}
                    </button>
                  )}
                </div>
              </div>

              {ch.content && !expanded && (
                <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-sm text-ink/70">
                  {ch.content}
                </p>
              )}

              {expanded && (
                <div className="mt-4 space-y-3 border-t border-line pt-4">
                  <div className="print:hidden">
                    <FieldLabel>Your notes for this chapter</FieldLabel>
                    <textarea
                      rows={5}
                      value={chapterNotes[ch.chapterNumber] ?? ""}
                      onChange={(e) =>
                        setChapterNotes((prev) => ({ ...prev, [ch.chapterNumber]: e.target.value }))
                      }
                      className="focus-ring w-full rounded-md border border-line bg-white p-3.5 text-ink placeholder:text-ink/35"
                      placeholder="Bullet points or sentences the AI should turn into this chapter..."
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 print:hidden">
                    {ch.regenerationsUsed > 0 ? (
                      <span className="font-mono text-xs text-ink/40">
                        Regenerated {ch.regenerationsUsed}&times;
                      </span>
                    ) : (
                      <span />
                    )}
                    <Button
                      onClick={() => draftChapter(ch.chapterNumber)}
                      disabled={drafting === ch.chapterNumber}
                    >
                      {drafting === ch.chapterNumber ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Sparkles size={15} />
                      )}
                      {drafting === ch.chapterNumber
                        ? "Drafting..."
                        : ch.content
                        ? "Regenerate draft"
                        : "Draft chapter"}
                    </Button>
                  </div>
                  {ch.content && (
                    <div className="whitespace-pre-wrap rounded-md border border-line bg-white/60 p-4 text-sm text-ink/80">
                      {ch.content}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-slab text-lg font-semibold text-ink">References</h2>

        <Card className="mb-3 print:hidden">
          <FieldLabel>Citation</FieldLabel>
          <textarea
            rows={2}
            value={refText}
            onChange={(e) => setRefText(e.target.value)}
            className="focus-ring w-full rounded-md border border-line bg-white p-3.5 text-ink placeholder:text-ink/35"
            placeholder="e.g. Adeyemi, K. (2021). A review of X. Journal of Y, 12(3), 45–60."
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Source type</FieldLabel>
              <select
                value={refSource}
                onChange={(e) => setRefSource(e.target.value)}
                className="focus-ring w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-ink"
              >
                {SOURCE_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>DOI / ISBN / link (optional)</FieldLabel>
              <TextInput
                value={refLink}
                onChange={(e) => setRefLink(e.target.value)}
                placeholder="10.1000/xyz123, 978-…, or https://…"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={addReference} disabled={refSaving || !refText.trim()}>
              {refSaving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {refSaving ? "Adding..." : "Add reference"}
            </Button>
          </div>
        </Card>

        {references.length === 0 ? (
          <p className="text-sm text-ink/50">
            No references yet. Add your sources here and verify them against Crossref, DataCite
            and Open Library.
          </p>
        ) : (
          <div className="space-y-3">
            {references.map((ref) => (
              <Card key={ref.id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-ink">{ref.formattedCitation || ref.citationText}</p>
                    {ref.formattedCitation && (
                      <p className="mt-1 text-sm text-ink/50">{ref.citationText}</p>
                    )}
                    <div className="mt-2">
                      {ref.isVerified ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-forest/10 px-2.5 py-0.5 text-xs font-medium text-forest">
                          <ShieldCheck size={13} />
                          {ref.verificationTier === "API_VERIFIED" ? "Verified" : "Link checked"}
                          {ref.verifiedVia ? ` · ${ref.verifiedVia}` : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-line/50 px-2.5 py-0.5 text-xs font-medium text-ink/50">
                          <ShieldAlert size={13} /> Unverified
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 print:hidden">
                    <button
                      type="button"
                      onClick={() => verifyReference(ref.id)}
                      disabled={verifying === ref.id}
                      className="focus-ring inline-flex items-center gap-1.5 text-xs font-medium text-forest underline decoration-forest/30 underline-offset-4 disabled:opacity-50"
                    >
                      {verifying === ref.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <ShieldCheck size={13} />
                      )}
                      {verifying === ref.id ? "Checking..." : ref.isVerified ? "Re-check" : "Verify"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeReference(ref.id)}
                      aria-label="Delete reference"
                      className="focus-ring rounded-md p-1.5 text-ink/40 transition-colors hover:bg-rust/10 hover:text-rust"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 font-mono text-xs text-ink/40">
        Final Year Project Pass — {formatNaira(prices.PROJECT_PASS)} one-time · unlocks Chapters 2–5
      </p>
    </div>
  );
}
