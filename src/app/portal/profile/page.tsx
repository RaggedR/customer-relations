"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Profile {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  date_of_birth: string | null;
  medicare_number: string | null;
  status: string;
}

export default function PortalProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable contact fields
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Correction request
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionText, setCorrectionText] = useState("");
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [correctionMessage, setCorrectionMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portal/profile")
      .then((res) => {
        if (res.status === 401) { router.push("/portal/login"); return null; }
        if (!res.ok) throw new Error("Failed to load profile");
        return res.json();
      })
      .then((data) => {
        setProfile(data);
        setPhone(data.phone ?? "");
        setAddress(data.address ?? "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const res = await fetch("/api/portal/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, address }),
      });
      if (res.status === 401) { router.push("/portal/login"); return; }
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      const updated = await res.json();
      setProfile(updated);
      setSaveSuccess("Contact details updated.");
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCorrectionSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCorrectionSubmitting(true);
    setCorrectionMessage(null);
    try {
      const res = await fetch("/api/portal/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: correctionText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      setCorrectionMessage(data.message);
      setCorrectionText("");
      setShowCorrection(false);
    } catch (err) {
      setCorrectionMessage((err as Error).message);
    } finally {
      setCorrectionSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading profile...</p>;
  if (error) return <p className="text-sm text-red-400 py-8">{error}</p>;
  if (!profile) return null;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-semibold mb-4">My Profile</h2>
        <div className="rounded-lg border border-border p-4 space-y-3">
          <Field label="Name" value={profile.name} />
          <Field label="Email" value={profile.email} />
          <Field label="Date of birth" value={profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString("en-AU") : "—"} />
          <Field label="Medicare number" value={profile.medicare_number ?? "—"} />
          <Field label="Status" value={profile.status} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Contact Details</h2>
        <form onSubmit={handleSaveContact} className="rounded-lg border border-border p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          {saveSuccess && <p className="text-sm text-green-400">{saveSuccess}</p>}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Update contact details"}
          </Button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">Request a Correction</h2>
        <p className="text-sm text-muted-foreground mb-3">
          If any of your details above are incorrect (name, date of birth, Medicare number),
          you can request a correction. The practice will review and update your records.
        </p>

        {correctionMessage && (
          <p className="text-sm text-green-400 mb-3">{correctionMessage}</p>
        )}

        {!showCorrection ? (
          <Button variant="outline" onClick={() => setShowCorrection(true)}>
            Request a correction
          </Button>
        ) : (
          <form onSubmit={handleCorrectionSubmit} className="rounded-lg border border-border p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="correction">What needs correcting?</Label>
              <Textarea
                id="correction"
                placeholder="Please describe what information is incorrect and what it should be..."
                value={correctionText}
                onChange={(e) => setCorrectionText(e.target.value)}
                rows={4}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={correctionSubmitting}>
                {correctionSubmitting ? "Submitting..." : "Submit request"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCorrection(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
