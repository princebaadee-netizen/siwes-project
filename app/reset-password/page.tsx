"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button, FieldLabel, TextInput } from "@/components/ui";
import { api } from "@/lib/api";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The token arrives in the query string; read it on the client to avoid a
  // server/client hydration mismatch.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
    setReady(true);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err: any) {
      setError(err?.message || "Could not reset your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-14">
      <div className="mb-10">
        <p className="mb-2 font-mono text-xs uppercase tracking-wide text-forest/70">Account</p>
        <h1 className="font-slab text-2xl font-semibold text-ink">Choose a new password</h1>
      </div>

      {!token ? (
        <div className="space-y-4">
          <p className="rounded-md bg-rust/10 px-4 py-3 text-sm text-rust">
            This reset link is missing its token. Request a new one.
          </p>
          <Link
            href="/forgot-password"
            className="focus-ring inline-block text-sm font-medium text-forest underline decoration-forest/30 underline-offset-4"
          >
            Request a new link
          </Link>
        </div>
      ) : done ? (
        <div className="space-y-4">
          <p className="rounded-md bg-forest/10 px-4 py-3 text-sm text-forest">
            Your password has been updated. You can sign in with it now.
          </p>
          <Link
            href="/login"
            className="focus-ring inline-block text-sm font-medium text-forest underline decoration-forest/30 underline-offset-4"
          >
            Go to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="space-y-4">
            <div>
              <FieldLabel>New password</FieldLabel>
              <TextInput
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <FieldLabel>Confirm new password</FieldLabel>
              <TextInput
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat your password"
              />
            </div>
          </div>

          {error && <p className="mt-6 rounded-md bg-rust/10 px-4 py-3 text-sm text-rust">{error}</p>}

          <div className="mt-8">
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 size={15} className="animate-spin" />}
              {submitting ? "Updating..." : "Update password"}
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
