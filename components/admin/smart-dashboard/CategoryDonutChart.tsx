"use client";

import { useState, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Sector,
} from "recharts";

const DONUT_COLORS = [
  "var(--color-primary)",
  "#8b5cf6",
  "#f97316",
  "#264653",
  "#e76f51",
  "#2a9d8f",
  "#e9c46a",
  "#606c38",
];

interface Props {
  data: { name: string; value: number }[];
  fmtR: (n: number) => string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderActiveShape(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value, percent } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 4} outerRadius={innerRadius - 1} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <text x={cx} y={cy - 10} textAnchor="middle" className="fill-gray-900 dark:fill-white text-xs font-bold">
        {payload.name}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" className="fill-gray-500 dark:fill-zinc-400 text-[length:var(--ts-2xs)]">
        {(percent * 100).toFixed(0)}%
      </text>
    </g>
  );
}

export default function CategoryDonutChart({ data, fmtR }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());

  const onPieEnter = useCallback((_: unknown, index: number) => {
    setActiveIndex(index);
  }, []);

  const onPieLeave = useCallback(() => {
    setActiveIndex(null);
  }, []);

  const toggleCategory = (name: string) => {
    setHiddenCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const filteredData = data.filter(d => !hiddenCategories.has(d.name));
  const total = filteredData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative w-full sm:w-[200px] h-[200px] shrink-0">
        <ResponsiveContainer minWidth={0} width="100%" height="100%">
          <PieChart>
            <Pie
              data={filteredData}
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              {...({ activeIndex: activeIndex ?? undefined, activeShape: renderActiveShape } as any)}
              onMouseEnter={onPieEnter}
              onMouseLeave={onPieLeave}
            >
              {filteredData.map((_, index) => (
                <Cell key={index} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Central number */}
        {activeIndex === null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-[var(--text-primary)]">{fmtR(total)}</span>
            <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Total</span>
          </div>
        )}
      </div>

      {/* Interactive legend */}
      <div className="flex-1 space-y-1.5 w-full">
        {data.map((item, i) => {
          const isHidden = hiddenCategories.has(item.name);
          const pct = total > 0 ? ((item.value / (total + (isHidden ? item.value : 0))) * 100).toFixed(0) : "0";
          return (
            <button
              key={item.name}
              onClick={() => toggleCategory(item.name)}
              className="flex items-center gap-2 w-full text-left rounded-lg px-2 py-1 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
                style={{
                  backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length],
                  opacity: isHidden ? 0.2 : 1,
                }}
              />
              <span className={`text-xs flex-1 truncate ${isHidden ? "text-[var(--text-tertiary)] dark:text-zinc-600 line-through" : "text-[var(--text-primary)] dark:text-zinc-300"}`}>
                {item.name}
              </span>
              <span className={`text-xs font-mono tabular-nums ${isHidden ? "text-[var(--text-tertiary)] dark:text-zinc-600" : "text-[var(--text-secondary)] dark:text-zinc-400"}`}>
                {isHidden ? "--" : `${pct}%`}
              </span>
              <span className={`text-xs font-semibold tabular-nums ${isHidden ? "text-[var(--text-tertiary)] dark:text-zinc-600" : "text-[var(--text-primary)]"}`}>
                {isHidden ? "--" : fmtR(item.value)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
