"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCurrency } from "@/lib/formatters";
import type { DashboardSeriesPoint } from "@/lib/types";

type DashboardChartsProps = {
  series: DashboardSeriesPoint[];
};

function formatCompactCurrency(value: number) {
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}m`;
  }

  if (absoluteValue >= 1000) {
    return `$${(value / 1000).toFixed(0)}k`;
  }

  return `$${value.toFixed(0)}`;
}

export function DashboardCharts({ series }: DashboardChartsProps) {
  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900">Trend view</h2>
        <p className="mt-1 text-sm text-slate-500">
          Revenue and EBITDA across reporting periods.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="mb-5 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-700" />
            <span>Revenue</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-600" />
            <span>EBITDA</span>
          </div>
        </div>

        <div className="h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={series}
              margin={{ top: 12, right: 28, left: 10, bottom: 18 }}
            >
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                tickLine={false}
                axisLine={false}
                tickMargin={14}
                minTickGap={20}
                padding={{ left: 16, right: 16 }}
              />
              <YAxis
                stroke="#64748b"
                tickLine={false}
                axisLine={false}
                width={64}
                tickMargin={12}
                tickFormatter={(value) => formatCompactCurrency(Number(value))}
              />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                contentStyle={{
                  borderRadius: "14px",
                  borderColor: "#e2e8f0",
                  boxShadow: "0 10px 30px -18px rgba(15, 23, 42, 0.45)"
                }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#0f766e"
                strokeWidth={3}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="ebitda"
                name="EBITDA"
                stroke="#d97706"
                strokeWidth={3}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
