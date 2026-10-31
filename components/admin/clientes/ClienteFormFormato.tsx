'use client';

import { Zap, ClipboardList } from "@buleje/design-system/icons";
import { cn } from '@/lib/utils';

/** Botones «Simple» / «Completo» del alta de cliente (el elegido se recuerda en el navegador). */
export default function ClienteFormFormato({ format, changeFormat }: { format: 'simple' | 'completo'; changeFormat: (f: 'simple' | 'completo') => void }) {
  return (
    <div className="px-5 pt-4 pb-2 flex gap-2">
      <button
        type="button"
        onClick={() => changeFormat('simple')}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors",
          format === 'simple'
            ? "bg-primary text-white"
            : "bg-[var(--rule-soft)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-base)] "
        )}
      >
        <Zap className="h-3.5 w-3.5" /> Simple
      </button>
      <button
        type="button"
        onClick={() => changeFormat('completo')}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors",
          format === 'completo'
            ? "bg-primary text-white"
            : "bg-[var(--rule-soft)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--rule-base)] "
        )}
      >
        <ClipboardList className="h-3.5 w-3.5" /> Completo
      </button>
    </div>
  );
}
