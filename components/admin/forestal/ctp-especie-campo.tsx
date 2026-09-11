"use client";

/**
 * El campo «Especie», con el catálogo de la planta pegado al lado (ADR-410).
 *
 * El catálogo editable nació en el cubicador. Pero la especie se escribe en
 * media docena de pantallas más —al programar un lote, al corregirlo, al cubicar
 * lo que salió de la sierra, al pegar la planilla del turno, al repartir la
 * rolliza— y en TODAS la lista seguía siendo `ESPECIES_MADERA`, la constante del
 * código. Una planta que daba de alta «Cumala blanca» la veía en el cubicador y
 * no al programar el lote de cumala blanca: el catálogo existía a medias.
 *
 * Acá vive la pieza única: el selector y, pegado, el botón que abre el catálogo
 * para crear, renombrar o quitar SIN salir de la pantalla — mandar a otro lado
 * en medio de una carga es perder la carga.
 *
 * Tres reglas que la pieza respeta:
 *
 *  1. **Lo ya cargado nunca desaparece del selector.** Si un lote viejo dice
 *     «Moena amarilla» y hoy el catálogo no la ofrece, la opción se agrega
 *     igual; si no, el `<select>` abriría vacío y el primer guardado borraría
 *     la especie en silencio.
 *  2. **El catálogo no manda sobre lo que hay en el patio.** Donde las opciones
 *     salen de la madera existente (armar un lote), esas van primero con su
 *     stock y el catálogo aporta el resto, dicho como lo que es: sin madera en
 *     el patio todavía.
 *  3. **Mientras el catálogo no llegó se ofrecen las de fábrica.** Quedarse sin
 *     especies porque el servidor no respondió sería peor que no poder editarlas.
 */

import { useCallback, useMemo, useState } from "react";
import { Settings2, Trees } from "@buleje/design-system/icons";
import { ESPECIES_MADERA } from "@/lib/forestal/cubicacion";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { especiesDisponibles } from "@/lib/forestal/especies-catalogo";
import CtpEspeciesCatalogoModal from "./CtpEspeciesCatalogoModal";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import { I } from "./ctp-shared";

/** Una especie que ofrece la pantalla desde SU fuente (el patio, el lote…). */
export interface OpcionEspecie {
  nombre: string;
  /** Lo que se dice al lado del nombre: «12 pza · 3.400 m³». */
  meta?: string;
}

export interface CatalogoUI {
  /** Los nombres a ofrecer (catálogo del tenant, o las de fábrica si no cargó). */
  nombres: string[];
  /** El científico que el catálogo sabe de esa especie, si sabe alguno. */
  cientificoDe: (nombre: string) => string | null;
  /** Abre el catálogo para crear / renombrar / quitar. */
  abrir: () => void;
  /** El modal, para que quien monta lo dibuje una sola vez. */
  modal: React.ReactNode;
  recargar: () => Promise<void>;
}

/**
 * El catálogo listo para usar en una pantalla: lista, botón y modal.
 *
 * Un solo `useEspeciesConCatalogo()` por pantalla — no uno por fila. En una
 * grilla de veinte filas, veinte hooks son veinte pedidos al servidor de la
 * misma lista.
 */
export function useEspeciesConCatalogo(): CatalogoUI {
  const cat = useEspeciesCatalogo();
  const [abierto, setAbierto] = useState(false);

  const nombres = useMemo(
    () => (cat.nombres.length > 0 ? cat.nombres : [...ESPECIES_MADERA]),
    [cat.nombres],
  );

  /* El científico va por clave: el que cargó «TORNILLO» en mayúsculas tiene que
     encontrar el mismo Cedrelinga que el que cargó «Tornillo». */
  const cientificos = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of especiesDisponibles(cat.catalogo)) {
      if (e.cientifico) m.set(e.clave, e.cientifico);
    }
    return m;
  }, [cat.catalogo]);

  const cientificoDe = useCallback(
    (nombre: string) => cientificos.get(claveEspecie(nombre)) ?? null,
    [cientificos],
  );

  return {
    nombres,
    cientificoDe,
    abrir: useCallback(() => setAbierto(true), []),
    recargar: cat.recargar,
    modal: abierto ? (
      <CtpEspeciesCatalogoModal
        open
        onClose={() => setAbierto(false)}
        onCambio={() => void cat.recargar()}
      />
    ) : null,
  };
}

