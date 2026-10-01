"use client";

/**
 * Mandar producto terminado de vuelta a la sierra (ADR-316 · ADR-367).
 *
 * Pasa todo el tiempo: un paquete de tabla que se hincha, una tanda que sale
 * fuera de medida, madera que el cliente devuelve. Eso **no se despacha y no se
 * anula**: entra otra vez a producción y sale como otro producto.
 *
 * El invariante I6 y el saldo de la corrida origen ya vivían en el servidor
 * (`setReprocesoOrigenes`, con su endpoint) desde ADR-316 — sin una sola
 * pantalla que los usara. Esto es esa pantalla.
 *
 * Son dos actos y en este orden: primero nace la corrida **destino** (la que
 * declara qué salió) y después se le atribuye el **origen**. Si la atribución
 * falla, la corrida queda creada y se dice cómo terminarla: borrar el asiento de
 * una madera que ya volvió a la sierra sería negar un hecho.
 *
 * ## Las conversiones que hace el aserradero (ADR-407)
 *
 * El producto que sale se ofrece en dos grupos: **lo que sale de este producto**
 * y **lo que no es habitual**. Elegir del segundo grupo no está prohibido —el
 * Libro registra hechos, y bloquear el asiento de una madera que ya volvió a la
 * sierra empuja a falsear el tipo para poder anotarla— pero **hay que
 * explicarlo**: el aviso lo pide y el motivo viaja al asiento y a la auditoría.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import {
  TIPOS_PRODUCTO_SALIDA,
  presentacionSugerida,
  tipoComercialDelProducto,
} from "@/lib/forestal/loctp-catalogos";
import { avisoDeConversion, esConversionHabitual } from "@/lib/forestal/reproceso-reglas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { Btn, Field, I, ModalBody, ModalFooter } from "./ctp-shared";

export interface OrigenDeReproceso {
  id: string;
  lineNo: number | null;
  especie: string | null;
  producto: string | null;
  unidad: string | null;
  /** Lo que la corrida todavía tiene en planta: el techo de lo que se reprocesa. */
  disponible: number;
}

