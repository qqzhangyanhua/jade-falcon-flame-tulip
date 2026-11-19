"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ImageUsageDay } from "@/lib/image-jobs/quota";

export function AccountUsageChart({ days }: { days: ImageUsageDay[] }) {
  return (
    <div className="h-64 w-full min-w-0 overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={days}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          barCategoryGap="28%"
          barGap={1}
        >
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(value: string) => value.slice(5)}
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
            minTickGap={28}
          />
          <YAxis
            allowDecimals={false}
            width={32}
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-2)" }}
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              color: "var(--color-fg)",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-muted)" }} />
          <Bar
            dataKey="daily"
            name="每日额度"
            stackId="usage"
            fill="var(--color-fg)"
            maxBarSize={18}
          />
          <Bar
            dataKey="boost"
            name="加量包"
            stackId="usage"
            fill="var(--color-seal)"
            maxBarSize={18}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
