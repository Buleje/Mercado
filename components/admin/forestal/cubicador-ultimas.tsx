"use client";

/**
 * Las últimas piezas del lote, en «Cargar» (Brandon 24-10: «en bloque de
 * últimas, quiero que la mejores poniendo los 4 últimos en una tabla con sus
 * columnas y todo… ponle al lado derecho de dictar y cargar para que todo esté
 * en una misma fila»). Antes eran cuatro chips con la medida y nada más.
 *
 * - Las MISMAS columnas que la tabla del lote y en su MISMO orden: llega
 *   `columnas` = las visibles de esa tabla, en el orden que les dio el
 *   operario. Lo que se oculta o se mueve en «Lote» se oculta o se mueve acá.
 * - La primera fila es la recién cargada (`masNuevasPrimero`, el orden de «Más
 *   nuevas primero») y el N° es el de la tabla del lote (`numeroDeFila` con su
 *   orden): el mismo número en las dos pantallas.
 * - De sólo lectura (para corregir una medida está la tabla), salvo borrar la
 *   pieza: es lo que se hace al ver una medida mal dictada, y el aviso trae su
 *   «Deshacer».
 * - Acá no se suma nada: los totales del lote están en «Lo que llevas medido»,
 *   arriba, y en la barra de secciones.
 *
 * Con el lote vacío la caja queda en pie con una frase: si apareciera con la
 * primera pieza, el micrófono de al lado saltaría de lugar a mitad del dictado.
 */
