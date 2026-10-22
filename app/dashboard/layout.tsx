"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, BookText, FileText, GraduationCap, User, LogOut, ShieldCheck, CalendarDays } from "lucide-react";
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
  const [isAdmin, setIsAdmin] = useState(false);

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

  // The admin tabs come from the email allowlist. The "verify your email"
  // banner lives with the actions it blocks, not here, so a student never sees
  // two prompts for the same thing.
  useEffect(() => {
    if (!authorised) return;
    api
      .getMe()
      .then((me) => setIsAdmin(!!me.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [authorised]);

  function logout() {
    clearToken();
    router.replace("/login");
  }

  if (!hydrated || !authorised) return null;

  const navTabs = isAdmin
    ? [
        ...tabs,
        { href: "/dashboard/admin/topics", label: "Topic bank", icon: ShieldCheck },
        { href: "/dashboard/admin/holidays", label: "Holidays", icon: CalendarDays },
      ]
    : tabs;

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto flex max-w-5xl print:block print:max-w-none">
        {/* Tabbed index nav, styled like a logbook's edge tabs */}
        <nav className="sticky top-0 flex h-screen w-20 flex-col items-center gap-1 border-r border-line pt-8 print:hidden sm:w-56 sm:items-stretch sm:px-3">
          <div className="mb-8 hidden font-slab text-lg font-semibold text-forest sm:block sm:px-3">
            Logbook
          </div>
          {navTabs.map((tab) => {
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

        <main className="flex-1 px-6 py-10 print:p-0 sm:px-10">{children}</main>
      </div>
    </div>
  );
}
