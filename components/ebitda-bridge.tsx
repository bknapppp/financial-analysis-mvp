"use client";

import { useState } from "react";
import { getAddBackTypeLabel } from "@/lib/add-backs";
import { formatCurrency } from "@/lib/formatters";
import type { EbitdaBridge } from "@/lib/types";

type EbitdaBridgeProps = {
  bridge: EbitdaBridge | null;
  showOuterCard?: boolean;
};

export function EbitdaBridge({
  bridge,
  showOuterCard = true
}: EbitdaBridgeProps) {
  const [expandedType, setExpandedType] = useState<string | null>(null);

  if (!bridge) {
    return null;
  }

  const content = (
    <>
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Adjusted EBITDA
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">
            Adjusted EBITDA bridge
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Canonical EBITDA reconciled to accepted addbacks for {bridge.periodLabel}.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Adjusted EBITDA
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {bridge.adjustedEbitda === null
              ? "Unavailable"
              : formatCurrency(bridge.adjustedEbitda)}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <BridgeRow label="Canonical EBITDA" value={bridge.canonicalEbitda} />
        {bridge.reportedEbitdaReference !== null ? (
          <BridgeRow
            label="Reported EBITDA (Reference)"
            value={bridge.reportedEbitdaReference}
          />
        ) : null}
        {bridge.groups.map((group) => {
          const isExpanded = expandedType === group.type;

          return (
            <div key={group.type} className="rounded-xl bg-white px-4 py-3">
              <button
                type="button"
                onClick={() =>
                  setExpandedType((current) =>
                    current === group.type ? null : group.type
                  )
                }
                className="flex w-full items-center justify-between gap-4 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {getAddBackTypeLabel(group.type)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {group.items.length} item{group.items.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-teal-700">
                    +{formatCurrency(group.total)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isExpanded ? "Hide detail" : "Show detail"}
                  </p>
                </div>
              </button>

              {isExpanded ? (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                  {group.items.map((item) => (
                    <div
                      key={`${group.type}-${item.id ?? item.linkedEntryId ?? item.description}`}
                      className="flex items-start justify-between gap-4 text-sm"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{item.description}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.entryAccountName ?? "Manual item"} • {item.periodLabel}
                        </p>
                      </div>
                      <p className="whitespace-nowrap font-semibold text-slate-900">
                        +{formatCurrency(item.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        <BridgeRow
          label="Accepted addbacks"
          value={bridge.addBackTotal}
          accent="teal"
        />
      </div>

      {bridge.invalidReasons.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-semibold text-rose-900">
            Adjusted EBITDA is unavailable
          </p>
          <ul className="mt-2 space-y-1 text-sm text-rose-800">
            {bridge.invalidReasons.map((reason) => (
              <li key={reason}>• {reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {bridge.warnings.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">Review before relying</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {bridge.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );

  if (!showOuterCard) {
    return <section>{content}</section>;
  }

  return <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">{content}</section>;
}

function BridgeRow({
  label,
  value,
  accent = "slate"
}: {
  label: string;
  value: number | null;
  accent?: "slate" | "teal";
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-dashed border-slate-200 pb-3 last:border-b-0 last:pb-0">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p
        className={`text-lg font-semibold ${
          accent === "teal" ? "text-teal-700" : "text-slate-900"
        }`}
      >
        {accent === "teal" ? "+" : ""}
        {formatCurrency(value)}
      </p>
    </div>
  );
}
