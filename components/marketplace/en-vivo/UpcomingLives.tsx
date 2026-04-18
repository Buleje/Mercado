"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { Bell, BellOff, Calendar, Store } from "@buleje/design-system/icons";
import type { LiveSession } from "@/lib/mocks/lives.mock";

export interface UpcomingLivesProps {
  lives: LiveSession[];
}

interface LiveWhen {
  label: string;
}

function computeWhen(iso: string): LiveWhen {
  const d = new Date(iso);
  const now = new Date();
  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;

  if (isSameDay) return { label: `Hoy ${time}` };
  if (isTomorrow) return { label: `Mañana ${time}` };
  const date = d.toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" });
  return { label: `${date} · ${time}` };
}

export function UpcomingLives({ lives }: UpcomingLivesProps) {
  const [reminders, setReminders] = useState<Record<string, boolean>>({});

  const toggle = useCallback((id: string) => {
    setReminders((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const decorated = useMemo(
    () => lives.map((l) => ({ live: l, when: computeWhen(l.startsAt) })),
    [lives],
  );

  if (lives.length === 0) return null;

  return (
    <section className="space-y-5" aria-labelledby="upcoming-title">
      <header className="flex items-center gap-3">
        <Calendar className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />
        <h2
          id="upcoming-title"
          className="text-[length:var(--ts-xl)] sm:text-[length:var(--ts-2xl)] font-bold text-[var(--text-primary)]"
        >
          Próximas transmisiones
        </h2>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {decorated.map(({ live, when }) => {
          const reminded = reminders[live.id] ?? false;
          return (
            <article
              key={live.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-[var(--rule-muted)] bg-[var(--surface-raised)] transition-shadow hover:shadow-md"
            >
              <div className="relative aspect-video bg-[var(--surface-sunken)]">
                <Image
                  src={live.thumbnail}
                  alt={live.title}
                  fill
                  sizes="(min-width: 1024px) 340px, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
                <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur-sm px-2.5 py-1 text-[length:var(--ts-xs)] font-semibold text-white">
                  <Calendar className="h-3 w-3" aria-hidden />
                  {when.label}
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-center gap-1.5 text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)]">
                  <Store className="h-3.5 w-3.5" aria-hidden />
                  {live.storeName}
                </div>

                <h3 className="text-[length:var(--ts-base)] font-bold leading-tight text-[var(--text-primary)] line-clamp-2">
                  {live.title}
                </h3>

                <p className="text-[length:var(--ts-sm)] text-[var(--text-tertiary)] line-clamp-2">
                  {live.description}
                </p>

                <div className="mt-auto pt-3">
                  <button
                    type="button"
                    onClick={() => toggle(live.id)}
                    aria-pressed={reminded}
                    aria-label={
                      reminded
                        ? `Quitar recordatorio de ${live.title}`
                        : `Recordarme cuando empiece ${live.title}`
                    }
                    className={
                      reminded
                        ? "inline-flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-2 text-[length:var(--ts-sm)] font-semibold text-[var(--accent)] w-full justify-center"
                        : "inline-flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] w-full justify-center"
                    }
                  >
                    {reminded ? (
                      <>
                        <BellOff className="h-4 w-4" aria-hidden />
                        Te avisaremos
                      </>
                    ) : (
                      <>
                        <Bell className="h-4 w-4" aria-hidden />
                        Recordar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
