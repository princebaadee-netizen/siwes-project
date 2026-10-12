"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Button, Card, FieldLabel, TextInput } from "@/components/ui";
import { api, ProjectTopic } from "@/lib/api";

const EMPTY = { title: "", field: "", description: "" };

export default function AdminTopicsPage() {
  const [topics, setTopics] = useState<ProjectTopic[]>([]);
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
      setTopics(await api.adminListTopics());
    } catch (err: any) {
      if (err?.status === 403) setForbidden(true);
      else setError(err?.message || "Could not load the topic bank.");
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

  function startEdit(topic: ProjectTopic) {
    setEditingId(topic.id);
    setForm({ title: topic.title, field: topic.field, description: topic.description ?? "" });
    setError(null);
    setSuccess(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const title = form.title.trim();
    const field = form.field.trim();
    if (!title || !field) {
      setError("Title and field are required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await api.updateTopic(editingId, { title, field, description: form.description.trim() });
        flash("Topic updated.");
      } else {
        await api.createTopic({ title, field, description: form.description.trim() || undefined });
        flash("Topic added.");
      }
      resetForm();
      await load();
    } catch (err: any) {
      setError(err?.message || "Could not save the topic.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(topic: ProjectTopic) {
    if (!confirm(`Delete "${topic.title}"? Projects that already used it keep their copy.`)) {
      return;
    }
    setDeletingId(topic.id);
    setError(null);
    try {
      await api.deleteTopic(topic.id);
      setTopics((prev) => prev.filter((t) => t.id !== topic.id));
      if (editingId === topic.id) resetForm();
      flash("Topic deleted.");
    } catch (err: any) {
      setError(err?.message || "Could not delete the topic.");
    } finally {
      setDeletingId(null);
    }
  }

  if (forbidden) {
    return (
      <>
        <h1 className="mb-1 font-slab text-2xl font-semibold text-ink">Topic bank</h1>
        <p className="flex items-center gap-2 text-sm text-ink/60">
          <ShieldAlert size={16} className="text-rust" />
          Admin access is required to manage the topic bank.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-1 font-slab text-2xl font-semibold text-ink">Topic bank</h1>
      <p className="mb-8 text-sm text-ink/60">
        Add, edit or remove the curated topics students can pick from. Reads are public, so
        changes appear in the picker immediately.
      </p>

      <Card className="mb-8">
        <form onSubmit={save} className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            {editingId ? <Pencil size={16} /> : <Plus size={16} />}
            {editingId ? "Edit topic" : "Add a topic"}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Title</FieldLabel>
              <TextInput
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. QR-code based attendance system"
                maxLength={200}
              />
            </div>
            <div>
              <FieldLabel>Field</FieldLabel>
              <TextInput
                value={form.field}
                onChange={(e) => setForm({ ...form, field: e.target.value })}
                placeholder="e.g. Computer Science"
                maxLength={100}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Description (optional)</FieldLabel>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="A sentence on what the project would cover."
              maxLength={500}
              rows={2}
              className="focus-ring w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-ink placeholder:text-ink/35"
            />
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
              {saving ? "Saving..." : editingId ? "Save changes" : "Add topic"}
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
          <Loader2 size={15} className="animate-spin" /> Loading the topic bank...
        </div>
      ) : topics.length === 0 ? (
        <p className="text-sm text-ink/60">No topics yet. Add the first one above.</p>
      ) : (
        <ul className="space-y-2">
          {topics.map((topic) => (
            <li
              key={topic.id}
              className="flex items-start justify-between gap-4 rounded-md border border-line bg-white p-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">{topic.title}</p>
                <p className="mt-0.5 font-mono text-xs text-forest/70">{topic.field}</p>
                {topic.description && (
                  <p className="mt-1 text-sm text-ink/60">{topic.description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(topic)}
                  className="focus-ring rounded-md p-2 text-ink/50 transition-colors hover:bg-forest/5 hover:text-forest"
                  aria-label={`Edit ${topic.title}`}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(topic)}
                  disabled={deletingId === topic.id}
                  className="focus-ring rounded-md p-2 text-ink/50 transition-colors hover:bg-rust/10 hover:text-rust disabled:opacity-40"
                  aria-label={`Delete ${topic.title}`}
                >
                  {deletingId === topic.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