import { useMemo, type ReactNode } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import { AlertTriangle, History, Layers, Table, Trash2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { etiquetaApartado, type ApartadosAsignados, type NombresApartado } from "@/lib/forestal/cubicacion-apartados";
import { medidaSospechosa, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { fechaHoraDeRegistro } from "@/lib/forestal/cubicacion-formato";
import { tipoDePieza } from "@/lib/forestal/cubicacion-tipo";
import { masNuevasPrimero, numeroDeFila, type OrdenFilas } from "@/lib/forestal/cubicador-bloques-especie";
import { colorClaseApartado } from "./cubicacion-apartados";
import type { ColOpcional } from "./cubicador-columnas-menu";
import { TipoBadge } from "./tipo-badge";
import { CELDAS_FLEX_EN_FILA, HOJA_MOVIL } from "./loth-tablero-estilos";

const ULTIMAS = 4;

/**
 * La unidad va en el título, como en la tabla del lote (Brandon, 2026-09-23),
 * en una segunda línea: al lado de «Dictar y cargar» la caja mide la mitad y
 * cada columna angosta deja ver una más sin desplazar.
 */
const unidad = (u: string) => <span className="block font-normal normal-case">({u})</span>;
const CABECERA: Record<ColOpcional, ReactNode> = {
  fecha: <>Fecha {unidad("hora")}</>,
  numero: "N°",
  cant: "Cant.",
  especie: "Especie",
  espesor: <>Espesor {unidad("pulg")}</>,
  ancho: <>Ancho {unidad("pulg")}</>,
  largo: <>Largo {unidad("pies")}</>,
  medida: "Medida",
  tipo: "Tipo",
  codigo: "Código",
  dueno: "Dueño",
  apartado: "Apartado",
  m3: "m³",
  pt: "Pie tablar",
  observacion: "Observación",
};
const A_LA_DERECHA = new Set<ColOpcional>(["m3", "pt"]);
const AL_CENTRO = new Set<ColOpcional>(["numero", "cant"]);
const UNIDAD_ESTANDAR = { espesor: "pulg", ancho: "pulg", largo: "pies" } as const;

const VACIO = <span className="text-[var(--text-tertiary)]">—</span>;

interface Contexto {
  indice: number;
  total: number;
  ordenFilas: OrdenFilas;
  asignados: ApartadosAsignados;
  nombresApartado: NombresApartado;
  fmtPt: (v: number) => string;
  fmtM3: (v: number) => string;
}

/** Una medida con su unidad sólo si no es la del título (vino en cm, por ejemplo). */
function dimension(v: number, u: string, estandar: string): ReactNode {
  return u === estandar ? v : <>{v} <span className="text-xs text-[var(--text-tertiary)]">{u}</span></>;
}

/** El contenido de una celda: lo mismo que muestra la tabla del lote, sin editar. */
function contenido(key: ColOpcional, r: PiezaCubicada, c: Contexto): ReactNode {
  switch (key) {
    case "fecha": return <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{fechaHoraDeRegistro(r.registradoAt)}</span>;
    case "numero": return <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{numeroDeFila(c.indice, c.total, c.ordenFilas)}</span>;
    case "cant": return <span className="font-mono font-bold tabular-nums">{r.cantidad}</span>;
    case "especie": return r.especie ? <span className="font-bold text-[var(--text-secondary)]">{r.especie}</span> : VACIO;
    case "espesor": return <span className="font-mono tabular-nums">{dimension(r.espesor, r.uEspesor, UNIDAD_ESTANDAR.espesor)}</span>;
    case "ancho": return <span className="font-mono tabular-nums">{dimension(r.ancho, r.uAncho, UNIDAD_ESTANDAR.ancho)}</span>;
    case "largo": return <span className="font-mono tabular-nums">{dimension(r.largo, r.uLargo, UNIDAD_ESTANDAR.largo)}</span>;
    case "medida": return <span className="font-mono font-bold tabular-nums text-[var(--text-secondary)]">{r.espesor}×{r.ancho}×{r.largo}</span>;
    case "tipo": return <TipoBadge tipo={tipoDePieza(r)} />;
    case "codigo": return r.codigo ? <span className="font-mono">{r.codigo}</span> : VACIO;
    case "dueno": return r.dueno || VACIO;
    case "apartado": {
      const n = c.asignados[r.id];
      return n != null ? <span className={`font-mono font-bold ${colorClaseApartado(n)}`}>{etiquetaApartado(n, c.nombresApartado)}</span> : VACIO;
    }
    case "m3": return <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{c.fmtM3(r.m3)}</span>;
    case "pt": return <span className="font-mono tabular-nums text-[var(--text-secondary)]">{c.fmtPt(r.pieTablar)}</span>;
    case "observacion": return r.observacion ? <span className="block max-w-[14rem] truncate" title={r.observacion}>{r.observacion}</span> : VACIO;
  }
}

const alineacion = (key: ColOpcional) => (A_LA_DERECHA.has(key) ? "text-right" : AL_CENTRO.has(key) ? "text-center" : "");

export function UltimasDelLote({
  rows, columnas, ordenFilas, asignados, nombresApartado, avisarRaras, fmtPt, fmtM3, onVerLote, onBorrar, apartado,
}: {
  rows: readonly PiezaCubicada[];
  /** Las columnas visibles de la tabla del lote, en su orden. */
  columnas: readonly ColOpcional[];
  /** El orden de la tabla del lote: de él sale el N°. */
  ordenFilas: OrdenFilas;
  asignados: ApartadosAsignados;
  nombresApartado: NombresApartado;
  /** Si el operario apagó el aviso de medidas raras, acá tampoco se avisa. */
  avisarRaras: boolean;
  fmtPt: (v: number) => string;
  fmtM3: (v: number) => string;
  onVerLote: () => void;
  /** Borra la pieza (con su «Deshacer» en el aviso, como en la tabla). */
  onBorrar: (id: string) => void;
  /** El apartado en curso, para cerrarlo sin ir al lote. */
  apartado?: { letra: string; piezas: number; pt: number; onCerrar: () => void };
}) {
  const ultimas = useMemo(() => {
    const indice = new Map(rows.map((r, i) => [r.id, i]));
    return masNuevasPrimero(rows).slice(0, ULTIMAS).map((r) => ({ r, indice: indice.get(r.id) ?? 0 }));
  }, [rows]);
  const ctx = { total: rows.length, ordenFilas, asignados, nombresApartado, fmtPt, fmtM3 };

  return (
    <section
      aria-label="Lo último que cargaste"
      className="min-w-0 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <History className="h-4 w-4 text-[var(--accent)]" aria-hidden /> Últimas
            {rows.length > 0 && (
              <span className="font-mono text-xs font-semibold tabular-nums text-[var(--text-tertiary)]">
                {ultimas.length} de {rows.length}
              </span>
            )}
          </CardTitle>
          <InfoTip
            side="bottom"
            title="Lo último que cargaste"
            ariaLabel="Qué muestra Últimas"
            what="Las 4 piezas más nuevas, la recién dictada arriba. Mismas columnas y mismo orden que la tabla del lote: si ocultas o mueves una columna allá, cambia acá."
            example="Para corregir una medida, «Ver el lote». Para sacarla, el tacho de su fila (el aviso trae Deshacer)."
          />
        </div>
        {rows.length > 0 && (
          <button type="button" onClick={onVerLote} className={button({ variant: "secondary", className: "gap-1.5 rounded-xl" })}>
            <Table className="h-4 w-4" aria-hidden /> Ver el lote
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-4 text-sm text-[var(--text-tertiary)]">
          Lo que dictes o cargues aparece acá, lo más nuevo arriba.
        </p>
      ) : (
        /* Tabla también a 400 px (`hoja-grilla`): en tarjetas, 4 filas medían 997 px; así se desplaza dentro de su caja. */
        <DataTable planilla className={`w-full text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap ${HOJA_MOVIL} ${CELDAS_FLEX_EN_FILA}`}>
          <thead>
            <tr>
              {columnas.map((k) => <th key={k} scope="col" className={alineacion(k)}>{CABECERA[k]}</th>)}
              <th scope="col" className="text-right"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {ultimas.map(({ r, indice }, i) => {
              const rara = avisarRaras && medidaSospechosa(r.espesor, r.ancho, r.largo);
              const tinte = i === 0 ? "bg-primary/10" : rara ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12" : "";
              return (
                <tr key={r.id} className={tinte}>
                  {columnas.map((k) => <td key={k} className={alineacion(k)}>{contenido(k, r, { ...ctx, indice })}</td>)}
                  <td className="text-right">
                    <span className="inline-flex items-center justify-end gap-1">
                      {rara && (
                        <span title="Medida fuera de lo común — revisa que esté bien" className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                          <AlertTriangle className="h-4 w-4" aria-label="Medida fuera de lo común" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => onBorrar(r.id)}
                        aria-label={`Borrar la pieza ${r.espesor}×${r.ancho}×${r.largo}`}
                        title="Borrar esta pieza (el aviso trae Deshacer)"
                        className={button({ variant: "ghost", size: "icon", className: "h-10 w-10 text-[var(--text-tertiary)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]" })}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}

      {apartado && apartado.piezas > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-3">
          <span className="text-sm font-semibold text-[var(--text-secondary)]">
            Apartado {apartado.letra} sin guardar ·{" "}
            <span className="font-mono tabular-nums">
              {apartado.piezas} {apartado.piezas === 1 ? "pieza" : "piezas"} · {fmtPt(apartado.pt)} PT
            </span>
          </span>
          <button type="button" onClick={apartado.onCerrar} className={button({ variant: "primary", className: "ml-auto gap-1.5 rounded-xl" })}>
            <Layers className="h-4 w-4" aria-hidden /> Cerrar apartado {apartado.letra}
          </button>
        </div>
      )}
    </section>
  );
}
