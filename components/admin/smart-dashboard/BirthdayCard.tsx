"use client";

import { useState, useEffect } from "react";

export function BirthdayCard() {
  const [birthdays, setBirthdays] = useState<{ name: string; phone?: string; isToday: boolean }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/customers?limit=500", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const customers: Array<{ name?: string; phone?: string; birthday?: string; fechaNacimiento?: string }> = Array.isArray(data) ? data : data.customers ?? [];
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const matches: { name: string; phone?: string; isToday: boolean }[] = [];
        for (const c of customers) {
          const bd = c.birthday || c.fechaNacimiento;
          if (!bd) continue;
          const d = new Date(bd);
          if (isNaN(d.getTime())) continue;
          const isTodayMatch = d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
          const isTomorrowMatch = d.getMonth() === tomorrow.getMonth() && d.getDate() === tomorrow.getDate();
          if (isTodayMatch || isTomorrowMatch) matches.push({ name: c.name ?? "Cliente", phone: c.phone, isToday: isTodayMatch });
        }
        setBirthdays(matches.slice(0, 3));
      } catch { /* silent */ }
    })();
  }, []);

  if (birthdays.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--rule-base)] dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-zinc-300">Cumpleanos</span>
      </div>
      <div className="space-y-2">
        {birthdays.map((b, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-zinc-200">
              {b.isToday ? "Hoy cumple" : "Manana cumple"}: {b.name}
            </p>
            {b.phone && b.isToday && (
              <a
                href={`https://wa.me/${b.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Feliz cumpleanos ${b.name}! De parte de Buleje.`)}`}
                target="_blank" rel="noopener noreferrer"
                className="shrink-0 px-2 py-1 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)] text-[length:var(--ts-2xs)] font-bold hover:bg-[var(--accent-soft)] transition-colors"
              >
                Felicitar
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
