"use client";

import { useMemo } from "react";
import { Weekday, WEEKDAYS } from "@/lib/types";

interface Props {
  daysPerWeek: number | null;
  selected: Weekday[];
  onChangeDaysPerWeek: (n: number) => void;
  onChangeSelected: (days: Weekday[]) => void;
}

export function AttendancePicker({ daysPerWeek, selected, onChangeDaysPerWeek, onChangeSelected }: Props) {
  const straightRunPreset: Weekday[] = useMemo(() => {
    if (!daysPerWeek) return [];
    return WEEKDAYS.slice(0, daysPerWeek).map((d) => d.key);
  }, [daysPerWeek]);

  const isOverLimit = daysPerWeek !== null && selected.length > daysPerWeek;
  const isUnderLimit = daysPerWeek !== null && selected.length < daysPerWeek;

  function toggleDay(day: Weekday) {
    if (daysPerWeek === null) return;
    if (selected.includes(day)) {
      onChangeSelected(selected.filter((d) => d !== day));
    } else {
      if (selected.length >= daysPerWeek) return; // enforce exact count
      onChangeSelected([...selected, day]);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-sm font-medium text-ink/80">
          How many days a week do you go for IT?
        </div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                onChangeDaysPerWeek(n);
                onChangeSelected([]);
              }}
              className={`focus-ring h-11 w-11 rounded-md border font-mono text-base transition-colors ${
                daysPerWeek === n
                  ? "border-forest bg-forest text-paper"
                  : "border-line bg-white text-ink hover:border-forest/50"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {daysPerWeek !== null && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-ink/80">Which days?</span>
            {straightRunPreset.length > 0 && (
              <button
                type="button"
                onClick={() => onChangeSelected(straightRunPreset)}
                className="focus-ring text-sm font-medium text-forest underline decoration-forest/30 underline-offset-4 hover:decoration-forest"
              >
                Use {WEEKDAYS[0].short}–{WEEKDAYS[daysPerWeek - 1].short}
              </button>
            )}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {WEEKDAYS.map(({ key, short }) => {
              const active = selected.includes(key);
              const disabled = !active && daysPerWeek !== null && selected.length >= daysPerWeek;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleDay(key)}
                  className={`focus-ring rounded-md border py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-forest bg-forest text-paper"
                      : disabled
                      ? "border-line bg-line/30 text-ink/30 cursor-not-allowed"
                      : "border-line bg-white text-ink hover:border-forest/50"
                  }`}
                >
                  {short}
                </button>
              );
            })}
          </div>
          <p className={`mt-2 text-sm ${isOverLimit ? "text-rust" : "text-ink/50"}`}>
            {selected.length} of {daysPerWeek} days selected
            {isUnderLimit && ` — pick ${daysPerWeek - selected.length} more`}
          </p>
        </div>
      )}
    </div>
  );
}
