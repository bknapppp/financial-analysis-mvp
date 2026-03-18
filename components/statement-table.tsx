"use client";

import { formatCurrency } from "@/lib/formatters";
import type { StatementRow } from "@/lib/types";

type StatementTableProps = {
  title: string;
  rows: StatementRow[];
  footerLabel: string;
  footerValue: number;
  clickableLabels?: string[];
  onRowClick?: (label: string) => void;
};

export function StatementTable({
  title,
  rows,
  footerLabel,
  footerValue,
  clickableLabels = [],
  onRowClick
}: StatementTableProps) {
  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-500">
                Line item
              </th>
              <th className="px-4 py-3 text-right font-medium text-slate-500">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.length > 0 ? (
              rows.map((row) => {
                const isClickable = clickableLabels.includes(row.label) && Boolean(onRowClick);

                return (
                  <tr key={row.label}>
                    <td className="px-4 py-3 text-slate-700">
                      {isClickable ? (
                        <button
                          type="button"
                          onClick={() => onRowClick?.(row.label)}
                          className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:text-ink"
                        >
                          {row.label}
                        </button>
                      ) : (
                        row.label
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatCurrency(row.value)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={2}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No data loaded yet for this statement.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr>
              <td className="px-4 py-3 font-semibold text-slate-700">
                {footerLabel}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900">
                {formatCurrency(footerValue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
