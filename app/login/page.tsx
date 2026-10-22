"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Card, FieldLabel, TextInput } from "@/components/ui";
import { api, getToken, setToken } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { applyProfile } from "@/lib/sync";

export default function LoginPage() {
  const router = useRouter();
  const { setState, hydrated } = useAppStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Someone who already has a token has no business on this page.
  useEffect(() => {
    if (hydrated && getToken()) router.replace("/dashboard");
  }, [hydrated, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setSubmitting(true);
    try {
      const auth = await api.login(email.trim(), password);
      setToken(auth.accessToken);

      // Pull the server record into the local cache. On a fresh browser
      // localStorage is empty, and the dashboard renders from that cache —
      // without this a returning student sees a blank dashboard.
      try {
        const me = await api.getMe();
        setState((prev) => applyProfile(prev, me));
      } catch {
        // Login succeeded; a failed profile fetch shouldn't block entry.
      }

      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Could not sign you in. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-14">
      <div className="mb-10">
        <p className="mb-2 font-mono text-xs uppercase tracking-wide text-forest/70">Welcome back</p>
        <h1 className="font-slab text-2xl font-semibold text-ink">Sign in to your account</h1>
      </div>

      <form onSubmit={submit} noValidate>
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="login-email">Email</FieldLabel>
            <TextInput
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <FieldLabel htmlFor="login-password">Password</FieldLabel>
            <TextInput
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
            />
          </div>
          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="focus-ring text-sm font-medium text-forest underline decoration-forest/30 underline-offset-4"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        {error && (
          <p className="mt-6 rounded-md bg-rust/10 px-4 py-3 text-sm text-rust">{error}</p>
        )}

        <div className="mt-8 flex items-center justify-between">
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 size={15} className="animate-spin" />}
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
          <Link href="/onboarding" className="focus-ring text-sm font-medium text-forest underline decoration-forest/30 underline-offset-4">
            Create an account
          </Link>
        </div>
      </form>
    </main>
  );
}
