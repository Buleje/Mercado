"use client";

/**
 * Una fila de secciones para pasar de una a otra dentro de una vista, con el
 * mismo aspecto que la barra de Caja (`caja/CajaSecciones.tsx`), pero sin los
 * grupos: una lista plana. Brandon (10-10): «organizar tipo en pestaña, hacer
 * sección para pasar de una a otra para organizarme mejor».
 *
 * Teclado: ← → recorren las secciones que se ven (patrón ARIA de tabs),
 * Inicio/Fin van a la primera y a la última. Lo que no entra en la fila va al
 * «Más ▾» (priority+, Brandon 19-10), con el MISMO cálculo y medidor que la
 * barra del módulo (`AdminTabBar`): la elegida siempre se ve.
 * Quién la usa decide dónde se recuerda la última (normalmente `?sub=`).
 */
import { useEffect, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { repartirPestanas } from "@/lib/admin/pestanas-que-entran";
import { anchoUtil, leerMedidor, useConMedidor, usePestanasQueEntran } from "@/hooks/use-pestanas-que-entran";
import { MedidorDePestanas, PestanasMas, Texto, type PestanaDelMas } from "./pestanas-mas";

export interface SeccionDeBarra<T extends string> {
  clave: T;
  rotulo: string;
  /** Una cifra chica al lado del rótulo (cuántos hay que mirar ahí). */
  cuenta?: number;
}

interface Props<T extends string> {
  secciones: readonly SeccionDeBarra<T>[];
  activa: T;
  onCambiar: (clave: T) => void;
  /** Para el lector de pantalla: «Secciones de Me deben». */
  etiqueta: string;
  /** El `id` del panel que cambia (el `tabpanel`); cada pestaña lo controla. */
  idPanel: string;
  /**
   * «alerta» (por defecto): la cifra en rojo, sólo si hay algo que mirar.
   * «neutro»: cuántas hay en cada sección (la libreta), en gris y también el 0.
   */
  tonoCuenta?: "alerta" | "neutro";
}

export const idPestanaDeSeccion = (idPanel: string, clave: string) => `${idPanel}-pestana-${clave}`;

/* Sólo un clic o una flecha mueven el foco a la elegida; al cargar la página no. */
let enfocarActiva = false;

const BOTON = "inline-flex min-h-12 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition-colors";
const CUENTA_NEUTRA =
  "rounded-full bg-[var(--surface-sunken)] px-1.5 text-sm font-bold tabular-nums text-[var(--text-tertiary)] ring-1 ring-[var(--rule-soft)]";
const CUENTA_ALERTA = "rounded-full bg-[var(--data-error-500)]/15 px-1.5 text-sm font-bold tabular-nums text-[var(--data-error-ink)]";

/** Rótulo y cifra de una sección: el mismo en el botón y en su copia medida. */
function Contenido({ rotulo, cuenta, tono, copia = false }: { rotulo: string; cuenta?: number; tono: "alerta" | "neutro"; copia?: boolean }) {
  return (
    <>
      <Texto texto={rotulo} copia={copia} />
      {tono === "neutro" && cuenta !== undefined ? (
        <span className={CUENTA_NEUTRA}>
          <Texto texto={String(cuenta)} copia={copia} />
        </span>
      ) : cuenta ? (
        <span className={CUENTA_ALERTA}>
          <Texto texto={String(cuenta)} copia={copia} />
        </span>
      ) : null}
    </>
  );
}

export function BarraDeSecciones<T extends string>({ secciones, activa, onCambiar, etiqueta, idPanel, tonoCuenta = "alerta" }: Props<T>) {
  const raiz = useRef<HTMLDivElement>(null);
  const medidor = useRef<HTMLDivElement>(null);
  const conMedidor = useConMedidor();
  const claves: string[] = secciones.map((s) => s.clave);

  /* Qué secciones entran. El medidor va EN el flujo (alto 0): su ancho natural
     sostiene el de la barra cuando quien la contiene la mide por su contenido
     (filas `flex-wrap`), así esconder una sección no achica el lugar disponible. */
  const reparto = usePestanasQueEntran(
    () => {
      const m = leerMedidor(medidor.current);
      const ancho = anchoUtil(raiz.current);
      if (!m || ancho <= 0) return null;
      return repartirPestanas({ ids: claves, anchos: m.anchos, anchoMas: m.anchoMas, separacion: m.separacion, disponible: ancho, activa });
    },
    () => [raiz.current, medidor.current],
    [conMedidor, claves.join(","), activa, secciones.map((s) => s.cuenta ?? "").join(",")].join("|"),
  );
  const porClave = new Map(secciones.map((s) => [s.clave as string, s]));
  const deClaves = (ids: readonly string[]) => ids.map((id) => porClave.get(id)).filter((s): s is SeccionDeBarra<T> => Boolean(s));
  const visibles = reparto ? deClaves(reparto.visibles) : secciones;
  const escondidas: PestanaDelMas[] = reparto
    ? deClaves(reparto.escondidas).map((s) => ({
        id: s.clave,
        label: s.rotulo,
        badge: tonoCuenta === "alerta" ? s.cuenta || undefined : s.cuenta,
      }))
    : [];

  /* Sin medir (primer cuadro, sin ResizeObserver): el carril se desliza y la elegida queda a la vista. */
  useEffect(() => {
    const c = raiz.current;
    if (!c) return;
    const elegida = c.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    /* Elegida desde el «Más»: recién se ve cuando se vuelve a repartir; hasta ahí no se suelta el aviso. */
    if (enfocarActiva && elegida) {
      enfocarActiva = false;
      elegida.focus({ preventScroll: true });
    }
    if (!elegida || reparto || c.scrollWidth <= c.clientWidth) return;
    const rc = c.getBoundingClientRect();
    const ra = elegida.getBoundingClientRect();
    c.scrollLeft += ra.left + ra.width / 2 - (rc.left + rc.width / 2);
  }, [activa, reparto]);

  const ir = (clave: T) => {
    if (clave === activa) return;
    enfocarActiva = true;
    onCambiar(clave);
  };

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = visibles.findIndex((s) => s.clave === activa);
    const ultima = visibles.length - 1;
    const destino =
      e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? ultima : null;
    if (destino == null || destino < 0 || destino > ultima || destino === i) return;
    e.preventDefault();
    ir(visibles[destino].clave);
  };

  return (
    <div ref={raiz} className={cn("min-w-0 max-w-full", !reparto && "overflow-x-auto scrollbar-none")}>
      <div className="flex w-max max-w-full items-center gap-1 rounded-xl bg-[var(--surface-sunken)]">
        <div className="flex items-center gap-1" role="tablist" aria-label={etiqueta} onKeyDown={alTeclear}>
          {visibles.map((s) => {
            const elegida = s.clave === activa;
            return (
              <button
                key={s.clave}
                type="button"
                role="tab"
                id={idPestanaDeSeccion(idPanel, s.clave)}
                aria-controls={idPanel}
                aria-selected={elegida}
                tabIndex={elegida ? 0 : -1}
                onClick={() => ir(s.clave)}
                className={cn(
                  BOTON,
                  elegida
                    ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--rule-base)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                <Contenido rotulo={s.rotulo} cuenta={s.cuenta} tono={tonoCuenta} />
              </button>
            );
          })}
        </div>
        {escondidas.length > 0 && (
          <PestanasMas
            estilo="seccion"
            escondidas={escondidas}
            onElegir={(clave) => ir(clave as T)}
            conContador={tonoCuenta === "alerta"}
          />
        )}
      </div>
      {conMedidor && (
        <MedidorDePestanas
          medidorRef={medidor}
          fuera={false}
          tabs={secciones.map((s) => ({ id: s.clave, label: s.rotulo, badge: s.cuenta }))}
          claseTab={BOTON}
          claseFila="gap-1"
          estiloMas="seccion"
          conContador={tonoCuenta === "alerta" && secciones.some((s) => s.cuenta)}
          copia={(t) => (
            <Contenido rotulo={t.label} cuenta={typeof t.badge === "number" ? t.badge : undefined} tono={tonoCuenta} copia />
          )}
        />
      )}
    </div>
  );
}