const hoyIso = () => new Date().toISOString().slice(0, 10);
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export default function CtpReprocesoModal({
  origen,
  sugerencia,
  onListo,
  onClose,
}: {
  origen: OrigenDeReproceso;
  /**
   * Lo que la distribución ya calculó (ADR-404): el producto que hace falta y
   * cuánto. Llega puesto para que nadie lo retipee —cada retipeo es una
   * oportunidad de declarar otra cosa— pero **es editable**: el que firma es
   * el operario, no el cálculo.
   */
  sugerencia?: { producto: string | null; m3: number; desdeTipo?: string };
  onListo: (mensaje: string, detalle: string) => void;
  onClose: () => void;
}) {
  const [fecha, setFecha] = useState(hoyIso);
  const [entra, setEntra] = useState(String(origen.disponible));
  /* Lo que la sugerencia dice que hace falta. `entra` NO se toca: cuánto
     producto vuelve a la sierra depende del saldo de esta corrida, y la
     sugerencia habla del bloque del cubicador, que puede ser otro. */
  const [sale, setSale] = useState(
    sugerencia && sugerencia.m3 > 0 ? String(r4(sugerencia.m3)) : "",
  );
  const [producto, setProducto] = useState<string>(
    sugerencia?.producto ?? TIPOS_PRODUCTO_SALIDA[0]?.valor ?? "",
  );
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** El tipo comercial del producto que entra: de él depende qué puede salir. */
  const tipoOrigen = useMemo(() => tipoComercialDelProducto(origen.producto), [origen.producto]);
  /* Dos grupos en el desplegable: primero lo que sale de este producto. Sin
     tipo conocido («MADERA ASERRADA» a secas) no se agrupa nada: no hay de qué
     afirmar que algo es raro. */
  const { habituales, otros } = useMemo(() => {
    const hab: typeof TIPOS_PRODUCTO_SALIDA = [];
    const otr: typeof TIPOS_PRODUCTO_SALIDA = [];
    for (const t of TIPOS_PRODUCTO_SALIDA) {
      const destino = tipoComercialDelProducto(t.valor);
      if (!tipoOrigen || !destino || esConversionHabitual(tipoOrigen, destino)) hab.push(t);
      else otr.push(t);
    }
    return { habituales: hab, otros: otr };
  }, [tipoOrigen]);
  const aviso = useMemo(
    () => avisoDeConversion(tipoOrigen, tipoComercialDelProducto(producto)),
    [tipoOrigen, producto],
  );

  const entraN = Number(entra) || 0;
  const saleN = Number(sale) || 0;
  /* El reproceso no CREA madera: de lo que entra sale igual o menos. No es el
     tope del 56 % —eso es troza a tabla—, es la conservación de la materia. */
  const motivos: string[] = [];
  if (!(entraN > 0)) motivos.push("Pon cuánto producto vuelve a la sierra.");
  if (entraN > origen.disponible + 0.0001) {
    motivos.push(`La corrida N° ${origen.lineNo ?? "—"} sólo tiene ${origen.disponible.toFixed(4)} disponible.`);
  }
  if (!(saleN > 0)) motivos.push("Pon cuánto salió del reproceso.");
  if (saleN > entraN + 0.0001) motivos.push("De un reproceso no puede salir más de lo que entró.");
  if (motivo.trim().length < 3) motivos.push("Escribe por qué se reprocesa: queda en el libro.");
  /* Una conversión fuera de lo habitual no se bloquea, pero no pasa con «ok»:
     lo que la sostiene ante un fiscalizador es la explicación. */
  if (aviso && motivo.trim().length < 15) {
    motivos.push("Esa conversión no es de las habituales: explica en una frase por qué salió así.");
  }

  async function guardar() {
    if (motivos.length > 0) return;
    setGuardando(true);
    setError(null);
    try {
      /* 1 · La corrida destino: es una producción más del libro, con la línea de
         RECUPERACIÓN (LRE), que es donde el Cuadro Resumen 3 espera esto. */
      const rCorrida = await fetch("/api/admin/forestal/ctp", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          section: "produccion",
          entryDate: fecha,
          speciesCommon: origen.especie,
          productType: producto,
          presentacion: presentacionSugerida(producto) ?? undefined,
          volumeInputM3: r4(entraN),
          quantity: r4(saleN),
          unit: "m3",
          lineaProduccion: "LRE",
          materiaPrimaRef: `Reproceso de la corrida N° ${origen.lineNo ?? "—"}`,
          /* La marca va en el asiento, no sólo en la auditoría: quien lea el
             libro dentro de un año tiene que ver que esa conversión se declaró
             sabiendo que no es la habitual. */
          observations: aviso
            ? `Reproceso (conversión no habitual: de ${tipoOrigen} a ${tipoComercialDelProducto(producto)}): ${motivo.trim()}`
            : `Reproceso: ${motivo.trim()}`,
        }),
      });
      const jCorrida = await rCorrida.json().catch(() => ({}));
      if (!rCorrida.ok) {
        throw new Error(jCorrida?.message ?? jCorrida?.error ?? `El servidor respondió ${rCorrida.status}`);
      }
      const destinoEntryId: string | undefined = jCorrida?.entry?.id ?? jCorrida?.id;
      if (!destinoEntryId) throw new Error("La corrida se creó pero el servidor no devolvió su id.");

      /* 2 · El origen: recién acá el producto viejo deja de estar disponible. */
      const rAtrib = await fetch("/api/admin/forestal/ctp/reproceso", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ destinoEntryId, lineas: [{ origenEntryId: origen.id, quantity: r4(entraN) }] }),
      });
      const jAtrib = await rAtrib.json().catch(() => ({}));
      if (!rAtrib.ok) {
        throw new Error(
          `${jAtrib?.message ?? jAtrib?.error ?? `El servidor respondió ${rAtrib.status}`} ` +
            "(la corrida del reproceso quedó creada sin su origen: atribúyesela desde la ficha de la corrida).",
        );
      }
      invalidarCtp("/forestal/");
      onListo(
        "Reproceso registrado",
        `Volvieron a la sierra ${r4(entraN).toFixed(4)} de la corrida N° ${origen.lineNo ?? "—"} y salieron ` +
          `${fmtM3(r4(saleN))} m³ de ${producto}. El producto original deja de estar disponible.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AdminModal
      open
      onClose={guardando ? () => {} : onClose}
      variant="info"
      icon={RefreshCw}
      title="Reprocesar este producto"
      description={`Corrida N° ${origen.lineNo ?? "—"} · ${origen.producto ?? "—"} · ${origen.especie ?? "—"} · disponible ${origen.disponible.toFixed(4)} ${origen.unidad ?? "m3"}`}
      footer={
        <ModalFooter error={error ?? (motivos.length > 0 ? motivos[0] : null)}>
          <Btn variant="secondary" onClick={onClose} disabled={guardando}>Cerrar</Btn>
          <Btn variant="primary" disabled={motivos.length > 0 || guardando} onClick={() => void guardar()}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Registrar el reproceso
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-3">
        <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-12">
          <Field span={4} label="Fecha del reproceso" required>
            <input type="date" className={I} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field span={4} label={`Vuelve a la sierra (${origen.unidad ?? "m3"})`} required hint={`Máximo ${origen.disponible.toFixed(4)}`}>
            <input type="number" min={0} step="0.0001" className={I} value={entra} onChange={(e) => setEntra(e.target.value)} />
          </Field>
          <Field span={4} label="Sale del reproceso (m³)" required hint="Igual o menos: la merma es normal">
            <input type="number" min={0} step="0.0001" className={I} value={sale} onChange={(e) => setSale(e.target.value)} />
          </Field>
          <Field span={6} label="Producto que sale" required>
            <select className={I} value={producto} onChange={(e) => setProducto(e.target.value)}>
              {otros.length === 0 ? (
                habituales.map((t) => (
                  <option key={t.valor} value={t.valor} title={t.label}>{t.valor}</option>
                ))
              ) : (
                <>
                  <optgroup label={`Lo que sale de ${tipoOrigen}`}>
                    {habituales.map((t) => (
                      <option key={t.valor} value={t.valor} title={t.label}>{t.valor}</option>
                    ))}
                  </optgroup>
                  <optgroup label="No es lo habitual — hay que explicarlo">
                    {otros.map((t) => (
                      <option key={t.valor} value={t.valor} title={t.label}>{t.valor}</option>
                    ))}
                  </optgroup>
                </>
              )}
            </select>
          </Field>
          <Field span={6} label="Por qué se reprocesa" required hint="Queda en el libro y es lo que se explica en una fiscalización">
            <input
              type="text"
              className={I}
              value={motivo}
              maxLength={200}
              placeholder="Se hinchó por la lluvia · fuera de medida · devolución del cliente"
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Field>
        </div>

        {aviso && (
          <p className="flex items-start gap-1.5 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{aviso}</span>
          </p>
        )}

        <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          Se registra como una corrida nueva en la <b>línea de recuperación (LRE)</b> y el producto original deja de
          contar como disponible: el saldo descuenta lo despachado <b>y</b> lo reprocesado, así que la misma madera
          no se puede vender dos veces.
        </p>
      </ModalBody>
    </AdminModal>
  );
}
