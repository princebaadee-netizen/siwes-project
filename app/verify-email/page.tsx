"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";

type State = "verifying" | "done" | "error";

export default function VerifyEmailPage() {
  const [state, setState] = useState<State>("verifying");
  const [message, setMessage] = useState("");
  // The request must fire once, not on every re-render.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setState("error");
      setMessage("This verification link is missing its token.");
      return;
    }

    api
      .verifyEmail(token)
      .then(() => {
        setState("done");
        setMessage("Your email address is verified.");
      })
      .catch((err: any) => {
        setState("error");
        setMessage(err?.message || "This verification link is invalid or has expired.");
      });
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-14">
      <div className="mb-8">
        <p className="mb-2 font-mono text-xs uppercase tracking-wide text-forest/70">Account</p>
        <h1 className="font-slab text-2xl font-semibold text-ink">Email verification</h1>
      </div>

      {state === "verifying" && (
        <p className="flex items-center gap-2 text-sm text-ink/60">
          <Loader2 size={15} className="animate-spin" /> Verifying your email...
        </p>
      )}

      {state === "done" && (
        <p className="rounded-md bg-forest/10 px-4 py-3 text-sm text-forest">{message}</p>
      )}

      {state === "error" && (
        <p className="rounded-md bg-rust/10 px-4 py-3 text-sm text-rust">{message}</p>
      )}

      <div className="mt-8 flex items-center gap-6">
        <Link
          href="/dashboard"
          className="focus-ring text-sm font-medium text-forest underline decoration-forest/30 underline-offset-4"
        >
          Go to dashboard
        </Link>
        <Link
          href="/login"
          className="focus-ring text-sm font-medium text-forest underline decoration-forest/30 underline-offset-4"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
