import { cn } from "@/lib/utils";

interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

interface SimpleBarChartProps {
  data: DataPoint[];
  title?: string;
  height?: number;
  showValues?: boolean;
  className?: string;
}

export function SimpleBarChart({
  data,
  title,
  height = 200,
  showValues = true,
  className,
}: SimpleBarChartProps) {
  if (data.length === 0) {
    return (
      <div className={cn("bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6", className)}>
        <p className="text-sm text-gray-400 dark:text-muted text-center">No hay datos disponibles</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className={cn("bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6", className)}>
      {title && (
        <h3 className="text-sm font-bold text-gray-700 dark:text-[var(--text-primary)]/80 mb-4">{title}</h3>
      )}
      
      <div className="relative" style={{ height: `${height}px` }}>
        <div className="absolute inset-0 flex items-end justify-around gap-1 sm:gap-2">
          {data.map((point, index) => {
            const percentage = (point.value / maxValue) * 100;
            const color = point.color || "bg-primary";
            
            return (
              <div key={index} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="w-full relative flex items-end justify-center" style={{ height: `${height - 40}px` }}>
                  {showValues && point.value > 0 && (
                    <div className="absolute -top-6 text-xs font-bold text-gray-700 dark:text-[var(--text-primary)] opacity-0 group-hover:opacity-100 transition-opacity">
                      {point.value}
                    </div>
                  )}
                  <div
                    className={cn(
                      "w-full rounded-t-lg transition-all duration-500 ease-out hover:opacity-80",
                      color
                    )}
                    style={{
                      height: `${percentage}%`,
                      minHeight: point.value > 0 ? "4px" : "0px",
                    }}
                  />
                </div>
                <p className="text-xs font-medium text-gray-600 dark:text-muted text-center w-full truncate px-1">
                  {point.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface SimpleLineChartProps {
  data: DataPoint[];
  title?: string;
  height?: number;
  showDots?: boolean;
  className?: string;
}

export function SimpleLineChart({
  data,
  title,
  height = 200,
  showDots = true,
  className,
}: SimpleLineChartProps) {
  if (data.length === 0) {
    return (
      <div className={cn("bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-6", className)}>
        <p className="text-sm text-gray-400 dark:text-muted text-center">No hay datos disponibles</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const minValue = Math.min(...data.map(d => d.value), 0);
  const range = maxValue - minValue || 1;

  const points = data.map((point, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((point.value - minValue) / range) * 100;
    return { x, y, value: point.value, label: point.label };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaD = `${pathD} L 100 100 L 0 100 Z`;

  return (
    <div className={cn("bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6", className)}>
      {title && (
        <h3 className="text-sm font-bold text-gray-700 dark:text-[var(--text-primary)]/80 mb-4">{title}</h3>
      )}
      
      <div className="relative" style={{ height: `${height}px` }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full overflow-visible"
        >
          <defs>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" className="text-primary" stopColor="currentColor" stopOpacity="0.3" />
              <stop offset="100%" className="text-primary" stopColor="currentColor" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          <path
            d={areaD}
            fill="url(#lineGradient)"
            className="animate-[fadeIn_0.6s_ease-out]"
          />

          <path
            d={pathD}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-primary animate-[draw_1s_ease-out]"
            style={{
              strokeDasharray: 200,
              strokeDashoffset: 200,
              animation: "draw 1s ease-out forwards",
            }}
          />

          {showDots && points.map((point, index) => (
            <g key={index} className="group">
              <circle
                cx={point.x}
                cy={point.y}
                r="1.5"
                className="text-primary fill-current animate-[scaleIn_0.3s_ease-out]"
                style={{ animationDelay: `${index * 0.1}s` }}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r="3"
                className="text-primary fill-current opacity-0 group-hover:opacity-30 transition-opacity"
              />
            </g>
          ))}
        </svg>

        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1">
          {data.map((point, index) => (
            <div
              key={index}
              className="text-xs font-medium text-gray-600 dark:text-muted text-center"
              style={{ width: `${100 / data.length}%` }}
            >
              <p className="truncate">{point.label}</p>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes draw {
          to {
            strokeDashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}
