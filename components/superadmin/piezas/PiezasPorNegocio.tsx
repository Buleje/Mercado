"use client";

/**
 * «Piezas a medida» por negocio (ADR-457): una columna por cada pieza y lugar
 * donde puede entrar, una fila por negocio. Se monta bajo la matriz de módulos
 * (`SpecializationsClient`) y comparte su buscador: es la MISMA pantalla, no
 * otro sistema de interruptores.
 *
 * El rubro es sólo lectura: sale del negocio y se cambia donde siempre.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Ruler } from "@buleje/design-system/icons";
import { SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { EnchufeId } from "@/extensiones/_contrato";
import type { FilaDeLaMatriz, PiezaDelCatalogo } from "@/lib/extensiones/resolver";
import { comoObjeto } from "./campos-de-schema";
import { CeldaPieza } from "./CeldaPieza";
import { OpcionesPiezaModal, type PiezaAbierta } from "./OpcionesPiezaModal";
import { ROTULO_ENCHUFE } from "./etiquetas";
import { usePiezasSuperadmin } from "./use-piezas-superadmin";

export interface NegocioDePieza {
  id: string;
  slug: string;
  name: string;
  industry: string;
  plan: string;
}

interface Columna {
  pieza: PiezaDelCatalogo;
  enchufe: EnchufeId;
}

/** Bajo 640 px cada negocio es una tarjeta y cada celda una línea «rótulo ··· valor» (el `<thead>` se esconde). */
const CELDA_MOVIL =
  "max-sm:flex max-sm:items-center max-sm:justify-between max-sm:gap-3 max-sm:border-t max-sm:border-[var(--rule-soft)] max-sm:px-0 max-sm:py-2 max-sm:before:max-w-[45%] max-sm:before:text-left max-sm:before:font-bold max-sm:before:text-[var(--text-primary)] max-sm:before:content-[attr(data-label)]";

const clave = (t: string, p: string, e: string) => `${t}:${p}:${e}`;

