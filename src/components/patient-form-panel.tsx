"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Tab = "info" | "referral" | "clinical" | "personal" | "upload";

interface PatientFormPanelProps {
  patientId?: number; // if set, edit mode; otherwise create mode
  onPatientCreated?: (id: number) => void;
}

interface NoteTemplate {
  label: string;
  sections: string[];
}

export function PatientFormPanel({
  patientId: initialPatientId,
  onPatientCreated,
}: PatientFormPanelProps) {
  const [tab, setTab] = useState<Tab>("info");
  const [patientId, setPatientId] = useState<number | null>(
    initialPatientId ?? null
  );
  const [patientName, setPatientName] = useState("");
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Load patient name if editing
  useEffect(() => {
    if (patientId) {
      fetch(`/api/patient/${patientId}`)
        .then((r) => r.json())
        .then((data) => setPatientName(data.name ?? ""))
        .catch(() => {});
    }
  }, [patientId]);

  function showMessage(text: string, type: "success" | "error") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "info", label: "Patient" },
    { key: "referral", label: "Referral" },
    { key: "clinical", label: "Clinical Note" },
    { key: "personal", label: "Personal Note" },
    { key: "upload", label: "Upload" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Patient name header */}
      {patientId && patientName && (
        <div className="px-3 py-1.5 bg-floating-muted border-b border-floating-border text-xs text-muted-foreground">
          Patient: <span className="font-medium text-foreground">{patientName}</span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-floating-border shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            disabled={t.key !== "info" && !patientId}
            className={cn(
              "flex-1 px-2 py-2 text-xs font-medium transition-colors",
              tab === t.key
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground",
              t.key !== "info" && !patientId && "opacity-40 cursor-not-allowed"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div
          className={cn(
            "px-3 py-2 text-xs",
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-destructive/10 text-destructive"
          )}
        >
          {message.text}
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-3">
        {tab === "info" && (
          <InfoTab
            patientId={patientId}
            onSaved={(id, name) => {
              setPatientId(id);
              setPatientName(name);
              onPatientCreated?.(id);
              showMessage(
                patientId ? "Patient updated" : "Patient created",
                "success"
              );
            }}
            onError={(msg) => showMessage(msg, "error")}
          />
        )}
        {tab === "referral" && patientId && (
          <ReferralTab
            patientId={patientId}
            onSaved={() => showMessage("Referral saved", "success")}
            onError={(msg) => showMessage(msg, "error")}
          />
        )}
        {tab === "clinical" && patientId && (
          <ClinicalNoteTab
            patientId={patientId}
            onSaved={() => showMessage("Clinical note saved", "success")}
            onError={(msg) => showMessage(msg, "error")}
          />
        )}
        {tab === "personal" && patientId && (
          <PersonalNoteTab
            patientId={patientId}
            onSaved={() => showMessage("Personal note saved", "success")}
            onError={(msg) => showMessage(msg, "error")}
          />
        )}
        {tab === "upload" && patientId && (
          <UploadTab
            patientId={patientId}
            onSaved={() => showMessage("File uploaded", "success")}
            onError={(msg) => showMessage(msg, "error")}
          />
        )}
      </div>
    </div>
  );
}

// ─── Info Tab ────────────────────────────────────────

function InfoTab({
  patientId,
  onSaved,
  onError,
}: {
  patientId: number | null;
  onSaved: (id: number, name: string) => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (patientId) {
      fetch(`/api/patient/${patientId}`)
        .then((r) => r.json())
        .then((data) => {
          setForm({
            name: data.name ?? "",
            date_of_birth: formatDate(data.date_of_birth),
            medicare_number: data.medicare_number ?? "",
            phone: data.phone ?? "",
            email: data.email ?? "",
            address: data.address ?? "",
            status: data.status ?? "active",
            maintenance_plan_expiry: formatDate(data.maintenance_plan_expiry),
            notes: data.notes ?? "",
          });
        })
        .catch(() => onError("Failed to load patient"));
    }
  }, [patientId]);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = patientId ? `/api/patient/${patientId}` : "/api/patient";
      const method = patientId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.errors?.join(", ") || data.error || "Save failed");
      }
      onSaved(data.id, data.name);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label="Name" required>
        <Input
          value={form.name ?? ""}
          onChange={(e) => set("name", e.target.value)}
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date of Birth">
          <Input
            type="date"
            value={form.date_of_birth ?? ""}
            onChange={(e) => set("date_of_birth", e.target.value)}
          />
        </Field>
        <Field label="Medicare Number">
          <Input
            value={form.medicare_number ?? ""}
            onChange={(e) => set("medicare_number", e.target.value)}
            placeholder="1234 56789 0"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone">
          <Input
            type="tel"
            value={form.phone ?? ""}
            onChange={(e) => set("phone", e.target.value)}
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Address">
        <Textarea
          value={form.address ?? ""}
          onChange={(e) => set("address", e.target.value)}
          rows={2}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <select
            value={form.status ?? "active"}
            onChange={(e) => set("status", e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="discharged">Discharged</option>
          </select>
        </Field>
        <Field label="Plan Expiry">
          <Input
            type="date"
            value={form.maintenance_plan_expiry ?? ""}
            onChange={(e) => set("maintenance_plan_expiry", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
        />
      </Field>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : patientId ? "Update" : "Create Patient"}
        </Button>
      </div>
    </form>
  );
}

// ─── Referral Tab ────────────────────────────────────

function ReferralTab({
  patientId,
  onSaved,
  onError,
}: {
  patientId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, patient: patientId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.errors?.join(", ") || data.error || "Save failed");
      }
      setForm({});
      onSaved();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label="Referring GP" required>
        <Input
          value={form.referring_gp ?? ""}
          onChange={(e) => set("referring_gp", e.target.value)}
          placeholder="Dr..."
          required
        />
      </Field>
      <Field label="GP Practice">
        <Input
          value={form.gp_practice ?? ""}
          onChange={(e) => set("gp_practice", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Referral Date" required>
          <Input
            type="date"
            value={form.referral_date ?? ""}
            onChange={(e) => set("referral_date", e.target.value)}
            required
          />
        </Field>
        <Field label="Expiry Date">
          <Input
            type="date"
            value={form.expiry_date ?? ""}
            onChange={(e) => set("expiry_date", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Reason">
        <Textarea
          value={form.reason ?? ""}
          onChange={(e) => set("reason", e.target.value)}
          rows={3}
        />
      </Field>
      <Field label="Notes">
        <Textarea
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
        />
      </Field>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Add Referral"}
        </Button>
      </div>
    </form>
  );
}

// ─── Clinical Note Tab ───────────────────────────────

function ClinicalNoteTab({
  patientId,
  onSaved,
  onError,
}: {
  patientId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    date: new Date().toISOString().slice(0, 16),
  });
  const [templates, setTemplates] = useState<Record<string, NoteTemplate>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/clinical-note-templates")
      .then((r) => r.json())
      .then(setTemplates)
      .catch(() => {});
  }, []);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleTypeChange(noteType: string) {
    set("note_type", noteType);
    // Pre-fill template if content is empty or was previously template-filled
    const tmpl = templates[noteType];
    if (tmpl && (!form.content || form.content.trim() === "" || isTemplateContent(form.content))) {
      set("content", tmpl.sections.join("\n"));
    }
  }

  function isTemplateContent(content: string): boolean {
    // Check if content matches any template (i.e. user hasn't typed anything custom)
    return Object.values(templates).some(
      (t) => t.sections.join("\n").trim() === content.trim()
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/clinical_note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, patient: patientId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.errors?.join(", ") || data.error || "Save failed");
      }
      setForm({ date: new Date().toISOString().slice(0, 16) });
      onSaved();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date/Time" required>
          <Input
            type="datetime-local"
            value={form.date ?? ""}
            onChange={(e) => set("date", e.target.value)}
            required
          />
        </Field>
        <Field label="Note Type">
          <select
            value={form.note_type ?? ""}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select type...</option>
            <option value="initial_assessment">Initial Assessment</option>
            <option value="progress_note">Progress Note</option>
            <option value="discharge_summary">Discharge Summary</option>
            <option value="treatment_plan">Treatment Plan</option>
          </select>
        </Field>
      </div>
      <Field label="Clinician">
        <Input
          value={form.clinician ?? ""}
          onChange={(e) => set("clinician", e.target.value)}
          placeholder="Name"
        />
      </Field>
      <Field label="Content" required>
        <Textarea
          value={form.content ?? ""}
          onChange={(e) => set("content", e.target.value)}
          rows={12}
          required
          className="font-mono text-xs"
        />
      </Field>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Add Note"}
        </Button>
      </div>
    </form>
  );
}

