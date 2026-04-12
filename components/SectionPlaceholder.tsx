"use client";

/**
 * Placeholder for store sections that are enabled but have no content.
 * Shows a dashed card with placeholder images to fill the gap.
 */
export default function SectionPlaceholder({
  title,
  hint,
  cols = 4,
}: {
  title: string;
  hint: string;
  cols?: number;
}) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 p-6">
        <h3 className="text-lg font-bold text-gray-300 dark:text-gray-600 mb-4">
          {title}
        </h3>
        <div
          className={`grid gap-3 ${
            cols >= 6
              ? "grid-cols-3 sm:grid-cols-6"
              : "grid-cols-2 sm:grid-cols-4"
          }`}
        >
          {Array.from({ length: cols }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/3] rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center"
            >
              <span className="text-xs font-semibold text-gray-300 dark:text-gray-600">
                Imagen {i + 1}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-300 dark:text-gray-600 mt-3">
          {hint}
        </p>
      </div>
    </section>
  );
}
