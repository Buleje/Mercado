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
 *
 * **Modo INVENTARIO (Brandon, 2026-08-31):** una existencia previa al sistema no
 * tiene trozas del patio que elegir — se sabe cuánto se consumió y qué salió,
 * pero no la pieza por pieza. Este modal sólo declara el volumen consumido; los
 * paquetes de producción se cargan después en `CtpRegistrarProduccionModal`
 * (mismo formulario que usa el resto del libro, sin duplicar esa UI acá).
 */

import { useMemo, useState } from "react";
import { Archive, Boxes, Loader2, Plus } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { PRODUCTOS_CONSUMIBLES_LOTE, disponiblePorEspecie } from "@/lib/forestal/lote-programacion";
import { TIPOS_PRODUCTO_SALIDA } from "@/lib/forestal/loctp-catalogos";
import { Btn, Field, I, ModalBody, ModalFooter, Seccion, useAtajoGuardar } from "./ctp-shared";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

export interface LoteProgramado {
  speciesCommon: string;
  speciesScientific?: string | null;
  notes?: string | null;
  ordenProduccion?: string | null;
  tipoProductoConsumir?: string | null;
  inicioProceso?: string | null;
  finProceso?: string | null;
  /** Código a mano; vacío = correlativo automático `LA-2026-00N`. */
  code?: string | null;
}

/** Lo que declara el modo inventario: el material, no todavía los paquetes. */
export interface MaterialDeInventario {
  speciesCommon: string;
  speciesScientific?: string | null;
  volumenConsumidoM3: number;
  fecha: string;
  /** Cierre de la ventana del proceso. Sin fecha = sigue abierta. */
  finProceso?: string | null;
  /** Con qué producto se abre el paso 2: sólo precarga el primer paquete —el
   *  operador lo puede cambiar ahí, esto no se guarda aparte. */
  productType?: string | null;
  code?: string | null;
  notes?: string | null;
}