// ─── Personal Note Tab ───────────────────────────────

function PersonalNoteTab({
  patientId,
  onSaved,
  onError,
}: {
  patientId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    date: new Date().toISOString().slice(0, 16),
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/personal_note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, patient: patientId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.errors?.join(", ") || data.error || "Save failed");
      }
      setForm({ date: new Date().toISOString().slice(0, 16) });
      onSaved();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label="Date/Time" required>
        <Input
          type="datetime-local"
          value={form.date ?? ""}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, date: e.target.value }))
          }
          required
        />
      </Field>
      <Field label="Note" required>
        <Textarea
          value={form.content ?? ""}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, content: e.target.value }))
          }
          rows={8}
          required
          placeholder="Personal context, scheduling notes, family details..."
        />
      </Field>
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Add Note"}
        </Button>
      </div>
    </form>
  );
}

// ─── Upload Tab ──────────────────────────────────────

function UploadTab({
  patientId,
  onSaved,
  onError,
}: {
  patientId: number;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("other");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("patientId", String(patientId));
      formData.append("category", category);
      if (description) formData.append("description", description);

      const res = await fetch("/api/attachments/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }
      setFile(null);
      setDescription("");
      onSaved();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Field label="File" required>
        <Input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          required
          className="text-xs"
        />
      </Field>
      <Field label="Category">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="referral_letter">Referral Letter</option>
          <option value="test_result">Test Result</option>
          <option value="clinical_document">Clinical Document</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Description">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of the file"
        />
      </Field>
      {file && (
        <div className="text-xs text-muted-foreground">
          Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
        </div>
      )}
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={submitting || !file}>
          {submitting ? "Uploading..." : "Upload"}
        </Button>
      </div>
    </form>
  );
}

// ─── Shared helpers ──────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 text-xs">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function formatDate(value: unknown): string {
  if (!value) return "";
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}
