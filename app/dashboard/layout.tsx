"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, BookText, FileText, GraduationCap, User, LogOut, MailWarning } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { api, clearToken, getToken } from "@/lib/api";
import { useAppStore } from "@/lib/store";

const tabs = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/logbook", label: "IT/SIWES", icon: BookText },
  { href: "/dashboard/project", label: "Project", icon: GraduationCap },
  { href: "/dashboard/report", label: "Report", icon: FileText },
  { href: "/dashboard/account", label: "Account", icon: User },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { hydrated } = useAppStore();
  const [authorised, setAuthorised] = useState(false);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);

  // Without a token the dashboard has nothing to show — every panel reads
  // from server data that would 401 — so send people to sign in first.
  useEffect(() => {
    if (!hydrated) return;
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setAuthorised(true);
  }, [hydrated, router]);

  // Drives the "verify your email" banner. Default to verified on error so a
  // transient fetch failure never nags someone who is already verified.
  useEffect(() => {
    if (!authorised) return;
    api
      .getMe()
      .then((me) => setEmailVerified(me.emailVerified ?? true))
      .catch(() => setEmailVerified(true));
  }, [authorised]);

  async function resend() {
    setResending(true);
    try {
      await api.resendVerification();
      setResent(true);
    } catch {
      // leave the banner up; the button stays available to retry
    } finally {
      setResending(false);
    }
  }

  function logout() {
    clearToken();
    router.replace("/login");
  }

  if (!hydrated || !authorised) return null;

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto flex max-w-5xl print:block print:max-w-none">
        {/* Tabbed index nav, styled like a logbook's edge tabs */}
        <nav className="sticky top-0 flex h-screen w-20 flex-col items-center gap-1 border-r border-line pt-8 print:hidden sm:w-56 sm:items-stretch sm:px-3">
          <div className="mb-8 hidden font-slab text-lg font-semibold text-forest sm:block sm:px-3">
            Logbook
          </div>
          {tabs.map((tab) => {
            const active = pathname === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`focus-ring flex items-center gap-3 rounded-l-md px-3 py-3 text-sm font-medium transition-colors sm:rounded-md ${
                  active
                    ? "bg-forest text-paper"
                    : "text-ink/60 hover:bg-forest/5 hover:text-ink"
                }`}
              >
                <Icon size={18} />
                <span className="hidden sm:inline">{tab.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={logout}
            className="focus-ring mt-auto mb-6 flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-ink/60 transition-colors hover:bg-rust/10 hover:text-rust"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </nav>

        <main className="flex-1 px-6 py-10 print:p-0 sm:px-10">
          {emailVerified === false && (
            <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-md border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink print:hidden">
              <span className="flex items-center gap-2">
                <MailWarning size={16} className="text-gold" />
                {resent
                  ? "Verification email sent — check your inbox."
                  : "Please verify your email address to secure your account."}
              </span>
              {!resent && (
                <button
                  type="button"
                  onClick={resend}
                  disabled={resending}
                  className="focus-ring font-medium text-forest underline decoration-forest/30 underline-offset-4 disabled:opacity-50"
                >
                  {resending ? "Sending..." : "Resend email"}
                </button>
              )}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
