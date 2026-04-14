"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EntityConfig, FieldConfig } from "@/lib/schema";
import { fieldTypes } from "@/lib/schema";

const QUICK_ADD_FIELDS = ["name", "email", "phone"];
const QUICK_ADD_RELATIONS = ["company"];

interface AddContactDialogProps {
  entity: EntityConfig;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

export function AddContactDialog({ entity, onSubmit }: AddContactDialogProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(field: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function reset() {
    setFormData({});
    setErrors([]);
    setExpanded(false);
    setSubmitting(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);
    try {
      await onSubmit(formData);
      setOpen(false);
      reset();
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setSubmitting(false);
    }
  }

  const visibleFields = expanded
    ? Object.entries(entity.fields)
    : Object.entries(entity.fields).filter(([name]) =>
        QUICK_ADD_FIELDS.includes(name)
      );

  const visibleRelations = expanded
    ? Object.entries(entity.relations ?? {})
    : Object.entries(entity.relations ?? {}).filter(([name]) =>
        QUICK_ADD_RELATIONS.includes(name)
      );

  const extraFieldCount =
    Object.keys(entity.fields).length -
    Object.keys(entity.fields).filter((n) => QUICK_ADD_FIELDS.includes(n)).length +
    Object.keys(entity.relations ?? {}).length -
    Object.keys(entity.relations ?? {}).filter((n) => QUICK_ADD_RELATIONS.includes(n)).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="w-full justify-start gap-2" />
        }
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add new contact
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Contact</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.length > 0 && (
            <div className="bg-destructive/10 text-destructive text-sm px-3 py-2 rounded-md">
              {errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          {visibleFields.map(([name, field]) => (
            <FieldInput
              key={name}
              name={name}
              field={field}
              value={formData[name] ?? ""}
              onChange={(v) => handleChange(name, v)}
            />
          ))}

          {visibleRelations.map(([name, rel]) => (
            <div key={name}>
              <Label htmlFor={name} className="capitalize mb-1.5">
                {name}
              </Label>
              <Input
                id={name}
                type="number"
                placeholder={`${name} ID`}
                value={(formData[name] as string) ?? ""}
                onChange={(e) =>
                  handleChange(name, e.target.value ? parseInt(e.target.value) : null)
                }
              />
            </div>
          ))}

          {!expanded && extraFieldCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              + {extraFieldCount} more field{extraFieldCount > 1 ? "s" : ""}
            </button>
          )}

          {expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Show fewer fields
            </button>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setOpen(false); reset(); }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const ft = fieldTypes[field.type];
  if (!ft) return null;

  const label = name.replace(/_/g, " ");

  if (field.type === "enum" && field.values) {
    return (
      <div>
        <Label htmlFor={name} className="capitalize mb-1.5">
          {label}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <select
          id={name}
          value={(value as string) || ""}
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
        <Label htmlFor={name} className="capitalize mb-1.5">
          {label}
          {field.required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        <Textarea
          id={name}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          rows={3}
          required={field.required}
        />
      </div>
    );
  }

  if (ft.htmlInputType === "checkbox") {
    return (
      <div className="flex items-center gap-2">
        <input
          id={name}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-input"
        />
        <Label htmlFor={name} className="capitalize">
          {label}
        </Label>
      </div>
    );
  }

  return (
    <div>
      <Label htmlFor={name} className="capitalize mb-1.5">
        {label}
        {field.required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <Input
        id={name}
        type={ft.htmlInputType}
        value={(value as string) || ""}
        onChange={(e) =>
          onChange(
            ft.htmlInputType === "number" ? e.target.valueAsNumber : e.target.value
          )
        }
        placeholder={label}
        required={field.required}
      />
    </div>
  );
}
