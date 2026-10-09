"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button, FieldLabel, TextInput } from "@/components/ui";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.forgotPassword(email.trim());
      setMessage(res.message);
      setDevLink(res.devResetUrl ?? null);
    } catch (err: any) {
      setError(err?.message || "Could not send the reset link. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-14">
      <div className="mb-10">
        <p className="mb-2 font-mono text-xs uppercase tracking-wide text-forest/70">Account</p>
        <h1 className="font-slab text-2xl font-semibold text-ink">Reset your password</h1>
        <p className="mt-2 text-sm text-ink/60">
          Enter the email you signed up with and we&apos;ll send you a reset link.
        </p>
      </div>

      {message ? (
        <div className="space-y-4">
          <p className="rounded-md bg-forest/10 px-4 py-3 text-sm text-forest">{message}</p>
          {devLink && (
            <div className="rounded-md border border-forest/20 bg-forest/5 px-4 py-3 text-sm">
              <p className="mb-1 font-medium text-ink">No mail provider configured (dev mode).</p>
              <a
                href={devLink}
                className="break-all font-medium text-forest underline decoration-forest/30 underline-offset-4"
              >
                Open your reset link
              </a>
            </div>
          )}
          <Link
            href="/login"
            className="focus-ring inline-block text-sm font-medium text-forest underline decoration-forest/30 underline-offset-4"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <div>
            <FieldLabel>Email</FieldLabel>
            <TextInput
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          {error && <p className="mt-6 rounded-md bg-rust/10 px-4 py-3 text-sm text-rust">{error}</p>}

          <div className="mt-8 flex items-center justify-between">
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 size={15} className="animate-spin" />}
              {submitting ? "Sending..." : "Send reset link"}
            </Button>
            <Link
              href="/login"
              className="focus-ring text-sm font-medium text-forest underline decoration-forest/30 underline-offset-4"
            >
              Back to sign in
            </Link>
          </div>
        </form>
      )}
    </main>
  );
}
