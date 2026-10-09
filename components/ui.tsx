"use client";

import { ReactNode, ButtonHTMLAttributes } from "react";

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors focus-ring disabled:opacity-40 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-forest text-paper hover:bg-forest-light",
    outline: "border border-forest text-forest hover:bg-forest/5",
    ghost: "text-forest hover:bg-forest/5",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-white/60 p-6 ${className}`}>
      {children}
    </div>
  );
}

export function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full ${i <= current ? "bg-forest" : "bg-line"}`}
        />
      ))}
    </div>
  );
}

export function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div className="flex items-center gap-4">
      <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
        <circle cx="42" cy="42" r={r} stroke="#E4DECE" strokeWidth="8" fill="none" />
        <circle
          cx="42"
          cy="42"
          r={r}
          stroke="#C89B3C"
          strokeWidth="8"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div>
        <div className="font-mono text-2xl text-ink">{percent}%</div>
        <div className="text-sm text-ink/60">{label}</div>
      </div>
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-sm font-medium text-ink/80">{children}</label>;
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`focus-ring w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-ink placeholder:text-ink/35 ${props.className ?? ""}`}
    />
  );
}
