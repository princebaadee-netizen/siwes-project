"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Button, Card, FieldLabel, TextInput } from "@/components/ui";
import { api, PublicHoliday } from "@/lib/api";

const EMPTY = { date: "", name: "" };

export default function AdminHolidaysPage() {
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHolidays(await api.adminListHolidays());
    } catch (err: any) {
      if (err?.status === 403) setForbidden(true);
      else setError(err?.message || "Could not load holidays.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flash(message: string) {
    setSuccess(message);
    setError(null);
  }

  function resetForm() {
    setForm(EMPTY);
    setEditingId(null);
  }

  function startEdit(holiday: PublicHoliday) {
    setEditingId(holiday.id);
    // The API returns a full ISO timestamp; the date input wants YYYY-MM-DD.
    setForm({ date: holiday.date.slice(0, 10), name: holiday.name });
    setError(null);
    setSuccess(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const date = form.date;
    const name = form.name.trim();
    if (!date || !name) {
      setError("Date and name are required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await api.updateHoliday(editingId, { date, name });
        flash("Holiday updated. Calendars generated from now on will use it.");
      } else {
        await api.createHoliday({ date, name });
        flash("Holiday added. Calendars generated from now on will use it.");
      }
      resetForm();
      await load();
    } catch (err: any) {
      setError(err?.message || "Could not save the holiday.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(holiday: PublicHoliday) {
    if (!confirm(`Delete "${holiday.name}" (${holiday.date.slice(0, 10)})?`)) return;
    setDeletingId(holiday.id);
    setError(null);
    try {
      await api.deleteHoliday(holiday.id);
      setHolidays((prev) => prev.filter((h) => h.id !== holiday.id));
      if (editingId === holiday.id) resetForm();
      flash("Holiday deleted.");
    } catch (err: any) {
      setError(err?.message || "Could not delete the holiday.");
    } finally {
      setDeletingId(null);
    }
  }

  if (forbidden) {
    return (
      <>
        <h1 className="mb-1 font-slab text-2xl font-semibold text-ink">Public holidays</h1>
        <p className="flex items-center gap-2 text-sm text-ink/60">
          <ShieldAlert size={16} className="text-rust" />
          Admin access is required to manage the holiday list.
        </p>
      </>
    );
  }

  // Group by year so each calendar year reads as its own block.
  const byYear = new Map<number, PublicHoliday[]>();
  for (const holiday of holidays) {
    const list = byYear.get(holiday.year) ?? [];
    list.push(holiday);
    byYear.set(holiday.year, list);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);

  return (
    <>
      <h1 className="mb-1 font-slab text-2xl font-semibold text-ink">Public holidays</h1>
      <p className="mb-8 text-sm text-ink/60">
        The federal holiday list used when a student&apos;s attendance calendar is generated. Edits
        apply to calendars created from now on — existing placements keep theirs until rebuilt.
      </p>

      <Card className="mb-8">
        <form onSubmit={save} className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            {editingId ? <Pencil size={16} /> : <Plus size={16} />}
            {editingId ? "Edit holiday" : "Add a holiday"}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Date</FieldLabel>
              <TextInput
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel>Name</FieldLabel>
              <TextInput
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Eid al-Fitr (estimated — confirm date)"
                maxLength={120}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            {editingId && (
              <Button type="button" variant="ghost" onClick={resetForm} disabled={saving}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 size={15} className="animate-spin" />
              ) : editingId ? (
                <CheckCircle2 size={15} />
              ) : (
                <Plus size={15} />
              )}
              {saving ? "Saving..." : editingId ? "Save changes" : "Add holiday"}
            </Button>
          </div>
        </form>
      </Card>

      {error && (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-rust/40 bg-rust/5 px-4 py-3 text-sm text-rust">
          <AlertCircle size={16} /> {error}
        </p>
      )}
      {success && (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-forest/30 bg-forest/5 px-4 py-3 text-sm text-forest">
          <CheckCircle2 size={16} /> {success}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/50">
          <Loader2 size={15} className="animate-spin" /> Loading holidays...
        </div>
      ) : holidays.length === 0 ? (
        <p className="text-sm text-ink/60">No holidays yet. Add the first one above.</p>
      ) : (
        <div className="space-y-8">
          {years.map((year) => (
            <section key={year}>
              <h2 className="mb-3 flex items-center gap-2 font-slab text-lg font-semibold text-ink">
                <CalendarDays size={18} className="text-forest" />
                {year}
              </h2>
              <ul className="space-y-2">
                {byYear.get(year)!.map((holiday) => (
                  <li
                    key={holiday.id}
                    className="flex items-center justify-between gap-4 rounded-md border border-line bg-white p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{holiday.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-forest/70">
                        {holiday.date.slice(0, 10)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(holiday)}
                        className="focus-ring rounded-md p-2 text-ink/50 transition-colors hover:bg-forest/5 hover:text-forest"
                        aria-label={`Edit ${holiday.name}`}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(holiday)}
                        disabled={deletingId === holiday.id}
                        className="focus-ring rounded-md p-2 text-ink/50 transition-colors hover:bg-rust/10 hover:text-rust disabled:opacity-40"
                        aria-label={`Delete ${holiday.name}`}
                      >
                        {deletingId === holiday.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
