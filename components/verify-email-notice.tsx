"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Shown in place of a paid action while the account's email address is
 * unconfirmed. The backend refuses those requests, so the point of this is
 * to say why *before* the student clicks, and to make resending the
 * verification email one click away.
 */
export function VerifyEmailNotice({
  className = "",
  message = "Verify your email address to unlock AI features and buying a pass.",
  onVerified,
}: {
  className?: string;
  message?: string;
  onVerified?: () => void;
}) {
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kept in a ref so the focus listener below can be registered once instead
  // of on every render of the parent.
  const onVerifiedRef = useRef(onVerified);
  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  // The student normally clicks the link in another tab, so the page they come
  // back to still believes the address is unconfirmed. Re-check when the tab
  // regains focus and step aside once the server agrees.
  useEffect(() => {
    function recheck() {
      api
        .getMe()
        .then((me) => {
          if (!me.emailGateActive) {
            setSent(true);
            onVerifiedRef.current?.();
          }
        })
        .catch(() => {
          // A failed check keeps the notice up; the next focus will retry.
        });
    }
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, []);

  async function resend() {
    setResending(true);
    setError(null);
    try {
      await api.resendVerification();
      setSent(true);
    } catch (err: any) {
      setError(err?.message || "Could not send the verification email.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink ${className}`}
    >
      <span className="flex items-center gap-2">
        {sent ? (
          <CheckCircle2 size={16} className="text-forest" />
        ) : (
          <MailWarning size={16} className="text-gold" />
        )}
        {sent ? "Verification email sent — check your inbox." : message}
      </span>
      {!sent && (
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="focus-ring font-medium text-forest underline decoration-forest/30 underline-offset-4 disabled:opacity-50"
        >
          {resending ? "Sending..." : "Resend email"}
        </button>
      )}
      {error && <span className="w-full text-rust">{error}</span>}
    </div>
  );
}