export function PiezasPorNegocio({ negocios }: { negocios: NegocioDePieza[] }) {
  const { catalogo, matriz, cargando, error: errorDeCarga, recargar, guardar } = usePiezasSuperadmin();
  /** Todas las celdas que están guardando AHORA: dos a la vez no se pisan el «cargando». */
  const [pendientes, setPendientes] = useState<ReadonlySet<string>>(new Set());
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<PiezaAbierta | null>(null);

  const columnas = useMemo<Columna[]>(
    () => catalogo.flatMap((pieza) => pieza.enchufes.map((enchufe) => ({ pieza, enchufe }))),
    [catalogo],
  );
  const filas = useMemo(() => new Map(matriz.map((f) => [clave(f.tenantId, f.piezaId, f.enchufe), f])), [matriz]);
  const huerfanas = matriz.filter((f) => f.huerfana);

  async function alternar(n: NegocioDePieza, { pieza, enchufe }: Columna, fila?: FilaDeLaMatriz) {
    const prender = !fila?.prendida;
    const sirven = fila?.opcionesValidas === true;
    // Sin opciones que sirvan ni valores por defecto (`{}` no vale), el servidor no deja guardar:
    // se abren las opciones y se guarda desde ahí, prendiendo o apagando según lo que se pidió.
    if (!sirven && pieza.opcionesPorDefecto === null) {
      setAbierta({ tenantId: n.id, tenantNombre: n.name, pieza, enchufe, fila, prender });
      return;
    }
    const k = clave(n.id, pieza.id, enchufe);
    setPendientes((p) => new Set(p).add(k));
    setAviso(null);
    // Se conservan las opciones del negocio, salvo que ya no sirvan.
    const opciones = sirven ? comoObjeto(fila.opciones) : (pieza.opcionesPorDefecto ?? {});
    const r = await guardar({ tenantId: n.id, piezaId: pieza.id, enchufe, prendida: prender, opciones });
    if (!r.ok) setAviso(r.mensaje);
    setPendientes((p) => {
      const queda = new Set(p);
      queda.delete(k);
      return queda;
    });
  }

  const guardarOpciones = (a: PiezaAbierta, opciones: Record<string, unknown>, rotulos: Record<string, string>) =>
    guardar(
      { tenantId: a.tenantId, piezaId: a.pieza.id, enchufe: a.enchufe, prendida: a.prender ?? a.fila?.prendida ?? false, opciones },
      rotulos,
    );

  return (
    <section className="mt-10 space-y-4" data-seccion="piezas">
      <div className="flex items-center gap-2">
        <Ruler className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />
        <SectionTitle>Piezas a medida</SectionTitle>
        <InfoTip
          title="Piezas a medida"
          what="Código hecho para un negocio concreto. Lo escribimos en archivos; aquí solo decides quién lo tiene prendido y con qué opciones."
          affects="Se nota al instante en el panel o la tienda de ese negocio. Si una pieza falla, se ve la versión normal."
          example="Prendes «Cierre para el contador» en una bodega y en su panel aparece la pestaña «A medida» con el Excel del mes."
        />
      </div>

      {(errorDeCarga || aviso) && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div className="flex-1">{errorDeCarga ?? aviso}</div>
          {errorDeCarga && (
            <button type="button" onClick={() => void recargar()} className="font-bold underline">
              Reintentar
            </button>
          )}
        </div>
      )}

      {cargando ? (
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--rule-base)] p-6 text-[var(--text-secondary)]" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Cargando las piezas…
        </div>
      ) : columnas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--rule-base)] p-8 text-center text-[var(--text-tertiary)]">
          Todavía no hay piezas en el código.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <table className="w-full text-sm max-sm:block">
            <thead className="bg-[var(--surface-sunken)] text-left max-sm:hidden">
              <tr>
                <th scope="col" className="sticky left-0 z-10 bg-[var(--surface-sunken)] px-4 py-3 font-bold text-[var(--text-primary)]">
                  Negocio
                </th>
                <th scope="col" className="px-4 py-3 font-bold text-[var(--text-primary)]">
                  Rubro
                </th>
                {columnas.map(({ pieza, enchufe }) => (
                  <th key={`${pieza.id}:${enchufe}`} scope="col" className="min-w-40 px-4 py-3 text-center font-bold text-[var(--text-primary)]">
                    <div className="flex flex-col items-center gap-1">
                      <span>{pieza.nombre}</span>
                      <span className="text-xs font-medium text-[var(--text-tertiary)]">{ROTULO_ENCHUFE[enchufe]}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="max-sm:grid max-sm:gap-3 max-sm:p-3">
              {negocios.map((n) => (
                <tr key={n.id} className="border-t border-[var(--rule-soft)] align-top max-sm:block max-sm:rounded-xl max-sm:border max-sm:border-[var(--rule-base)] max-sm:p-3">
                  <th scope="row" className="sticky left-0 z-10 bg-[var(--surface-raised)] px-4 py-3 text-left max-sm:static max-sm:block max-sm:px-0 max-sm:pt-0">
                    <div className="font-bold text-[var(--text-primary)]">{n.name}</div>
                    <div className="text-xs font-normal text-[var(--text-tertiary)]">{n.slug}</div>
                  </th>
                  <td data-label="Rubro" className={`${CELDA_MOVIL} px-4 py-3 text-[var(--text-secondary)]`}>{n.industry}</td>
                  {columnas.map((c) => {
                    const fila = filas.get(clave(n.id, c.pieza.id, c.enchufe));
                    const k = clave(n.id, c.pieza.id, c.enchufe);
                    return (
                      <td key={k} data-label={`${c.pieza.nombre} · ${ROTULO_ENCHUFE[c.enchufe]}`} className={`${CELDA_MOVIL} px-4 py-3`}>
                        <CeldaPieza
                          fila={fila}
                          pendiente={pendientes.has(k)}
                          nombre={`${c.pieza.nombre} en ${n.name}`}
                          onAlternar={() => void alternar(n, c, fila)}
                          onOpciones={() => setAbierta({ tenantId: n.id, tenantNombre: n.name, pieza: c.pieza, enchufe: c.enchufe, fila })}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {negocios.length === 0 && (
            <p className="p-8 text-center text-[var(--text-tertiary)]">Sin negocios que coincidan con la búsqueda.</p>
          )}
        </div>
      )}

      {huerfanas.length > 0 && (
        <div role="status" className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-4 text-sm text-[var(--data-warning-700)]">
          <p className="font-bold">Filas de piezas que ya no existen en el código (no hacen nada):</p>
          <ul className="mt-1 list-disc pl-5">
            {huerfanas.map((f) => (
              <li key={f.id}>
                {f.tenantNombre} · {f.piezaId} · {f.enchufe in ROTULO_ENCHUFE ? ROTULO_ENCHUFE[f.enchufe as EnchufeId] : f.enchufe}
              </li>
            ))}
          </ul>
        </div>
      )}

      <OpcionesPiezaModal abierta={abierta} onClose={() => setAbierta(null)} onGuardar={guardarOpciones} />
    </section>
  );
}
