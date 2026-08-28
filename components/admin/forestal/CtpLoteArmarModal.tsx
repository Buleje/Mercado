"use client";

/**
 * Programar un lote de aserrío (ADR-342).
 *
 * Copia el formulario oficial del SNIFFS —«Programar producción»—: N° de lote,
 * orden de producción, tipo de producto a consumir, ventana del proceso,
 * especie y descripción. **Acá el lote se DECLARA, no se llena**: las piezas se
 * eligen después en Consumos, ya filtradas por esta especie y este tipo.
 *
 * Antes este modal pedía las dos cosas a la vez —identidad y piezas— y obligaba
 * a tener la madera decidida antes de poder anotar la orden. En la planta la
 * orden se programa a la mañana y la pila se elige frente a la sierra.
 *
 * La especie sale de lo que HAY en el patio, con su conteo y su volumen: elegir
 * una especie sin madera disponible crea un lote que nace vacío y nadie sabe por
 * qué. Cuando el patio está vacío se puede tipear igual — el lote programado
 * espera a la guía que va a llegar.
 */

import { useMemo, useState } from "react";
import { Boxes, Loader2, Plus } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { PRODUCTOS_CONSUMIBLES_LOTE, disponiblePorEspecie } from "@/lib/forestal/lote-programacion";
import { Btn, Field, I, ModalBody, ModalFooter, Seccion, useAtajoGuardar } from "./ctp-shared";

export interface LoteProgramado {
  speciesCommon: string;
  speciesScientific?: string | null;
  notes?: string | null;
  ordenProduccion?: string | null;
  tipoProductoConsumir?: string | null;
  inicioProceso?: string | null;
  finProceso?: string | null;
}

export default function CtpLoteArmarModal({
  trozas,
  crear,
  onListo,
  onClose,
}: {
  /** El patio, para ofrecer las especies que de verdad hay. */
  trozas: TrozaConsumible[];
  crear: (input: LoteProgramado) => Promise<{ code: string | null }>;
  onListo: (mensaje: string, tono: "ok" | "aviso") => void;
  onClose: () => void;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [especie, setEspecie] = useState("");
  const [orden, setOrden] = useState("");
  const [tipo, setTipo] = useState<string>(PRODUCTOS_CONSUMIBLES_LOTE[0]?.valor ?? "rolliza");
  const [inicio, setInicio] = useState(hoy);
  const [fin, setFin] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Las especies del patio con lo que hay de cada una. Se cuenta sólo lo libre
   * —sin lote y sin bloqueo—: es la madera que este lote podría llegar a tomar.
   */
  const especies = useMemo(() => disponiblePorEspecie(trozas), [trozas]);

  const elegida = especies.find((e) => e.nombre === especie) ?? null;
  const fechasAlReves = Boolean(inicio && fin && fin < inicio);
  const puedeGuardar = especie.trim().length > 0 && !fechasAlReves && !guardando;

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await crear({
        speciesCommon: especie.trim(),
        speciesScientific: elegida?.cientifico ?? null,
        notes: descripcion.trim() || null,
        ordenProduccion: orden.trim() || null,
        tipoProductoConsumir: tipo,
        inicioProceso: inicio || null,
        finProceso: fin || null,
      });
      onListo(
        `Lote ${r.code ?? ""} programado para ${especie.trim()}.` +
          (elegida ? ` Hay ${elegida.piezas} troza${elegida.piezas === 1 ? "" : "s"} de esa especie para cargarlo desde Consumos.` : ""),
        elegida ? "ok" : "aviso",
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  const refCuerpo = useAtajoGuardar(() => void guardar(), puedeGuardar);

  return (
    <AdminModal
      open
      onClose={guardando ? () => {} : onClose}
      variant="wide"
      icon={Boxes}
      title="Programar un lote de aserrío"
      description="Se declara acá; las piezas se eligen en Consumos, filtradas por esta especie"
      footer={
        <ModalFooter
          error={error ?? (fechasAlReves ? "El fin del proceso no puede ser anterior al inicio." : null)}
          nota={
            elegida
              ? `Disponible de ${elegida.nombre}: ${elegida.piezas} pza · ${elegida.volumen.toFixed(4)} m³ · ${pieTablarDe(elegida.volumen).toLocaleString("es-PE")} pt`
              : "Elegí la especie que va a aserrarse en este lote"
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={guardando}>
            Cerrar
          </Btn>
          <Btn variant="primary" onClick={() => void guardar()} disabled={!puedeGuardar}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Guardar
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody ref={refCuerpo}>
        <Seccion numero={1} title="El lote" hint="El N° lo asigna el sistema al guardar">
          <Field span={6} label="N° de lote" hint="Correlativo del centro: LA-2026-00N">
            <input value="Se asigna al guardar" disabled readOnly className={`${I} font-mono`} />
          </Field>
          <Field span={6} label="Orden de producción">
            <input
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              placeholder="OP-2026-014"
              className={`${I} font-mono`}
            />
          </Field>
          <Field span={6} label="Tipo de producto a consumir" required>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={I}>
              {PRODUCTOS_CONSUMIBLES_LOTE.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            span={6}
            label="Especie"
            required
            hint={especies.length > 0 ? "Sólo se listan las que hay en el patio" : "El patio no tiene piezas libres todavía"}
          >
            <select value={especie} onChange={(e) => setEspecie(e.target.value)} className={I}>
              <option value="">Seleccione…</option>
              {especies.map((e) => (
                <option key={e.nombre} value={e.nombre}>
                  {e.nombre} — {e.piezas} pza · {e.volumen.toFixed(4)} m³
                </option>
              ))}
            </select>
          </Field>
          <Field span={6} label="Inicio del proceso">
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={I} />
          </Field>
          <Field span={6} label="Fin del proceso" hint="Se puede dejar en blanco hasta que termine">
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} min={inicio || undefined} className={I} />
          </Field>
          <Field span={12} label="Descripción">
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Para el pedido de Satipo, turno mañana…"
              className={`${I} h-auto py-2`}
            />
          </Field>
        </Seccion>

        {elegida && (
          <p className="mt-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            Al guardar, en <b className="text-[var(--text-primary)]">Consumos</b> vas a elegir este lote y la tabla del
            patio se filtra sola a <b className="text-[var(--text-primary)]">{elegida.nombre}</b> —{" "}
            <span className="font-mono tabular-nums">
              {elegida.piezas} pza · {elegida.volumen.toFixed(4)} m³
            </span>{" "}
            disponibles hoy.
          </p>
        )}
      </ModalBody>
    </AdminModal>
  );
}
