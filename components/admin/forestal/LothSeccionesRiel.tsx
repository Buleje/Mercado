"use client";

/**
 * LothSeccionesRiel — las secciones del LO-TH en UN riel.
 *
 * Antes eran dos filas apiladas (bosque arriba, transformación abajo), cada una
 * con su rótulo: ~130 px de pantalla para seis botones. Acá van en una sola
 * fila y el bosque manda: Tala → Trozado → Despacho de trozas.
 *
 * Consumo / Producto / Despacho PT (secciones 4-6) NO se borran: son parte del
 * formato oficial (RDE 264-2019, verificado contra la fuente el 2026-08-23) y
 * el PDF SERFOR las imprime igual. Pero sólo se llenan si el titular
 * transforma la madera DENTRO del título habilitante. Quien la lleva a su CTP
 * la registra en el Libro CTP, y acá esas tres quedan en cero — mostrarlas al
 * mismo nivel que la tala se leía como un libro duplicado (Brandon,
 * 2026-09-18: «esos pertenecen al libro CTP […] no conveniente duplicados»).
 * Por eso van plegadas tras «En el TH», con su cuenta a la vista para que una
 * línea asentada ahí nunca quede escondida, y la preferencia se recuerda.
 *
 * En angosto el riel se desliza en vez de envolver (mismo criterio que el riel
 * de vistas de la cabina), con el borde derecho desvanecido para que se note
 * que sigue, y la sección activa se trae a la vista sola.
 */

import { useEffect, useId, useRef } from "react";
import { Kicker } from "@buleje/design-system";
import { ArrowRight, ChevronRight } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { LOTH_SECTION_GROUPS, type LothSection } from "@/lib/forestal/loth-constants";
import { SECTION_META } from "./LothEntryForm";

/** Clave de la preferencia. Exportada: la prueba en navegador la lee. */
export const CLAVE_TRANSFORMACION_VISIBLE = "loth:secciones:transformacion-visible";

const BOSQUE = LOTH_SECTION_GROUPS.find((g) => g.key === "bosque")?.sections ?? [];
const EN_EL_TH = LOTH_SECTION_GROUPS.find((g) => g.key === "transformacion")?.sections ?? [];

const AYUDA_EN_EL_TH =
  "Consumo, producto terminado y su despacho (secciones 4 a 6): sólo si transformas la madera dentro del título habilitante. " +
  "Si la llevas a tu CTP, se registra en el Libro CTP y acá quedan en cero — así salen también en el formato SERFOR, y es correcto.";

