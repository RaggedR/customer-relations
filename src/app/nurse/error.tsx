"use client";

import { useEffect } from "react";

export default function NurseError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Nurse portal error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="mb-4 text-xl font-semibold">Something went wrong</h2>
        <p className="mb-6 text-muted-foreground">
          The nurse portal encountered an error. Please try again.
        </p>
        <button
          onClick={() => unstable_retry()}
          className="rounded bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