export default function CtpLoteArmarModal({
  trozas,
  crear,
  onIniciarInventario,
  onListo,
  onClose,
}: {
  /** El patio, para ofrecer las especies que de verdad hay. */
  trozas: TrozaConsumible[];
  crear: (input: LoteProgramado) => Promise<{ code: string | null }>;
  /**
   * Modo inventario: entrega el material declarado y el padre abre el modal de
   * paquetes (`CtpRegistrarProduccionModal`) — este modal no crea nada todavía.
   */
  onIniciarInventario: (input: MaterialDeInventario) => void;
  onListo: (mensaje: string, tono: "ok" | "aviso") => void;
  onClose: () => void;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [modo, setModo] = useState<"trozas" | "inventario">("trozas");
  const [especie, setEspecie] = useState("");
  const [orden, setOrden] = useState("");
  const [tipo, setTipo] = useState<string>(PRODUCTOS_CONSUMIBLES_LOTE[0]?.valor ?? "rolliza");
  const [inicio, setInicio] = useState(hoy);
  const [fin, setFin] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [volumenConsumido, setVolumenConsumido] = useState("");
  /** Sólo para el modo inventario: qué va a producir, para precargar el paso 2. */
  const [productoAserrado, setProductoAserrado] = useState<string>(TIPOS_PRODUCTO_SALIDA[0]?.valor ?? "");
  /** Vacío = correlativo automático `LA-2026-00N` (Brandon, 2026-08-31). */
  const [codigo, setCodigo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Las especies del patio con lo que hay de cada una. Se cuenta sólo lo libre
   * —sin lote y sin bloqueo—: es la madera que este lote podría llegar a tomar.
   */
  const especies = useMemo(() => disponiblePorEspecie(trozas), [trozas]);

  const elegida = especies.find((e) => e.nombre === especie) ?? null;
  const fechasAlReves = Boolean(inicio && fin && fin < inicio);
  const puedeGuardar =
    modo === "trozas"
      ? especie.trim().length > 0 && !fechasAlReves && !guardando
      : especie.trim().length > 0 && Number(volumenConsumido) > 0 && !fechasAlReves && !guardando;

  async function guardar() {
    if (!puedeGuardar) return;
    if (modo === "inventario") {
      /* No crea nada acá: el lote y la corrida nacen juntos recién cuando se
         declaran los paquetes, para no dejar un lote de inventario a medio
         armar si el operador cierra el modal siguiente sin guardar. */
      onIniciarInventario({
        speciesCommon: especie.trim(),
        speciesScientific: elegida?.cientifico ?? null,
        volumenConsumidoM3: Number(volumenConsumido),
        fecha: inicio,
        finProceso: fin || null,
        productType: productoAserrado || null,
        code: codigo.trim() || null,
        notes: descripcion.trim() || null,
      });
      onClose();
      return;
    }
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
        code: codigo.trim() || null,
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
      description={
        modo === "trozas"
          ? "Se declara acá; las piezas se eligen en Consumos, filtradas por esta especie"
          : "Existencia previa al sistema: declarás cuánto se consumió y en el paso siguiente, qué salió"
      }
      footer={
        <ModalFooter
          error={error ?? (fechasAlReves ? "El fin del proceso no puede ser anterior al inicio." : null)}
          nota={
            modo === "inventario"
              ? "El siguiente paso pide los paquetes que produjo esta madera"
              : elegida
                ? `Disponible de ${elegida.nombre}: ${elegida.piezas} pza · ${fmtM3(elegida.volumen)} m³ · ${pieTablarDe(elegida.volumen).toLocaleString("es-PE")} pt`
                : "Elegí la especie que va a aserrarse en este lote"
          }
        >
          <Btn variant="secondary" onClick={onClose} disabled={guardando}>
            Cerrar
          </Btn>
          <Btn variant="primary" onClick={() => void guardar()} disabled={!puedeGuardar}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {modo === "inventario" ? "Seguir a declarar producción" : "Guardar"}
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody ref={refCuerpo}>
        {/* El toggle de modo, primero: cambia qué pide el resto del formulario. */}
        <div role="tablist" aria-label="Cómo armar el lote" className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["trozas", Boxes, "Con trozas del patio", "Se elige la madera después, en Consumos"],
              ["inventario", Archive, "Inventario (sin trozas)", "Existencia previa: declarás el volumen directo"],
            ] as const
          ).map(([m, Icon, titulo, sub]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => setModo(m)}
              className={`flex-1 rounded-xl border-2 px-3 py-2 text-left transition-colors ${
                modo === m ? "border-primary bg-primary/10" : "border-[var(--rule-base)] hover:border-primary/50"
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-extrabold text-[var(--text-primary)]">
                <Icon className="h-4 w-4 shrink-0" aria-hidden /> {titulo}
              </span>
              <span className="block text-sm text-[var(--text-tertiary)]">{sub}</span>
            </button>
          ))}
        </div>

        {modo === "inventario" && (
          <Seccion numero={1} title="El material" hint="Lo que ya se sabe de esta madera, sin ir pieza por pieza">
            <Field span={6} label="Especie" required hint="Escribí la especie aunque el patio no tenga stock de ella">
              <input
                list="ctp-lote-inventario-especies"
                value={especie}
                onChange={(e) => setEspecie(e.target.value)}
                placeholder="Tornillo, Capirona…"
                className={I}
              />
              <datalist id="ctp-lote-inventario-especies">
                {especies.map((e) => (
                  <option key={e.nombre} value={e.nombre} />
                ))}
              </datalist>
            </Field>
            <Field span={6} label="Volumen consumido en trozas (m³)" required hint="Lo que entró a la sierra, de una vez">
              <input
                type="number"
                min={0}
                step="0.0001"
                value={volumenConsumido}
                onChange={(e) => setVolumenConsumido(e.target.value)}
                placeholder="12.5000"
                className={`${I} font-mono`}
              />
            </Field>
            <Field span={4} label="N° de lote" hint="Vacío = correlativo automático LA-2026-00N">
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="LA-2026-00N"
                maxLength={60}
                className={`${I} font-mono`}
              />
            </Field>
            <Field span={4} label="Inicio del proceso">
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={I} />
            </Field>
            <Field span={4} label="Fin del proceso" hint="Se puede dejar en blanco hasta que termine">
              <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} min={inicio || undefined} className={I} />
            </Field>
            <Field span={4} label="Producto que va a salir" hint="Precarga el paso siguiente; se puede cambiar ahí">
              <select value={productoAserrado} onChange={(e) => setProductoAserrado(e.target.value)} className={I}>
                {TIPOS_PRODUCTO_SALIDA.map((p) => (
                  <option key={p.valor} value={p.valor} title={p.label}>
                    {p.valor}
                  </option>
                ))}
              </select>
            </Field>
            <Field span={12} label="Notas">
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="De dónde viene esta existencia, por qué no tiene trozas registradas…"
                className={`${I} h-auto py-2`}
              />
            </Field>
          </Seccion>
        )}

        {modo === "trozas" && (
        <Seccion numero={1} title="El lote" hint="Vacío = correlativo automático del centro">
          <Field span={6} label="N° de lote" hint="Vacío = correlativo automático LA-2026-00N">
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="LA-2026-00N"
              maxLength={60}
              className={`${I} font-mono`}
            />
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
                  {e.nombre} — {e.piezas} pza · {fmtM3(e.volumen)} m³
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
        )}

        {modo === "trozas" && elegida && (
          <p className="mt-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            Al guardar, en <b className="text-[var(--text-primary)]">Consumos</b> vas a elegir este lote y la tabla del
            patio se filtra sola a <b className="text-[var(--text-primary)]">{elegida.nombre}</b> —{" "}
            <span className="font-mono tabular-nums">
              {elegida.piezas} pza · {fmtM3(elegida.volumen)} m³
            </span>{" "}
            disponibles hoy.
          </p>
        )}
      </ModalBody>
    </AdminModal>
  );
}
