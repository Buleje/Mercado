export function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-[var(--text-tertiary)]">{children}</div>;
}