/** El botón que abre el catálogo, para una barra de herramientas. */
export function CtpEspeciesBoton({
  onClick,
  className = "",
  texto = "Especies",
}: {
  onClick: () => void;
  className?: string;
  texto?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Especies del aserradero: crear, renombrar, quitar"
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)] ${className}`}
    >
      <Trees className="h-3.5 w-3.5" aria-hidden /> {texto}
    </button>
  );
}

/** El engranaje cuadrado que va pegado a un campo. */
function BotonCatalogo({ onClick, alto = "h-11 w-11" }: { onClick: () => void; alto?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Especies del aserradero: crear, renombrar, quitar"
      title="Especies del aserradero: crear, renombrar, quitar"
      className={`grid ${alto} shrink-0 place-items-center rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]`}
    >
      <Settings2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

/**
 * Une lo que ofrece la pantalla, lo que ofrece el catálogo y lo ya elegido,
 * sin repetir por clave y respetando ese orden de prioridad.
 */
function unir(
  opciones: readonly OpcionEspecie[],
  nombres: readonly string[],
  value: string,
): { nombre: string; meta?: string; delCatalogo: boolean }[] {
  const vistas = new Set<string>();
  const salida: { nombre: string; meta?: string; delCatalogo: boolean }[] = [];
  const push = (nombre: string, meta: string | undefined, delCatalogo: boolean) => {
    const clave = claveEspecie(nombre);
    if (!clave || vistas.has(clave)) return;
    vistas.add(clave);
    salida.push({ nombre, meta, delCatalogo });
  };
  for (const o of opciones) push(o.nombre, o.meta, false);
  for (const n of nombres) push(n, undefined, true);
  /* Lo que ya está guardado va sí o sí —y sin cartel: el selector no puede
     perder el valor que muestra sólo porque el catálogo ya no lo ofrece, y en
     una celda de grilla el aclaratorio sólo le come el ancho al nombre. */
  if (value.trim()) push(value.trim(), undefined, true);
  return salida;
}

/**
 * Selector de especie. `opciones` es lo que la pantalla ya sabía ofrecer (el
 * patio, por ejemplo); el catálogo aporta el resto, agrupado aparte cuando hay
 * de las dos clases.
 */
export function CtpEspecieSelect({
  value,
  onChange,
  catalogo,
  opciones = [],
  vacio = "Seleccione…",
  etiquetaCatalogo = "Del catálogo (sin madera en el patio)",
  etiquetaOpciones = "En el patio",
  className = I,
  ariaLabel = "Especie",
  disabled = false,
  conBoton = true,
  altoBoton,
}: {
  value: string;
  onChange: (v: string) => void;
  catalogo: CatalogoUI;
  opciones?: readonly OpcionEspecie[];
  vacio?: string;
  etiquetaCatalogo?: string;
  etiquetaOpciones?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  conBoton?: boolean;
  altoBoton?: string;
}) {
  const lista = useMemo(
    () => unir(opciones, catalogo.nombres, value),
    [opciones, catalogo.nombres, value],
  );
  const delPatio = lista.filter((e) => !e.delCatalogo);
  const delCatalogo = lista.filter((e) => e.delCatalogo);
  const agrupar = delPatio.length > 0 && delCatalogo.length > 0;

  const opcion = (e: (typeof lista)[number]) => (
    <option key={e.nombre} value={e.nombre}>
      {e.meta ? `${e.nombre} — ${e.meta}` : e.nombre}
    </option>
  );

  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${className} min-w-0 flex-1`}
      >
        <option value="">{vacio}</option>
        {agrupar ? (
          <>
            <optgroup label={etiquetaOpciones}>{delPatio.map(opcion)}</optgroup>
            <optgroup label={etiquetaCatalogo}>{delCatalogo.map(opcion)}</optgroup>
          </>
        ) : (
          lista.map(opcion)
        )}
      </select>
      {conBoton && !disabled && <BotonCatalogo onClick={catalogo.abrir} alto={altoBoton} />}
    </div>
  );
}

/**
 * Campo de especie ESCRIBIBLE (input + datalist), para donde la especie puede
 * ser una que todavía no está en ninguna lista — el inventario previo al
 * sistema, la planilla pegada del turno. El catálogo sugiere; no obliga.
 */
export function CtpEspecieInput({
  id,
  value,
  onChange,
  catalogo,
  opciones = [],
  placeholder = "Tornillo, Capirona…",
  className = I,
  ariaLabel = "Especie",
  conBoton = true,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  catalogo: CatalogoUI;
  opciones?: readonly OpcionEspecie[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  conBoton?: boolean;
}) {
  const lista = useMemo(() => unir(opciones, catalogo.nombres, ""), [opciones, catalogo.nombres]);
  return (
    <div className="flex items-center gap-1.5">
      <input
        list={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${className} min-w-0 flex-1`}
      />
      <datalist id={id}>
        {lista.map((e) => (
          <option key={e.nombre} value={e.nombre}>
            {e.meta}
          </option>
        ))}
      </datalist>
      {conBoton && <BotonCatalogo onClick={catalogo.abrir} />}
    </div>
  );
}
