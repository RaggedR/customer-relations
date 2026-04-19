"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

function isWarrantyExpired(date: string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

interface HearingAid {
  id: number;
  ear: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  battery_type: string | null;
  wax_filter: string | null;
  dome: string | null;
  warranty_end_date: string | null;
}

export default function PortalHearingAidsPage() {
  const router = useRouter();
  const [aids, setAids] = useState<HearingAid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portal/hearing-aids")
      .then((res) => {
        if (res.status === 401) { router.push("/portal/login"); return []; }
        if (!res.ok) throw new Error("Failed to load hearing aids");
        return res.json();
      })
      .then(setAids)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <p className="text-sm text-muted-foreground py-8">Loading hearing aids...</p>;
  if (error) return <p className="text-sm text-red-600 py-8">{error}</p>;

  const left = aids.filter((a) => a.ear?.toLowerCase() === "left");
  const right = aids.filter((a) => a.ear?.toLowerCase() === "right");
  const other = aids.filter((a) => a.ear?.toLowerCase() !== "left" && a.ear?.toLowerCase() !== "right");

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">My Hearing Aids</h2>
        <p className="text-sm text-muted-foreground mt-1">Your current hearing aid devices</p>
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 mb-6 text-xs text-amber-800">
        This page contains private health information about your hearing devices. Please do not share this information publicly.
      </div>

      {aids.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No hearing aids on file.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {left.length > 0 && <EarSection label="Left Ear" aids={left} />}
          {right.length > 0 && <EarSection label="Right Ear" aids={right} />}
          {other.length > 0 && <EarSection label="Other" aids={other} />}
        </div>
      )}
    </div>
  );
}

function EarSection({ label, aids }: { label: string; aids: HearingAid[] }) {
  return (
    <section>
      <h3 className="text-lg font-semibold mb-3">{label}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {aids.map((aid) => (
          <div key={aid.id} className="rounded-lg border border-border bg-card p-5 shadow-sm space-y-3">
            <div>
              <p className="text-sm font-semibold text-card-foreground">
                {aid.make ?? "Unknown"} {aid.model ?? ""}
              </p>
              {aid.serial_number && (
                <p className="text-xs text-muted-foreground mt-0.5">S/N: {aid.serial_number}</p>
              )}
            </div>

            <div className="space-y-1.5">
              {aid.battery_type && <Field label="Battery" value={aid.battery_type} />}
              {aid.wax_filter && <Field label="Wax filter" value={aid.wax_filter} />}
              {aid.dome && <Field label="Dome" value={aid.dome} />}
              {aid.warranty_end_date && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Warranty</span>
                  <span className={isWarrantyExpired(aid.warranty_end_date) ? "text-red-600 font-medium" : ""}>
                    {new Date(aid.warranty_end_date).toLocaleDateString("en-AU")}
                    {isWarrantyExpired(aid.warranty_end_date) && " (expired)"}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
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
