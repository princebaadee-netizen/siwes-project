"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Card, FieldLabel, TextInput, Button } from "@/components/ui";
import { AttendancePicker } from "@/components/attendance-picker";
import {
  api,
  clearToken,
  getToken,
  formatNaira,
  formatKobo,
  ProjectTopic,
  SuggestedTopic,
  TopicSource,
  UsageSummary,
} from "@/lib/api";
import { applyProfile } from "@/lib/sync";
import { Weekday } from "@/lib/types";

type BackendModule = "LOGBOOK" | "PROJECT" | "BOTH";

const GENERATION_LABELS: Record<string, string> = {
  EXTRACTION: "Text extraction",
  BULK_LOGBOOK: "Logbook bulk fill-up",
  CHAPTER_DRAFT: "Chapter draft",
  SINGLE_DAY_POLISH: "Single-day polish",
  TOPIC_SUGGESTION: "Topic suggestions",
  REPORT_SECTION: "Report section",
};

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
  const [warning, setWarning] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
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

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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
  const [topicSource, setTopicSource] = useState<TopicSource>("MANUAL");

  // Topic bank
  const [showTopicBank, setShowTopicBank] = useState(false);
  const [topicFields, setTopicFields] = useState<string[]>([]);
  const [topicField, setTopicField] = useState("");
  const [topicQuery, setTopicQuery] = useState("");
  const [topics, setTopics] = useState<ProjectTopic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [suggestInterests, setSuggestInterests] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestedTopic[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedField, setSuggestedField] = useState("");

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

      const liveUsage = await api.getUsage().catch(() => null);
      if (liveUsage) setUsage(liveUsage);

      setFullName(me.fullName ?? "");
      setEmail(me.email ?? "");
      setSchool(me.school ?? "");
      setDepartment(me.department ?? "");
      setModuleChoice(me.moduleChoice ?? null);
      setPurchases(Array.isArray(me.purchases) ? me.purchases : []);
      setIsAdmin(!!me.isAdmin);

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
        setTopicSource(proj.topicSource ?? "MANUAL");
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

  // Load the bank's field list the first time the picker is opened.
  useEffect(() => {
    if (!showTopicBank || topicFields.length > 0) return;
    let ignore = false;
    api
      .listTopicFields()
      .catch(() => [])
      .then((fields) => {
        if (!ignore) setTopicFields(Array.isArray(fields) ? fields : []);
      });
    return () => {
      ignore = true;
    };
  }, [showTopicBank, topicFields.length]);

  // Fetch topics whenever the picker is open or its filters change.
  useEffect(() => {
    if (!showTopicBank) return;
    let ignore = false;
    setTopicsLoading(true);
    api
      .listTopics({ field: topicField || undefined, q: topicQuery.trim() || undefined })
      .catch(() => [])
      .then((list) => {
        if (!ignore) setTopics(Array.isArray(list) ? list : []);
      })
      .finally(() => {
        if (!ignore) setTopicsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [showTopicBank, topicField, topicQuery]);

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

  async function changePassword() {
    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("The new password needs at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords don't match.");
      return;
    }
    setSaving("password");
    setError(null);
    setSuccess(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      flash("Password changed.");
    } catch (err: any) {
      if (!handleAuthFailure(err)) setError(err?.message || "Could not change your password.");
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
    setWarning(null);
    try {
      const result = await api.createPlacement({
        companyName: companyName.trim(),
        companyAddress: companyAddress.trim() || undefined,
        industrySector: industrySector.trim() || undefined,
        startDate,
        endDate,
        daysPerWeek,
        attendancePattern,
      });
      setHasPlacement(true);
      const removed = result?.calendarRebuild?.removedEntries ?? 0;
      if (removed > 0) {
        // The rebuild keeps every day still on the pattern; only days that fell
        // off it are dropped, taking their entries with them. Say so, loudly.
        setWarning(
          `Placement saved, but ${removed} logbook ${
            removed === 1 ? "entry was" : "entries were"
          } removed because ${removed === 1 ? "its day is" : "those days are"} no longer on your attendance pattern.`
        );
      } else {
        flash("Placement saved and your attendance calendar rebuilt.");
      }
    } catch (err: any) {
      if (!handleAuthFailure(err)) setError(err?.message || "Could not save your placement.");
    } finally {
      setSaving(null);
    }
  }

  function chooseTopic(topic: ProjectTopic) {
    setProjectTitle(topic.title);
    setTopicSource("BANK");
    setShowTopicBank(false);
  }

  function chooseSuggestion(topic: SuggestedTopic) {
    setProjectTitle(topic.title);
    setTopicSource("AI_SUGGESTED");
    setShowTopicBank(false);
  }

  async function runSuggestTopics() {
    setSuggesting(true);
    setError(null);
    try {
      const result = await api.suggestTopics({
        field: topicField.trim() || undefined,
        interests: suggestInterests.trim() || undefined,
      });
      setSuggestions(result.topics);
      setSuggestedField(result.field);
    } catch (err: any) {
      if (!handleAuthFailure(err)) {
        setError(err?.message || "Could not get topic suggestions.");
      }
    } finally {
      setSuggesting(false);
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
        topicSource,
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
  // Admins skip the paywall server-side; show the passes as active so testing
  // matches what the API allows.
  if (isAdmin) {
    owned.add("IT_SIWES_PASS");
    owned.add("PROJECT_PASS");
    owned.add("BUNDLE");
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
      {warning && (
        <p className="rounded-md bg-gold/15 px-4 py-3 text-sm text-gold-dark">{warning}</p>
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
        <div>
          <h2 className="font-medium text-ink">Change password</h2>
          <p className="mt-1 text-sm text-ink/60">
            Enter your current password to confirm it&apos;s you.
          </p>
        </div>
        <div>
          <FieldLabel>Current password</FieldLabel>
          <TextInput
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Your current password"
          />
        </div>
        <div>
          <FieldLabel>New password</FieldLabel>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <FieldLabel>Confirm new password</FieldLabel>
          <TextInput
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat the new password"
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={changePassword} disabled={saving === "password"}>
            {saving === "password" && <Loader2 size={15} className="animate-spin" />}
            {saving === "password" ? "Changing..." : "Change password"}
          </Button>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium text-ink">What you&apos;re using</h2>
        <p className="text-sm text-ink/60">
          Switching modules keeps everything you&apos;ve already created.
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
              {topicSource === "BANK" && (
                <p className="text-xs font-medium text-forest">Picked from the topic bank</p>
              )}
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
                  onChange={(e) => {
                    setProjectTitle(e.target.value);
                    setTopicSource("MANUAL");
                  }}
                  placeholder="e.g. Design of an Online Result Checking System"
                />
                {topicSource === "BANK" && (
                  <p className="mt-1 text-xs font-medium text-forest">
                    Picked from the topic bank
                  </p>
                )}
                {topicSource === "AI_SUGGESTED" && (
                  <p className="mt-1 text-xs font-medium text-forest">AI-suggested topic</p>
                )}
              </div>

              <div className="rounded-lg border border-line bg-white/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink">Not settled on a topic?</p>
                    <p className="text-sm text-ink/60">
                      Browse the topic bank and pick one.
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setShowTopicBank((v) => !v)}>
                    {showTopicBank ? "Close" : "Browse topics"}
                  </Button>
                </div>

                {showTopicBank && (
                  <div className="mt-4 space-y-3 border-t border-line pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <FieldLabel>Field</FieldLabel>
                        <select
                          value={topicField}
                          onChange={(e) => setTopicField(e.target.value)}
                          className="focus-ring w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-ink"
                        >
                          <option value="">All fields</option>
                          {topicFields.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <FieldLabel>Search</FieldLabel>
                        <TextInput
                          value={topicQuery}
                          onChange={(e) => setTopicQuery(e.target.value)}
                          placeholder="e.g. attendance, phishing"
                        />
                      </div>
                    </div>

                    {topicsLoading ? (
                      <p className="flex items-center gap-2 text-sm text-ink/50">
                        <Loader2 size={14} className="animate-spin" /> Loading topics...
                      </p>
                    ) : topics.length === 0 ? (
                      <p className="text-sm text-ink/50">No topics match that search.</p>
                    ) : (
                      <ul className="max-h-80 space-y-2 overflow-y-auto">
                        {topics.map((topic) => (
                          <li key={topic.id}>
                            <button
                              type="button"
                              onClick={() => chooseTopic(topic)}
                              className="focus-ring w-full rounded-md border border-line bg-white p-3 text-left transition-colors hover:border-forest/40"
                            >
                              <span className="block font-medium text-ink">{topic.title}</span>
                              <span className="mt-0.5 block font-mono text-xs text-forest/70">
                                {topic.field}
                              </span>
                              {topic.description && (
                                <span className="mt-1 block text-sm text-ink/60">
                                  {topic.description}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="space-y-3 border-t border-line pt-4">
                      <div>
                        <p className="text-sm font-medium text-ink">Or let AI suggest topics</p>
                        <p className="text-sm text-ink/60">
                          Proposes a few ideas from {topicField ? `the ${topicField} field` : "your department"}.
                        </p>
                      </div>
                      <div>
                        <FieldLabel>Your interests (optional)</FieldLabel>
                        <TextInput
                          value={suggestInterests}
                          onChange={(e) => setSuggestInterests(e.target.value)}
                          placeholder="e.g. attendance tracking, machine learning"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-mono text-xs text-ink/40">
                          {suggestedField && suggestions.length > 0 ? `Field: ${suggestedField}` : ""}
                        </p>
                        <Button variant="outline" onClick={runSuggestTopics} disabled={suggesting}>
                          {suggesting ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Sparkles size={15} />
                          )}
                          {suggesting ? "Thinking..." : "Suggest topics"}
                        </Button>
                      </div>
                      {suggestions.length > 0 && (
                        <ul className="space-y-2">
                          {suggestions.map((t, i) => (
                            <li key={`${t.title}-${i}`}>
                              <button
                                type="button"
                                onClick={() => chooseSuggestion(t)}
                                className="focus-ring w-full rounded-md border border-gold/40 bg-gold/5 p-3 text-left transition-colors hover:border-gold"
                              >
                                <span className="block font-medium text-ink">{t.title}</span>
                                {t.description && (
                                  <span className="mt-1 block text-sm text-ink/60">
                                    {t.description}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <FieldLabel>Supervisor&apos;s name (optional)</FieldLabel>
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

      {usage && usage.totals.generations > 0 && (
        <Card className="space-y-4">
          <div>
            <h2 className="font-medium text-ink">AI usage</h2>
            <p className="mt-1 text-sm text-ink/60">
              How much AI drafting you&apos;ve used, with an estimated cost.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-line/15 px-3 py-2.5">
              <p className="font-slab text-xl font-semibold text-ink">
                {usage.totals.generations}
              </p>
              <p className="text-xs text-ink/50">generations</p>
            </div>
            <div className="rounded-lg bg-line/15 px-3 py-2.5">
              <p className="font-slab text-xl font-semibold text-ink">
                {usage.totals.tokens.toLocaleString("en-NG")}
              </p>
              <p className="text-xs text-ink/50">tokens</p>
            </div>
            <div className="rounded-lg bg-line/15 px-3 py-2.5">
              <p className="font-slab text-xl font-semibold text-ink">
                {formatKobo(usage.totals.costKobo)}
              </p>
              <p className="text-xs text-ink/50">est. cost</p>
            </div>
          </div>

          <ul className="divide-y divide-line">
            {usage.byType.map((row) => (
              <li key={row.type} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink">{GENERATION_LABELS[row.type] ?? row.type}</span>
                <span className="text-ink/60">
                  {row.generations} × · {row.tokens.toLocaleString("en-NG")} tokens ·{" "}
                  {formatKobo(row.costKobo)}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-ink/40">
            Costs are estimates based on token counts, not a bill.
          </p>
        </Card>
      )}
    </div>
  );
}