export default function LothSeccionesRiel({
  section,
  contar,
  onSection,
  onIrAlCtp,
}: {
  section: LothSection;
  /** Líneas vigentes de cada sección (las que declara el libro). */
  contar: (s: LothSection) => number;
  onSection: (s: LothSection) => void;
  /** Si el negocio tiene Libro CTP: a dónde va la transformación. */
  onIrAlCtp?: () => void;
}) {
  const rielRef = useRef<HTMLDivElement>(null);
  const grupoId = useId();
  const [verEnElTh, setVerEnElTh] = useLocalStorage<boolean>(CLAVE_TRANSFORMACION_VISIBLE, false);
  /* La sección en la que estás nunca queda plegada (llegar a Consumo desde un
     aviso tiene que mostrar Consumo). */
  const activaEnElTh = EN_EL_TH.includes(section);
  const abierto = verEnElTh || activaEnElTh;
  const lineasEnElTh = EN_EL_TH.reduce((a, s) => a + contar(s), 0);

  /* Sólo el scroll HORIZONTAL del riel: `scrollIntoView` también movería la
     página en vertical si el riel quedara fuera de pantalla, y un salto de
     página al cambiar de sección se lee como un error. */
  useEffect(() => {
    const riel = rielRef.current;
    const activa = riel?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!riel || !activa) return;
    const izq =
      activa.getBoundingClientRect().left - riel.getBoundingClientRect().left + riel.scrollLeft;
    const der = izq + activa.offsetWidth;
    if (izq < riel.scrollLeft) riel.scrollLeft = Math.max(0, izq - 8);
    else if (der > riel.scrollLeft + riel.clientWidth) riel.scrollLeft = der - riel.clientWidth + 8;
  }, [section]);

  function alternarEnElTh() {
    // Plegar el grupo en el que estás te devuelve al bosque: si no, el botón
    // no haría nada visible (la sección activa lo mantiene abierto).
    if (abierto && activaEnElTh) onSection("tala");
    setVerEnElTh(!abierto);
  }

  return (
    <nav
      aria-label="Secciones del libro"
      className="@container rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5"
    >
      <div
        ref={rielRef}
        className="flex items-center gap-1 max-sm:overflow-x-auto max-sm:pr-6 max-sm:[mask-image:linear-gradient(to_right,black_88%,transparent)] max-sm:[scrollbar-width:none] sm:flex-wrap"
      >
        <div
          role="group"
          aria-label="Operación de bosque"
          className="flex shrink-0 items-center gap-1"
        >
          {/* El rótulo sólo si entra en la MISMA fila: se mide contra el ancho
              del riel (container query), no el de la pantalla, porque la barra
              lateral abierta o plegada cambia cuánto le toca. */}
          <Kicker
            title="Operación de bosque (RDE 264-2019, secciones 1 a 3): del árbol en pie hasta que la troza sale con GTF."
            className="hidden shrink-0 px-1 @min-[52rem]:inline"
          >
            Bosque
          </Kicker>
          {BOSQUE.map((s) => (
            <ChipSeccion
              key={s}
              s={s}
              activa={s === section}
              cuenta={contar(s)}
              onClick={() => onSection(s)}
            />
          ))}
        </div>

        <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-[var(--rule-base)]" />

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={alternarEnElTh}
            aria-expanded={abierto}
            aria-controls={grupoId}
            title={AYUDA_EN_EL_TH}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform ${abierto ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
            <span className="tabular-nums">4–6</span>
            En el TH
            {!abierto && lineasEnElTh > 0 && (
              <span className="rounded-full bg-[var(--surface-sunken)] px-1 text-xs font-semibold tabular-nums">
                {lineasEnElTh}
              </span>
            )}
          </button>
          <div
            id={grupoId}
            role="group"
            aria-label="Transformación en el TH"
            hidden={!abierto}
            className="flex shrink-0 items-center gap-1"
          >
            {EN_EL_TH.map((s) => (
              <ChipSeccion
                key={s}
                s={s}
                activa={s === section}
                cuenta={contar(s)}
                onClick={() => onSection(s)}
              />
            ))}
          </div>
          {/* Hacia dónde se fue la transformación: el libro de la planta. */}
          {!abierto && onIrAlCtp && (
            <button
              type="button"
              onClick={onIrAlCtp}
              title="Consumo, producción y despacho de lo aserrado se registran en tu Libro CTP"
              className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 dark:text-[var(--accent)]"
            >
              Libro CTP
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

function ChipSeccion({
  s,
  activa,
  cuenta,
  onClick,
}: {
  s: LothSection;
  activa: boolean;
  cuenta: number;
  onClick: () => void;
}) {
  const meta = SECTION_META[s];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? "true" : undefined}
      title={`${meta.index}. ${meta.label}: ${meta.help.toLowerCase()}`}
      className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
        activa
          ? "bg-primary/10 font-bold text-[var(--accent-ink)] dark:bg-primary/20 dark:text-[var(--accent)]"
          : "font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-xs font-bold tabular-nums ${
          activa
            ? "bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]"
            : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
        }`}
      >
        {meta.index}
      </span>
      {meta.short}
      {cuenta > 0 && (
        <span className="rounded-full bg-[var(--surface-sunken)] px-1 text-xs font-semibold tabular-nums text-[var(--text-tertiary)]">
          {cuenta}
        </span>
      )}
    </button>
  );
}
