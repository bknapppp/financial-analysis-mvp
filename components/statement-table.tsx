"use client";

import { formatCurrency } from "@/lib/formatters";
import type { NormalizedStatement } from "@/lib/types";

type StatementTableProps = {
  statement: NormalizedStatement;
  footerValueDisplay?: string | null;
  clickableLabels?: string[];
  onRowClick?: (label: string) => void;
};

export function StatementTable({
  statement,
  footerValueDisplay = null,
  clickableLabels = [],
  onRowClick
}: StatementTableProps) {
  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">{statement.title}</h2>
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
            {statement.rows.length > 0 ? (
              statement.rows.map((row) => {
                const isClickable = clickableLabels.includes(row.label) && Boolean(onRowClick);

                return (
                  <tr key={row.label}>
                    <td
                      className={`px-4 py-3 ${
                        row.rollupKey === "section_header"
                          ? "text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
                          : row.kind === "subtotal"
                          ? "font-semibold text-slate-900"
                          : row.kind === "metric"
                            ? "font-medium text-slate-800"
                            : "text-slate-700"
                      }`}
                    >
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
                    <td
                      className={`px-4 py-3 text-right ${
                        row.rollupKey === "section_header"
                          ? "text-slate-400"
                          : row.kind === "subtotal"
                          ? "font-semibold text-slate-900"
                          : "font-medium text-slate-900"
                      }`}
                    >
                      {row.rollupKey === "section_header" ? "" : formatCurrency(row.value)}
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
                {statement.footerLabel}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900">
                {footerValueDisplay ?? formatCurrency(statement.footerValue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
