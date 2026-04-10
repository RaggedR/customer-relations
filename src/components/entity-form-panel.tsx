"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SchemaConfig, FieldConfig } from "@/engine/schema-loader";
import { entityLabelSingular } from "@/lib/schema-hierarchy";
import { fieldTypes } from "@/engine/field-types";

interface EntityFormPanelProps {
  entityName: string;
  schema: SchemaConfig;
  entityId?: number; // edit mode if set
  onSaved?: (id: number, name: string) => void;
}

export function EntityFormPanel({
  entityName,
  schema,
  entityId,
  onSaved,
}: EntityFormPanelProps) {
  const entityConfig = schema.entities[entityName];
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

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
            } else if (field.type === "date") {
              loaded[fieldName] = formatDate(val);
            } else if (field.type === "datetime") {
              loaded[fieldName] = formatDatetime(val);
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
      const name =
        data.name ??
        data[Object.keys(entityConfig.fields)[0]] ??
        `#${data.id}`;
      showMessage(
        entityId ? "Updated" : `${entityLabelSingular(entityName)} created`,
        "success"
      );
      onSaved?.(data.id, String(name));
      if (!entityId) {
        // Clear form after create
        setForm({});
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

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Saving..."
              : entityId
                ? "Update"
                : `Create ${entityLabelSingular(entityName)}`}
          </Button>
        </div>
      </form>
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

function toSnakeCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

function formatDate(val: unknown): string {
  if (!val) return "";
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}

function formatDatetime(val: unknown): string {
  if (!val) return "";
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}
