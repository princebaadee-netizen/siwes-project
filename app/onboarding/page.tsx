"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookText, GraduationCap, Layers, Loader2 } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { ModuleChoice } from "@/lib/types";
import { Button, Card, FieldLabel, StepProgress, TextInput } from "@/components/ui";
import { AttendancePicker } from "@/components/attendance-picker";
import { api, setToken } from "@/lib/api";

type StepId = "module" | "profile" | "account" | "placement" | "attendance" | "project" | "review";

export default function OnboardingPage() {
  const router = useRouter();
  const { state, setState } = useAppStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Flips once this wizard's signup succeeds, so a retry after a later
  // failure resumes the setup instead of re-running signup into a 409.
  const [accountCreated, setAccountCreated] = useState(false);
  const [emailConflict, setEmailConflict] = useState(false);

  const steps: StepId[] = useMemo(() => {
    const base: StepId[] = ["module", "profile", "account"];
    if (state.moduleChoice === "logbook" || state.moduleChoice === "both") {
      base.push("placement", "attendance");
    }
    if (state.moduleChoice === "project" || state.moduleChoice === "both") {
      base.push("project");
    }
    base.push("review");
    return base;
  }, [state.moduleChoice]);

  const step = steps[stepIndex];

  function next() {
    if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
  }
  function back() {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  const moduleChoiceToBackend: Record<ModuleChoice, "LOGBOOK" | "PROJECT" | "BOTH"> = {
    logbook: "LOGBOOK",
    project: "PROJECT",
    both: "BOTH",
  };

  async function finish() {
    setSubmitting(true);
    setError(null);
    setEmailConflict(false);
    try {
      // 1. Create the account — skipped when this wizard already signed up,
      // so a retry after a later failure doesn't die on the unique-email 409.
      if (!accountCreated) {
        const auth = await api.signup(state.profile.fullName, email, password);
        setToken(auth.accessToken);
        setAccountCreated(true);
      }

      // 2. Save profile details + which module(s) they chose
      if (state.moduleChoice) {
        await api.updateMe({
          school: state.profile.school,
          department: state.profile.department,
          moduleChoice: moduleChoiceToBackend[state.moduleChoice],
        });
      }

      // 3. Set up IT placement + generate the holiday-aware calendar, if relevant
      if (state.moduleChoice === "logbook" || state.moduleChoice === "both") {
        await api.createPlacement({
          companyName: state.placement.companyName,
          companyAddress: state.placement.companyAddress,
          industrySector: state.placement.industrySector,
          startDate: state.placement.startDate,
          endDate: state.placement.endDate,
          daysPerWeek: state.placement.daysPerWeek!,
          attendancePattern: state.placement.attendancePattern,
        });
      }

      // 4. Create the project (auto-generates the 5 chapters), if relevant.
      // Projects have no unique constraint per user, so a retry after a lost
      // response would duplicate it — reuse one that already exists.
      if (state.moduleChoice === "project" || state.moduleChoice === "both") {
        const existing = await api.getMyProjects().catch(() => []);
        if (!Array.isArray(existing) || existing.length === 0) {
          await api.createProject({
            title: state.project.title,
            supervisorName: state.project.supervisorName || undefined,
          });
        }
      }

      setState((prev) => ({ ...prev, onboardingComplete: true }));
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Something went wrong — please try again.");
      if (err?.status === 409) setEmailConflict(true);
    } finally {
      setSubmitting(false);
    }
  }

  const canProceed = useMemo(() => {
    switch (step) {
      case "module":
        return state.moduleChoice !== null;
      case "profile":
        return !!(state.profile.fullName.trim() && state.profile.school.trim() && state.profile.department.trim());
      case "account":
        return !!(email.trim() && password.length >= 8);
      case "placement":
        return !!(state.placement.companyName.trim() && state.placement.startDate && state.placement.endDate);
      case "attendance":
        return (
          state.placement.daysPerWeek !== null &&
          state.placement.attendancePattern.length === state.placement.daysPerWeek
        );
      case "project":
        return state.project.title.trim().length > 0;
      default:
        return true;
    }
  }, [step, state, email, password]);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-14">
      <div className="mb-10">
        <p className="mb-2 font-mono text-xs uppercase tracking-wide text-forest/70">
          Step {stepIndex + 1} of {steps.length}
        </p>
        <StepProgress current={stepIndex} total={steps.length} />
      </div>

      {step === "module" && ModuleStep()}
      {step === "profile" && ProfileStep()}
      {step === "account" && AccountStep()}
      {step === "placement" && PlacementStep()}
      {step === "attendance" && AttendanceStep()}
      {step === "project" && ProjectStep()}
      {step === "review" && ReviewStep()}
      {error && (
        <p className="mt-6 rounded-md bg-rust/10 px-4 py-3 text-sm text-rust">{error}</p>
      )}
      {emailConflict && (
        <p className="mt-3 text-sm text-ink/60">
          An account with this email already exists.{" "}
          <Link
            href="/login"
            className="focus-ring font-medium text-forest underline decoration-forest/30 underline-offset-4"
          >
            Sign in
          </Link>{" "}
          to finish setting up — your progress on this page is saved.
        </p>
      )}

      <div className="mt-10 flex items-center justify-between">
        <Button variant="ghost" onClick={back} disabled={stepIndex === 0 || submitting}>
          Back
        </Button>
        {step === "review" ? (
          <Button onClick={finish} disabled={submitting}>
            {submitting && <Loader2 size={15} className="animate-spin" />}
            {submitting ? "Setting up..." : "Go to dashboard"}
          </Button>
        ) : (
          <Button onClick={next} disabled={!canProceed}>
            Continue
          </Button>
        )}
      </div>
    </main>
  );

  function ModuleStep() {
    const options: { id: ModuleChoice; title: string; desc: string; icon: JSX.Element }[] = [
      { id: "logbook", title: "IT/SIWES logbook only", desc: "Fill your logbook and write your SIWES report.", icon: <BookText size={20} /> },
      { id: "project", title: "Final year project only", desc: "Write and organize your project chapters.", icon: <GraduationCap size={20} /> },
      { id: "both", title: "Both", desc: "IT/SIWES logbook and final year project.", icon: <Layers size={20} /> },
    ];
    return (
      <div>
        <h1 className="mb-2 font-slab text-2xl font-semibold text-ink">What do you need help with?</h1>
        <p className="mb-6 text-ink/60">You can always add the other one later from your dashboard.</p>
        <div className="space-y-3">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setState((prev) => ({ ...prev, moduleChoice: opt.id }))}
              className={`focus-ring flex w-full items-start gap-4 rounded-lg border p-4 text-left transition-colors ${
                state.moduleChoice === opt.id ? "border-forest bg-forest/5" : "border-line bg-white hover:border-forest/40"
              }`}
            >
              <span className="mt-0.5 text-forest">{opt.icon}</span>
              <span>
                <span className="block font-medium text-ink">{opt.title}</span>
                <span className="block text-sm text-ink/60">{opt.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function ProfileStep() {
    return (
      <div>
        <h1 className="mb-2 font-slab text-2xl font-semibold text-ink">A bit about you</h1>
        <p className="mb-6 text-ink/60">This appears on your printed logbook/report cover pages.</p>
        <div className="space-y-4">
          <div>
            <FieldLabel>Full name</FieldLabel>
            <TextInput
              value={state.profile.fullName}
              onChange={(e) => setState((prev) => ({ ...prev, profile: { ...prev.profile, fullName: e.target.value } }))}
              placeholder="e.g. Chidinma Okafor"
            />
          </div>
          <div>
            <FieldLabel>School</FieldLabel>
            <TextInput
              value={state.profile.school}
              onChange={(e) => setState((prev) => ({ ...prev, profile: { ...prev.profile, school: e.target.value } }))}
              placeholder="e.g. Rivers State University"
            />
          </div>
          <div>
            <FieldLabel>Department</FieldLabel>
            <TextInput
              value={state.profile.department}
              onChange={(e) => setState((prev) => ({ ...prev, profile: { ...prev.profile, department: e.target.value } }))}
              placeholder="e.g. Computer Science"
            />
          </div>
        </div>
      </div>
    );
  }

  function AccountStep() {
    return (
      <div>
        <h1 className="mb-2 font-slab text-2xl font-semibold text-ink">Create your account</h1>
        <p className="mb-6 text-ink/60">Just you — no school or supervisor accounts involved.</p>
        <div className="space-y-4">
          <div>
            <FieldLabel>Email</FieldLabel>
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <FieldLabel>Password</FieldLabel>
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <p className="text-sm text-ink/60">
            Already have an account?{" "}
            <Link
              href="/login"
              className="focus-ring font-medium text-forest underline decoration-forest/30 underline-offset-4"
            >
              Sign in
            </Link>{" "}
            instead — you can finish setting up from your dashboard.
          </p>
        </div>
      </div>
    );
  }

  function PlacementStep() {
    return (
      <div>
        <h1 className="mb-2 font-slab text-2xl font-semibold text-ink">Your IT placement</h1>
        <p className="mb-6 text-ink/60">Used to build your logbook calendar.</p>
        <div className="space-y-4">
          <div>
            <FieldLabel>Company name</FieldLabel>
            <TextInput
              value={state.placement.companyName}
              onChange={(e) => setState((prev) => ({ ...prev, placement: { ...prev.placement, companyName: e.target.value } }))}
              placeholder="e.g. Zenith Bank Plc"
            />
          </div>
          <div>
            <FieldLabel>Company address</FieldLabel>
            <TextInput
              value={state.placement.companyAddress}
              onChange={(e) => setState((prev) => ({ ...prev, placement: { ...prev.placement, companyAddress: e.target.value } }))}
              placeholder="e.g. Port Harcourt, Rivers State"
            />
          </div>
          <div>
            <FieldLabel>Industry sector</FieldLabel>
            <TextInput
              value={state.placement.industrySector}
              onChange={(e) => setState((prev) => ({ ...prev, placement: { ...prev.placement, industrySector: e.target.value } }))}
              placeholder="e.g. Banking & Finance"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Start date</FieldLabel>
              <TextInput
                type="date"
                value={state.placement.startDate}
                onChange={(e) => setState((prev) => ({ ...prev, placement: { ...prev.placement, startDate: e.target.value } }))}
              />
            </div>
            <div>
              <FieldLabel>End date</FieldLabel>
              <TextInput
                type="date"
                value={state.placement.endDate}
                onChange={(e) => setState((prev) => ({ ...prev, placement: { ...prev.placement, endDate: e.target.value } }))}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  function AttendanceStep() {
    return (
      <div>
        <h1 className="mb-2 font-slab text-2xl font-semibold text-ink">Your attendance pattern</h1>
        <p className="mb-6 text-ink/60">We'll only build logbook entries for the days you actually attend.</p>
        <AttendancePicker
          daysPerWeek={state.placement.daysPerWeek}
          selected={state.placement.attendancePattern}
          onChangeDaysPerWeek={(n) => setState((prev) => ({ ...prev, placement: { ...prev.placement, daysPerWeek: n } }))}
          onChangeSelected={(days) => setState((prev) => ({ ...prev, placement: { ...prev.placement, attendancePattern: days } }))}
        />
      </div>
    );
  }

  function ProjectStep() {
    return (
      <div>
        <h1 className="mb-2 font-slab text-2xl font-semibold text-ink">Your final year project</h1>
        <p className="mb-6 text-ink/60">Not settled on a topic yet? You can pick one from the topic bank later.</p>
        <div className="space-y-4">
          <div>
            <FieldLabel>Project title / topic</FieldLabel>
            <TextInput
              value={state.project.title}
              onChange={(e) => setState((prev) => ({ ...prev, project: { ...prev.project, title: e.target.value } }))}
              placeholder="e.g. Design of an Online Result Checking System"
            />
          </div>
          <div>
            <FieldLabel>Supervisor's name (optional, for your cover page)</FieldLabel>
            <TextInput
              value={state.project.supervisorName}
              onChange={(e) => setState((prev) => ({ ...prev, project: { ...prev.project, supervisorName: e.target.value } }))}
              placeholder="e.g. Dr. A. B. Wokoma"
            />
          </div>
        </div>
      </div>
    );
  }

  function ReviewStep() {
    return (
      <div>
        <h1 className="mb-2 font-slab text-2xl font-semibold text-ink">You're all set</h1>
        <p className="mb-6 text-ink/60">Here's what we've got. You can edit any of this later in Account.</p>
        <Card className="space-y-3 font-mono text-sm">
          <Row label="Name" value={state.profile.fullName} />
          <Row label="Email" value={email} />
          <Row label="School" value={state.profile.school} />
          <Row label="Department" value={state.profile.department} />
          {(state.moduleChoice === "logbook" || state.moduleChoice === "both") && (
            <>
              <Row label="Company" value={state.placement.companyName} />
              <Row label="Duration" value={`${state.placement.startDate || "—"} → ${state.placement.endDate || "—"}`} />
              <Row label="Attendance" value={`${state.placement.attendancePattern.length}x/week`} />
            </>
          )}
          {(state.moduleChoice === "project" || state.moduleChoice === "both") && (
            <Row label="Project" value={state.project.title} />
          )}
        </Card>
      </div>
    );
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-ink/50">{label}</span>
      <span className="text-ink">{value || "—"}</span>
    </div>
  );
}
