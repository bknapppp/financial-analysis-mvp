"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type PeriodFormProps = {
  companyId: string | null;
};

export function PeriodForm({ companyId }: PeriodFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [periodDate, setPeriodDate] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/periods", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          companyId,
          label,
          periodDate
        })
      });

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        setErrorMessage(payload.error ?? "Reporting period could not be created.");
        return;
      }

      setLabel("");
      setPeriodDate("");
      setSuccessMessage("Reporting period created successfully.");
      startTransition(() => router.refresh());
    } catch {
      setErrorMessage("Reporting period could not be created.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[1.5rem] bg-white p-5 shadow-panel"
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Add period</h2>
        <p className="mt-1 text-sm text-slate-500">
          Create monthly reporting periods before loading account data.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Period label
          </label>
          <input
            required
            disabled={!companyId}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Jan 2026"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Period date
          </label>
          <input
            required
            disabled={!companyId}
            type="date"
            value={periodDate}
            onChange={(event) => setPeriodDate(event.target.value)}
          />
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {successMessage}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={!companyId || isPending}
        className="mt-4 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Create period"}
      </button>
    </form>
  );
}
