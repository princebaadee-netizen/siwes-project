"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui";
import { api, clearToken, getToken } from "@/lib/api";

interface ReportEntry {
  id: string;
  activity: string;
  evidenceUrl: string | null;
  status: "DRAFT" | "REVIEWED" | "FINALIZED";
  calendarDay: { date: string };
}

interface ReportChapter {
  id: string;
  chapterNumber: number;
  title: string;
  status: string;
  content: string | null;
}

interface ReportReference {
  id: string;
  citationText: string;
  formattedCitation: string | null;
}

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const REPORT_STATUS_LABELS: Record<ReportEntry["status"], string> = {
  DRAFT: "Draft",
  REVIEWED: "Reviewed",
  FINALIZED: "Finalized",
};

export default function ReportPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [placement, setPlacement] = useState<any>(null);
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [project, setProject] = useState<any>(null);
  const [references, setReferences] = useState<ReportReference[]>([]);

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
      const [me, projects, pl, lg] = await Promise.all([
        api.getMe(),
        api.getMyProjects().catch(() => []),
        api.getMyPlacement().catch(() => null),
        api.listLogbookEntries().catch(() => []),
      ]);
      setProfile(me);
      setPlacement(pl);
      setEntries(
        Array.isArray(lg)
          ? [...lg].sort((a: any, b: any) =>
              a.calendarDay.date.localeCompare(b.calendarDay.date)
            )
          : []
      );

      const first = Array.isArray(projects) ? projects[0] ?? null : null;
      setProject(first);
      if (first) {
        const refs = await api.listReferences(first.id).catch(() => []);
        setReferences(Array.isArray(refs) ? refs : []);
      } else {
        setReferences([]);
      }
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not build your report.");
      }
    } finally {
      setLoading(false);
    }
  }, [handleAuthFailure]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink/50">
        <Loader2 size={15} className="animate-spin" /> Building your report...
      </div>
    );
  }

  const chapters: ReportChapter[] = Array.isArray(project?.chapters) ? project.chapters : [];
  const generatedOn = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Number sections from what actually renders, so dropping an optional section
  // never leaves a gap (e.g. 3 followed by 5, or two section 2s).
  let section = 1;
  const introductionNo = section++;
  const organisationNo = placement ? section++ : null;
  const workNo = section++;
  const projectNo = project ? section++ : null;
  const referencesNo = references.length > 0 ? section++ : null;

  // Draft/reviewed entries are still shown (nothing is hidden), but the report
  // flags them so they don't read as final work.
  const unfinalized = entries.filter((e) => e.status !== "FINALIZED").length;

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="mb-1 font-slab text-2xl font-semibold text-ink">SIWES Report</h1>
          <p className="text-ink/60">
            A ready-to-print report assembled from your placement, logbook and project.
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()} className="shrink-0">
          <Printer size={15} /> Print / Save as PDF
        </Button>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-rust/10 px-4 py-3 text-sm text-rust print:hidden">{error}</p>
      )}

      <article className="space-y-8 text-ink">
        {/* Cover */}
        <header className="border-b border-line pb-6 text-center">
          <h1 className="font-slab text-2xl font-semibold uppercase leading-snug">
            Student Industrial Work Experience Scheme (SIWES)
          </h1>
          <p className="mt-1 font-slab text-lg text-ink/80">Report</p>
          <dl className="mx-auto mt-6 grid max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-left text-sm">
            <dt className="font-medium text-ink/60">Name</dt>
            <dd>{profile?.fullName || "—"}</dd>
            <dt className="font-medium text-ink/60">School</dt>
            <dd>{profile?.school || "—"}</dd>
            <dt className="font-medium text-ink/60">Department</dt>
            <dd>{profile?.department || "—"}</dd>
            <dt className="font-medium text-ink/60">Organisation</dt>
            <dd>{placement?.companyName || "—"}</dd>
            <dt className="font-medium text-ink/60">Duration</dt>
            <dd>
              {fmt(placement?.startDate)} – {fmt(placement?.endDate)}
            </dd>
          </dl>
        </header>

        {/* Introduction */}
        <section>
          <h2 className="mb-2 font-slab text-lg font-semibold">{introductionNo}. Introduction</h2>
          <p className="leading-relaxed text-ink/80">
            {placement
              ? `This report presents an account of the Student Industrial Work Experience Scheme (SIWES) undertaken by ${
                  profile?.fullName || "the student"
                }, a student of ${profile?.department || "the department"} at ${
                  profile?.school || "the institution"
                }, at ${placement.companyName}${
                  placement.companyAddress ? `, ${placement.companyAddress}` : ""
                }. The placement ran from ${fmt(placement.startDate)} to ${fmt(
                  placement.endDate
                )}, and ${entries.length} diary ${
                  entries.length === 1 ? "entry was" : "entries were"
                } recorded during the period.`
              : "No IT/SIWES placement has been set up yet. Complete your placement details in Account, then come back to generate this report."}
          </p>
        </section>

        {/* Organisation profile */}
        {placement && (
          <section>
            <h2 className="mb-2 font-slab text-lg font-semibold">{organisationNo}. Organisation Profile</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-medium text-ink/60">Name</dt>
              <dd>{placement.companyName || "—"}</dd>
              <dt className="font-medium text-ink/60">Address</dt>
              <dd>{placement.companyAddress || "—"}</dd>
              <dt className="font-medium text-ink/60">Sector</dt>
              <dd>{placement.industrySector || "—"}</dd>
            </dl>
          </section>
        )}

        {/* Work done */}
        <section>
          <h2 className="mb-2 font-slab text-lg font-semibold">
            {workNo}. Summary of Work Done
          </h2>
          {entries.length === 0 ? (
            <p className="text-sm text-ink/60">No logbook entries recorded yet.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="w-28 py-2 pr-3 font-medium text-ink/60">Date</th>
                  <th className="py-2 pr-3 font-medium text-ink/60">Activity</th>
                  <th className="w-36 py-2 pr-3 font-medium text-ink/60">Evidence</th>
                  <th className="w-20 py-2 font-medium text-ink/60">Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-3 font-mono text-xs text-ink/60">
                      {fmt(entry.calendarDay.date)}
                    </td>
                    <td className="py-2 pr-3 text-ink/80">{entry.activity}</td>
                    <td className="py-2 pr-3 text-xs text-forest underline underline-offset-2">
                      {entry.evidenceUrl ? entry.evidenceUrl : "—"}
                    </td>
                    <td className="py-2 text-xs text-ink/60">
                      {REPORT_STATUS_LABELS[entry.status] ?? entry.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {unfinalized > 0 && (
            <p className="mt-2 text-xs text-gold-dark">
              {unfinalized} of {entries.length} {entries.length === 1 ? "entry is" : "entries are"} not
              yet finalized.
            </p>
          )}
        </section>

        {/* Final year project */}
        {project && (
          <section>
            <h2 className="mb-2 font-slab text-lg font-semibold">{projectNo}. Final Year Project</h2>
            <p className="mb-3 text-ink/80">
              <span className="font-medium text-ink/60">Title: </span>
              {project.title}
              {project.supervisorName ? ` — supervised by ${project.supervisorName}` : ""}
            </p>
            <div className="space-y-4">
              {chapters.map((ch) => (
                <div key={ch.id}>
                  <h3 className="font-slab text-base font-semibold">
                    Chapter {ch.chapterNumber}: {ch.title}
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                    {ch.content || "Not written yet."}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* References */}
        {references.length > 0 && (
          <section>
            <h2 className="mb-2 font-slab text-lg font-semibold">{referencesNo}. References</h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink/80">
              {references.map((ref) => (
                <li key={ref.id}>{ref.formattedCitation || ref.citationText}</li>
              ))}
            </ol>
          </section>
        )}

        <footer className="border-t border-line pt-4 text-center font-mono text-xs text-ink/40">
          Generated on {generatedOn}
        </footer>
      </article>
    </div>
  );
}
