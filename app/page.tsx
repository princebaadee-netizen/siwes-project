"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api";
import { useAppStore } from "@/lib/store";

export default function RootPage() {
  const router = useRouter();
  const { hydrated } = useAppStore();

  useEffect(() => {
    if (!hydrated) return;
    // The token is the real source of truth for "am I signed in". The
    // onboardingComplete flag used to stand in for it, which meant a
    // deleted account still sent people to the dashboard.
    router.replace(getToken() ? "/dashboard" : "/login");
  }, [hydrated, router]);

  return null;
}
