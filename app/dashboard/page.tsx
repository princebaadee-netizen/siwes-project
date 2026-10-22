"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { Card, ProgressRing } from "@/components/ui";
import { BookText, GraduationCap, ArrowRight } from "lucide-react";
import { api, clearToken, getToken } from "@/lib/api";

export default function DashboardOverview() {
  const { state, hydrated } = useAppStore();
  const router = useRouter();
  const [projectPercent, setProjectPercent] = useState(0);
  const [logbookPercent, setLogbookPercent] = useState<number | null>(null);

  useEffect(() => {
    if (!getToken()) return;

    api
      .getMyProjects()
      .then((projects) => {
        const project = projects?.[0];
        if (!project) return;
        const chapters = project.chapters ?? [];
        const finalized = chapters.filter((c: any) => c.status === "FINALIZED").length;
        setProjectPercent(chapters.length ? Math.round((finalized / chapters.length) * 100) : 0);
      })
      .catch((err) => {
        // A rejected token means this browser is holding a stale credential.
        // Swallowing it leaves a permanently blank 0% ring with no way out.
        if (err?.status === 401) {
          clearToken();
          router.replace("/login");
        }
      });

    // Logbook progress is a share of the attendance days actually worked, so
    // it is only meaningful for students who set up a placement. A student who
    // chose the project module alone has no logbook to report on.
    api
      .getMyPlacement()
      .then((placement) => {
        const summary = placement?.calendarSummary;
        if (!summary?.totalDays) return;
        setLogbookPercent(
          Math.min(100, Math.round((summary.loggedEntries / summary.totalDays) * 100))
        );
      })
      .catch(() => {
        // No placement yet is the normal case on a fresh account; the card
        // falls back to 0% rather than erroring.
      });
  }, [router]);

  if (!hydrated) return null;

  const showLogbook = state.moduleChoice === "logbook" || state.moduleChoice === "both";
  const showProject = state.moduleChoice === "project" || state.moduleChoice === "both";

  return (
    <div>
      <h1 className="mb-1 font-slab text-2xl font-semibold text-ink">
        Welcome{state.profile.fullName ? `, ${state.profile.fullName.split(" ")[0]}` : ""}
      </h1>
      <p className="mb-8 text-ink/60">Here&apos;s where things stand.</p>

      <div className="grid gap-5 sm:grid-cols-2">
        {showLogbook && (
          <Card>
            <div className="mb-4 flex items-center gap-2 text-forest">
              <BookText size={18} />
              <span className="font-medium">IT/SIWES Logbook</span>
            </div>
            <ProgressRing percent={logbookPercent ?? 0} label="entries logged" />
            <Link href="/dashboard/logbook" className="focus-ring mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-forest">
              Open logbook <ArrowRight size={14} />
            </Link>
          </Card>
        )}

        {showProject && (
          <Card>
            <div className="mb-4 flex items-center gap-2 text-forest">
              <GraduationCap size={18} />
              <span className="font-medium">Final Year Project</span>
            </div>
            <ProgressRing percent={projectPercent} label="chapters done" />
            <Link href="/dashboard/project" className="focus-ring mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-forest">
              Open project <ArrowRight size={14} />
            </Link>
          </Card>
        )}

        {!showLogbook && !showProject && (
          <Card className="sm:col-span-2">
            <p className="text-ink/60">No module set up yet.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
