"use client";

export interface CheckoutNotesFieldProps {
  notes: string;
  onNotesChange: (v: string) => void;
  rows?: number;
}

const QUICK_NOTES = [
  { emoji: "🎂", text: "Feliz cumpleaños! " },
  { emoji: "🎁", text: "Es un regalo. " },
  { emoji: "📦", text: "Dejar en porteria. " },
];

export function CheckoutNotesField({
  notes,
  onNotesChange,
  rows = 2,
}: CheckoutNotesFieldProps) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">
        Mensaje especial (opcional)
      </label>
      <textarea
        value={notes}
        onChange={(e) => {
          if (e.target.value.length <= 200) onNotesChange(e.target.value);
        }}
        rows={rows}
        placeholder="Ej: Feliz cumpleanos Maria, Dejar en porteria, etc."
        className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 placeholder:text-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm resize-none"
      />
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex gap-1.5">
          {QUICK_NOTES.map((q) => (
            <button
              key={q.emoji}
              type="button"
              onClick={() => {
                const next = (notes + q.text).slice(0, 200);
                onNotesChange(next);
              }}
              className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-surface text-xs font-medium hover:bg-[#f97316]/20 transition-colors"
            >
              {q.emoji} {q.text.trim().split(" ")[0]}
            </button>
          ))}
        </div>
        <span
          className={`text-[length:var(--ts-2xs)] font-semibold ${
            notes.length > 180 ? "text-amber-500" : "text-gray-300"
          }`}
        >
          {notes.length}/200
        </span>
      </div>
    </div>
  );
}
