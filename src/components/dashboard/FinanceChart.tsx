import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/format";

export type FinanceChartDatum = { name: string; valor: number };

/**
 * Recharts is a heavy dependency, so the dashboard loads this chart lazily.
 * Keeping it isolated prevents the charting library from blocking the first paint.
 */
export default function FinanceChart({ data }: { data: FinanceChartDatum[] }) {
  const safeData = Array.isArray(data) ? data : [];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={safeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => `R$${v}`} />
        <Tooltip
          formatter={(val: number) => [formatBRL(val), "Valor"]}
          contentStyle={{
            backgroundColor: "var(--color-card)",
            borderColor: "var(--color-border)",
            borderRadius: "8px",
            fontSize: "12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        />
        <Bar dataKey="valor" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
