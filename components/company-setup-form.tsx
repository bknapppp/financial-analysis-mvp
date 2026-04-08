"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CompanySetupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const response = await fetch("/api/companies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name,
        industry,
        baseCurrency: currency
      })
    });

    const payload = (await response.json()) as {
      error?: string;
    };

    if (!response.ok) {
      setErrorMessage(payload.error ?? "Company could not be created.");
      return;
    }

    setName("");
    setIndustry("");
    setSuccessMessage("Company created successfully.");
    startTransition(() => router.refresh());
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[1.5rem] bg-white p-5 shadow-panel"
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">Company Setup</h2>
        <p className="mt-1 text-sm text-slate-500">
          Set the legal entity, industry, and base currency for this review file.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Company name
          </label>
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Maple Street Manufacturing"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Industry
          </label>
          <input
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            placeholder="Light manufacturing"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Base currency
          </label>
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
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
        disabled={isPending}
        className="mt-4 w-full rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Save company"}
      </button>
    </form>
  );
}
