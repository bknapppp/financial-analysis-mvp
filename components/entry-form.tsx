"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReportingPeriod } from "@/lib/types";

const CATEGORY_OPTIONS = [
  "Revenue",
  "COGS",
  "Operating Expenses",
  "Assets",
  "Liabilities",
  "Equity"
] as const;

type EntryFormProps = {
  companyId: string | null;
  periods: ReportingPeriod[];
};

export function EntryForm({ companyId, periods }: EntryFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    accountName: "",
    statementType: "income",
    amount: "",
    periodId: periods[periods.length - 1]?.id ?? "",
    category: "Revenue",
    addbackFlag: false
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      periodId: periods[periods.length - 1]?.id ?? ""
    }));
  }, [periods]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await fetch("/api/financial-entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount)
      })
    });

    const payload = (await response.json()) as {
      error?: string;
    };

    if (!response.ok) {
      setErrorMessage(payload.error ?? "Financial entry could not be created.");
      return;
    }

    setForm((current) => ({
      ...current,
      accountName: "",
      amount: "",
      addbackFlag: false
    }));
    setSuccessMessage("Financial entry added successfully.");
    startTransition(() => router.refresh());
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[1.5rem] bg-white p-5 shadow-panel"
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Manual financial entry
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Load raw monthly financial data one line item at a time.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Account name
          </label>
          <input
            required
            disabled={!companyId || periods.length === 0}
            value={form.accountName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                accountName: event.target.value
              }))
            }
            placeholder="Rent expense"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Statement type
          </label>
          <select
            value={form.statementType}
            disabled={!companyId || periods.length === 0}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                statementType: event.target.value
              }))
            }
          >
            <option value="income">Income</option>
            <option value="balance_sheet">Balance sheet</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Amount
          </label>
          <input
            required
            disabled={!companyId || periods.length === 0}
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                amount: event.target.value
              }))
            }
            placeholder="12500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Period
          </label>
          <select
            value={form.periodId}
            disabled={!companyId || periods.length === 0}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                periodId: event.target.value
              }))
            }
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Category
          </label>
          <select
            value={form.category}
            disabled={!companyId || periods.length === 0}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                category: event.target.value
              }))
            }
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 md:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={form.addbackFlag}
            disabled={!companyId || periods.length === 0}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                addbackFlag: event.target.checked
              }))
            }
          />
          Mark this line item as an EBITDA add-back
        </label>
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
        disabled={!companyId || periods.length === 0 || isPending}
        className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Add financial entry"}
      </button>
    </form>
  );
}
