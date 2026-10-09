"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Card, FieldLabel, TextInput, Button } from "@/components/ui";
import { AttendancePicker } from "@/components/attendance-picker";
import { api, clearToken, getToken, formatNaira } from "@/lib/api";
import { applyProfile } from "@/lib/sync";
import { Weekday } from "@/lib/types";

type BackendModule = "LOGBOOK" | "PROJECT" | "BOTH";

const MODULE_OPTIONS: { id: BackendModule; title: string; desc: string }[] = [
  { id: "LOGBOOK", title: "IT/SIWES logbook only", desc: "Fill your logbook and write your SIWES report." },
  { id: "PROJECT", title: "Final year project only", desc: "Write and organize your project chapters." },
  { id: "BOTH", title: "Both", desc: "IT/SIWES logbook and final year project." },
];

function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export default function AccountPage() {
  const router = useRouter();
  const { setState, hydrated } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [prices, setPrices] = useState({
    IT_SIWES_PASS: 10_000,
    PROJECT_PASS: 20_000,
    BUNDLE: 27_000,
  });

  // Profile
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [school, setSchool] = useState("");
  const [department, setDepartment] = useState("");

  // Module
  const [moduleChoice, setModuleChoice] = useState<BackendModule | null>(null);

  // IT placement
  const [hasPlacement, setHasPlacement] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [industrySector, setIndustrySector] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(null);
  const [attendancePattern, setAttendancePattern] = useState<Weekday[]>([]);

  // Final year project
  const [hasProject, setHasProject] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [supervisorName, setSupervisorName] = useState("");

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
      const me = await api.getMe();
      setState((prev) => applyProfile(prev, me));
      const livePrices = await api.getPrices().catch(() => null);
      if (livePrices) setPrices(livePrices);

      setFullName(me.fullName ?? "");
      setEmail(me.email ?? "");
      setSchool(me.school ?? "");
      setDepartment(me.department ?? "");
      setModuleChoice(me.moduleChoice ?? null);
      setPurchases(Array.isArray(me.purchases) ? me.purchases : []);

      const p = me.itPlacement;
      if (p) {
        setHasPlacement(true);
        setCompanyName(p.companyName ?? "");
        setCompanyAddress(p.companyAddress ?? "");
        setIndustrySector(p.industrySector ?? "");
        setStartDate(toDateInput(p.startDate));
        setEndDate(toDateInput(p.endDate));
        setDaysPerWeek(p.daysPerWeek ?? null);
        setAttendancePattern(((p.attendancePattern ?? []) as Weekday[]).slice());
      }

      const proj = Array.isArray(me.projects) ? me.projects[0] : null;
      if (proj) {
        setHasProject(true);
        setProjectTitle(proj.title ?? "");
        setSupervisorName(proj.supervisorName ?? "");
      }
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not load your account.");
      }
    } finally {
      setLoading(false);
    }
  }, [handleAuthFailure, setState]);

  useEffect(() => {
    if (hydrated) load();
  }, [hydrated, load]);

  // Paystack redirects back here with ?reference=/ ?trxref= after checkout.
  // Verify it server-side, refresh the account, then strip the query string so
  // a reload doesn't re-run the verification.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") ?? params.get("trxref");
    if (!reference) return;
    window.history.replaceState({}, "", "/dashboard/account");
    (async () => {
      try {
        await api.verifyPayment(reference);
        flash("Payment confirmed — your pass is active.");
        await load();
      } catch (err: any) {
        if (!handleAuthFailure(err)) {
          setError(err?.message || "We couldn't confirm that payment.");
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, load, handleAuthFailure]);

  function flash(message: string) {
    setSuccess(message);
    setError(null);
  }

  async function buyPass(productType: "IT_SIWES_PASS" | "PROJECT_PASS" | "BUNDLE") {
    setBuying(productType);
    setError(null);
    setSuccess(null);
    try {
      const res = await api.initializePayment(productType);
      if (res?.authorizationUrl) {
        window.location.href = res.authorizationUrl;
        return;
      }
      // Dev mode (no Paystack keys): the pass is granted immediately server-side.
      await load();
      flash("Pass activated (dev mode).");
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not start the payment.");
      }
    } finally {
      setBuying(null);
    }
  }

  async function saveProfile() {
    if (!fullName.trim()) {
      setError("Enter your full name.");
      return;
    }
    setSaving("profile");
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.updateMe({
        fullName: fullName.trim(),
        school: school.trim(),
        department: department.trim(),
      });
      setState((prev) => applyProfile(prev, updated));
      flash("Profile saved.");
    } catch (err: any) {
      if (!handleAuthFailure(err)) setError(err?.message || "Could not save your profile.");
    } finally {
      setSaving(null);
    }
  }

  async function saveModule() {
    if (!moduleChoice) return;
    setSaving("module");
    setError(null);
    setSuccess(null);
    try {
      const updated = await api.updateMe({ moduleChoice });
      setState((prev) => applyProfile(prev, updated));
      flash("Module preference saved.");
    } catch (err: any) {
      if (!handleAuthFailure(err)) setError(err?.message || "Could not save your module choice.");
    } finally {
      setSaving(null);
    }
  }

  async function savePlacement() {
    if (
      !companyName.trim() ||
      !startDate ||
      !endDate ||
      daysPerWeek === null ||
      attendancePattern.length !== daysPerWeek
    ) {
      setError("Fill in the company, dates, and pick exactly the days you attend.");
      return;
    }
    setSaving("placement");
    setError(null);
    setSuccess(null);
    try {
      await api.createPlacement({
        companyName: companyName.trim(),
        companyAddress: companyAddress.trim() || undefined,
        industrySector: industrySector.trim() || undefined,
        startDate,
        endDate,
        daysPerWeek,
        attendancePattern,
      });
      setHasPlacement(true);
      flash("Placement saved and your attendance calendar rebuilt.");
    } catch (err: any) {
      if (!handleAuthFailure(err)) setError(err?.message || "Could not save your placement.");
    } finally {
      setSaving(null);
    }
  }

  async function saveProject() {
    if (!projectTitle.trim()) {
      setError("Enter a project title.");
      return;
    }
    setSaving("project");
    setError(null);
    setSuccess(null);
    try {
      await api.createProject({
        title: projectTitle.trim(),
        supervisorName: supervisorName.trim() || undefined,
      });
      setHasProject(true);
      flash("Project saved.");
    } catch (err: any) {
      if (!handleAuthFailure(err)) setError(err?.message || "Could not save your project.");
    } finally {
      setSaving(null);
    }
  }

  if (!hydrated) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink/50">
        <Loader2 size={15} className="animate-spin" /> Loading your account...
      </div>
    );
  }

  const needsPlacement = moduleChoice === "LOGBOOK" || moduleChoice === "BOTH";
  const needsProject = moduleChoice === "PROJECT" || moduleChoice === "BOTH";

  // A successful bundle grants both passes, so fold it into the individual ones.
  const owned = new Set<string>();
  for (const p of purchases) {
    if (p.status !== "SUCCESSFUL") continue;
    owned.add(p.productType);
    if (p.productType === "BUNDLE") {
      owned.add("IT_SIWES_PASS");
      owned.add("PROJECT_PASS");
    }
  }

  return (
      <div className="max-w-xl space-y-6">
      <div>
        <h1 className="mb-1 font-slab text-2xl font-semibold text-ink">Account</h1>
        <p className="text-ink/60">Edit the details you gave during setup.</p>
      </div>

      {success && (
        <p className="flex items-center gap-2 rounded-md bg-forest/10 px-4 py-3 text-sm text-forest">
          <CheckCircle2 size={15} /> {success}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-rust/10 px-4 py-3 text-sm text-rust">{error}</p>
      )}

      <Card className="space-y-4">
        <h2 className="font-medium text-ink">Profile</h2>
        <div>
          <FieldLabel>Full name</FieldLabel>
          <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Email</FieldLabel>
          <TextInput value={email} readOnly className="bg-line/20 text-ink/60" />
        </div>
        <div>
          <FieldLabel>School</FieldLabel>
          <TextInput value={school} onChange={(e) => setSchool(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Department</FieldLabel>
          <TextInput value={department} onChange={(e) => setDepartment(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <Button onClick={saveProfile} disabled={saving === "profile"}>
            {saving === "profile" && <Loader2 size={15} className="animate-spin" />}
            {saving === "profile" ? "Saving..." : "Save profile"}
          </Button>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium text-ink">What you're using</h2>
        <p className="text-sm text-ink/60">
          Switching modules keeps everything you've already created.
        </p>
        <div className="space-y-3">
          {MODULE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setModuleChoice(opt.id)}
              className={`focus-ring flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                moduleChoice === opt.id
                  ? "border-forest bg-forest/5"
                  : "border-line bg-white hover:border-forest/40"
              }`}
            >
              <span>
                <span className="block font-medium text-ink">{opt.title}</span>
                <span className="block text-sm text-ink/60">{opt.desc}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={saveModule} disabled={saving === "module" || !moduleChoice}>
            {saving === "module" && <Loader2 size={15} className="animate-spin" />}
            {saving === "module" ? "Saving..." : "Save modules"}
          </Button>
        </div>
      </Card>

      {needsPlacement && (
        <Card className="space-y-4">
          <div>
            <h2 className="font-medium text-ink">
              {hasPlacement ? "IT placement" : "Set up your IT placement"}
            </h2>
            <p className="mt-1 text-sm text-ink/60">
              Used to build your logbook calendar.
            </p>
          </div>

          {hasPlacement && (
            <p className="rounded-md bg-gold/15 px-3.5 py-2.5 text-sm text-gold-dark">
              Saving rebuilds your attendance calendar from scratch. Existing logbook
              entries on days that change may be affected.
            </p>
          )}

          <div>
            <FieldLabel>Company name</FieldLabel>
            <TextInput
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Zenith Bank Plc"
            />
          </div>
          <div>
            <FieldLabel>Company address</FieldLabel>
            <TextInput
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              placeholder="e.g. Port Harcourt, Rivers State"
            />
          </div>
          <div>
            <FieldLabel>Industry sector</FieldLabel>
            <TextInput
              value={industrySector}
              onChange={(e) => setIndustrySector(e.target.value)}
              placeholder="e.g. Banking & Finance"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Start date</FieldLabel>
              <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <FieldLabel>End date</FieldLabel>
              <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <FieldLabel>Attendance pattern</FieldLabel>
            <AttendancePicker
              daysPerWeek={daysPerWeek}
              selected={attendancePattern}
              onChangeDaysPerWeek={(n) => {
                setDaysPerWeek(n);
                setAttendancePattern([]);
              }}
              onChangeSelected={setAttendancePattern}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={savePlacement} disabled={saving === "placement"}>
              {saving === "placement" && <Loader2 size={15} className="animate-spin" />}
              {saving === "placement" ? "Saving..." : hasPlacement ? "Save placement" : "Create placement"}
            </Button>
          </div>
        </Card>
      )}

      {needsProject && (
        <Card className="space-y-4">
          <h2 className="font-medium text-ink">Final year project</h2>
          {hasProject ? (
            <div className="space-y-1">
              <p className="text-ink">{projectTitle}</p>
              <p className="text-sm text-ink/60">
                Supervisor: {supervisorName || "—"}
              </p>
              <p className="pt-2 text-sm text-ink/50">
                View your chapters and track progress on the Project tab.
              </p>
            </div>
          ) : (
            <>
              <div>
                <FieldLabel>Project title / topic</FieldLabel>
                <TextInput
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="e.g. Design of an Online Result Checking System"
                />
              </div>
              <div>
                <FieldLabel>Supervisor's name (optional)</FieldLabel>
                <TextInput
                  value={supervisorName}
                  onChange={(e) => setSupervisorName(e.target.value)}
                  placeholder="e.g. Dr. A. B. Wokoma"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={saveProject} disabled={saving === "project"}>
                  {saving === "project" && <Loader2 size={15} className="animate-spin" />}
                  {saving === "project" ? "Saving..." : "Create project"}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      <Card>
        <h2 className="mb-1 font-medium text-ink">Passes</h2>
        <p className="mb-4 text-sm text-ink/60">One-time purchases — no recurring billing.</p>
        {(
          [
            { type: "IT_SIWES_PASS", label: "IT/SIWES Pass" },
            { type: "PROJECT_PASS", label: "Final Year Project Pass" },
            { type: "BUNDLE", label: "Bundle — both passes" },
          ] as const
        ).map((item) => {
          const isOwned = owned.has(item.type);
          const isBuying = buying === item.type;
          return (
            <div
              key={item.type}
              className="flex items-center justify-between border-b border-line py-3 last:border-b-0"
            >
              <span className="text-sm text-ink">
                {item.label} — {formatNaira(prices[item.type])}
              </span>
              {isOwned ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-forest">
                  <CheckCircle2 size={15} /> Active
                </span>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => buyPass(item.type)}
                  disabled={buying !== null}
                >
                  {isBuying ? "Starting..." : "Buy"}
                </Button>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
