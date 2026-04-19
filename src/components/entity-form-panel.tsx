"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { entityLabelSingular, fieldTypes, toSnakeCase, type SchemaConfig, type FieldConfig } from "@/lib/schema-client";
import { recordDisplayName, formatDateForInput, formatDatetimeForInput } from "@/lib/renderers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface EntityFormPanelProps {
  entityName: string;
  schema: SchemaConfig;
  entityId?: number; // edit mode if set
  initialValues?: Record<string, string>; // pre-fill from calendar slot click
  onSaved?: (id: number, name: string) => void;
}

export function EntityFormPanel({
  entityName,
  schema,
  entityId,
  initialValues,
  onSaved,
}: EntityFormPanelProps) {
  const entityConfig = schema.entities[entityName];
  const [form, setForm] = useState<Record<string, string>>(initialValues ?? {});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<{
    password: string;
    nurseName: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Load existing record in edit mode
  useEffect(() => {
    if (entityId) {
      fetch(`/api/${entityName}/${entityId}`)
        .then((r) => r.json())
        .then((data) => {
          const loaded: Record<string, string> = {};
          for (const [fieldName, field] of Object.entries(entityConfig.fields)) {
            const val = data[fieldName] ?? data[toSnakeCase(fieldName)];
            if (val === null || val === undefined) {
              loaded[fieldName] = "";
            } else if (field.type === "time") {
              loaded[fieldName] = String(val); // "HH:MM" — pass through
            } else if (field.type === "date") {
              loaded[fieldName] = formatDateForInput(val);
            } else if (field.type === "datetime") {
              loaded[fieldName] = formatDatetimeForInput(val);
            } else {
              loaded[fieldName] = String(val);
            }
          }
          setForm(loaded);
        })
        .catch(() => showMessage("Failed to load record", "error"));
    }
  }, [entityId, entityName]);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function showMessage(text: string, type: "success" | "error") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const url = entityId
        ? `/api/${entityName}/${entityId}`
        : `/api/${entityName}`;
      const method = entityId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.errors?.join(", ") || data.error || "Save failed"
        );
      }
      const displayName = recordDisplayName(data, entityConfig);
      showMessage(
        entityId ? "Updated" : `${entityLabelSingular(entityName, schema)} created`,
        "success"
      );
      onSaved?.(data.id, displayName);
      if (!entityId) {
        // If a nurse was created with an auto-generated password, show it
        // in a modal before clearing the form
        if (data._generatedPassword) {
          setGeneratedPassword({
            password: data._generatedPassword,
            nurseName: displayName || data.name || "Nurse",
          });
        } else {
          setForm({});
        }
      }
    } catch (err) {
      showMessage((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!entityConfig) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Unknown entity: {entityName}
      </div>
    );
  }

  const fields = Object.entries(entityConfig.fields);

  return (
    <div className="flex flex-col h-full">
      {/* Message */}
      {message && (
        <div
          className={`px-3 py-2 text-xs ${
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex-1 overflow-auto p-3 space-y-3"
      >
        {fields.map(([name, field]) => (
          <FieldInput
            key={name}
            name={name}
            field={field}
            value={form[name] ?? ""}
            onChange={(v) => set(name, v)}
          />
        ))}

        {/* Relation fields — rendered as async select dropdowns */}
        {entityConfig.relations && Object.entries(entityConfig.relations).map(([relName, rel]) => (
          <RelationSelect
            key={relName}
            name={relName}
            relatedEntity={rel.entity}
            value={form[relName] ?? ""}
            onChange={(v) => set(relName, v)}
          />
        ))}

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Saving..."
              : entityId
                ? "Update"
                : `Create ${entityLabelSingular(entityName, schema)}`}
          </Button>
        </div>
      </form>

      {/* Password display modal — shown once after nurse creation */}
      <Dialog
        open={!!generatedPassword}
        onOpenChange={(open) => {
          if (!open) {
            setGeneratedPassword(null);
            setCopied(false);
            setForm({});
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Account created</DialogTitle>
            <DialogDescription>
              A login account has been created for{" "}
              <strong>{generatedPassword?.nurseName}</strong>. Give them
              this temporary password — it will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="my-2 flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
            <code className="flex-1 select-all font-mono text-sm tracking-wide">
              {generatedPassword?.password}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (generatedPassword?.password) {
                  navigator.clipboard.writeText(generatedPassword.password);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The nurse will be required to change this password on first login.
          </p>
          <DialogFooter>
            <Button
              onClick={() => {
                setGeneratedPassword(null);
                setCopied(false);
                setForm({});
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldInput({
  name,
  field,
  value,
  onChange,
}: {
  name: string;
  field: FieldConfig;
  value: string;
  onChange: (value: string) => void;
}) {
  const ft = fieldTypes[field.type];
  if (!ft) return null;

  const label = name.replace(/_/g, " ");

  if (field.type === "enum" && field.values) {
    return (
      <div>
        <Label className="mb-1.5 text-xs capitalize">
          {label}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Select...</option>
          {field.values.map((v) => (
            <option key={v} value={v}>
              {v.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (ft.htmlInputType === "textarea") {
    return (
      <div>
        <Label className="mb-1.5 text-xs capitalize">
          {label}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          rows={3}
          required={field.required}
        />
      </div>
    );
  }

  return (
    <div>
      <Label className="mb-1.5 text-xs capitalize">
        {label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Input
        type={ft.htmlInputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        required={field.required}
      />
    </div>
  );
}

function RelationSelect({
  name,
  relatedEntity,
  value,
  onChange,
}: {
  name: string;
  relatedEntity: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [options, setOptions] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    fetch(`/api/${relatedEntity}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setOptions(
            data.map((d: Record<string, unknown>) => ({
              id: d.id as number,
              name: recordDisplayName(d),
            }))
          );
        }
      })
      .catch((err) => console.warn(`Failed to load ${relatedEntity} options:`, err));
  }, [relatedEntity]);

  const label = name.replace(/_/g, " ");

  return (
    <div>
      <Label className="mb-1.5 text-xs capitalize">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">Select {label}...</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  );
}
