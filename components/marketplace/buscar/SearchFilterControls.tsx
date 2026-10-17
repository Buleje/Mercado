"use client";

/**
 * Controles del panel de filtros del buscador (grupo, radio y casillero).
 * Salieron de SearchFilters.tsx para que quede bajo 300 líneas.
 */

export function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function RadioRow({
  checked,
  onChange,
  label,
  count,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm cursor-pointer group">
      <input type="radio" checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`h-4 w-4 rounded-full border flex items-center justify-center transition-colors ${
          checked
            ? "border-primary bg-primary"
            : "border-[var(--rule-base)] group-hover:border-[var(--rule-strong)]"
        }`}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
      <span
        className={`flex-1 ${
          checked ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }`}
      >
        {children ?? label}
      </span>
      {count != null && <span className="text-xs text-[var(--text-tertiary)]">{count}</span>}
    </label>
  );
}

export function CheckboxRow({
  checked,
  onChange,
  label,
  count,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  count?: number;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm cursor-pointer group">
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`h-4 w-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${
          checked
            ? "border-primary bg-primary"
            : "border-[var(--rule-base)] group-hover:border-[var(--rule-strong)]"
        }`}
      >
        {checked && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M1.5 5.5L4 8L8.5 2.5"
              stroke="white"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span
        className={`flex-1 truncate ${
          checked ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }`}
      >
        {label}
      </span>
      {count != null && <span className="text-xs text-[var(--text-tertiary)]">{count}</span>}
    </label>
  );
}
