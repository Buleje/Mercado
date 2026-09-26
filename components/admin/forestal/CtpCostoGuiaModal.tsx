"use client";

/**
 * «Plata de la guía» (ADR-437) — cáscara.
 *
 * Antes era «¿Cuánto pagaste por esta guía?»: un total repartido por volumen y
 * guardado con N PATCH sueltos. Medido en Blas (26-09): 0 de 11 guías con
 * costo, y 8 de ellas ni siquiera eran compradas (madera de WASACO que Blas
 * sólo asierra). Ahora la guía responde cuatro preguntas, cada una en su
 * sección:
 *   1. ¿La compraste o es de otro?  → `SeccionServicio` / `SeccionCompra`
 *   2. ¿Cuánto costó cada especie?  → `SeccionCompra` (+ `TablaPorEspecie`)
 *   3. ¿Cuánto te costó puesta acá? → `SeccionPuesto` (fletes y gastos)
 *   4. ¿Ya la pagaste?              → `SeccionPago` (una liquidación LIQ)
 * y se guarda con UN `PUT` (una transacción: o todo o nada).
 *
 * Se abre al recepcionar (la factura está sobre la mesa) y desde «Más → Plata
 * de la guía». No bloquea: «Cerrar» deja la guía recepcionada igual.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Coins, Loader2, Sparkles } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useDirectorioForestal } from "@/hooks/use-directorio-forestal";
import {
  candidatoFleteDe,
  useBorradorCompra,
  usePagoDeGuia,
  usePlataDeGuia,
} from "@/hooks/use-plata-de-guia";
import {
  sugerirCostoPorM3,
  textoDeOrigen,
  type IngresoValorizable,
} from "@/lib/forestal/costo-sugerido";
import type { CandidatoFlete } from "@/lib/forestal/fletes";
import { formatNumber } from "@/lib/format";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";
import CtpFleteModal from "./CtpFleteModal";
import { Opciones } from "./costo-guia/comun";
import SeccionCompra from "./costo-guia/SeccionCompra";
import SeccionCuenta from "./costo-guia/SeccionCuenta";
import SeccionPago from "./costo-guia/SeccionPago";
import SeccionPuesto from "./costo-guia/SeccionPuesto";
import SeccionServicio from "./costo-guia/SeccionServicio";

/** Lo que se necesita de la guía para abrir el modal (el resto lo trae el GET). */
export interface GuiaACostear {
  gtfNumber: string;
  providerName: string | null;
  especie: string | null;
  volumenM3: number;
  lineas: { id: string; volumeM3: number | string | null }[];
  /** `AAAA-MM-DD` de la guía: fecha del flete que se propone. */
  fecha?: string | null;
  /** Código del permiso de origen, para que el flete sugiera su contrato. */
  originCode?: string | null;
}

type Tipo = "compra" | "servicio";

export default function CtpCostoGuiaModal({
  guia,
  historial,
  onGuardado,
  onClose,
}: {
  guia: GuiaACostear;
  /** Los ingresos que ya tienen costo: de ahí sale la sugerencia de precio. */
  historial: readonly IngresoValorizable[];
  /** Algo se escribió (costo, servicio, gasto, flete o pago): la bandeja relee. */
  onGuardado: (mensaje: string) => void;
  onClose: () => void;
}) {
  const plata = usePlataDeGuia(guia.gtfNumber);
  const { dto } = plata;
  const dir = useDirectorioForestal();
  const partes = useMemo(() => dir.partes.filter((p) => p.activo !== false), [dir.partes]);
  const b = useBorradorCompra(dto);
  const pago = usePagoDeGuia(dto?.cuenta?.parteId ?? null, guia.gtfNumber);

  /* Se siembran del DTO la primera vez que llega (mismo patrón que el borrador). */
  const [sembrado, setSembrado] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Tipo>("compra");
  const [duenoId, setDuenoId] = useState<string | null>(null);
  if (dto && sembrado !== dto.gtfNumber) {
    setSembrado(dto.gtfNumber);
    setTipo(dto.tipo);
    setDuenoId(dto.dueno?.parteId ?? null);
  }

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** El flete se anota en SU modal; éste se esconde mientras (dos diálogos apilados se pisan). */
  const [flete, setFlete] = useState<CandidatoFlete | null>(null);
  /* Vive acá y no en la sección: mientras se anota el flete este modal se
     cierra, y al volver «Puesto en patio» tiene que seguir abierto. */
  const [puestoAbierto, setPuestoAbierto] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);

  const sugerencia = useMemo(() => {
    /* La propia guía no es antecedente de sí misma: sin este filtro, al
       reabrirla sugería «lo último que pagaste… (esta misma guía)». */
    const propios = new Set(guia.lineas.map((l) => l.id));
    const antecedentes = historial.filter((h) => !propios.has(h.id));
    const s = sugerirCostoPorM3(antecedentes, { especie: guia.especie, proveedor: guia.providerName });
    return s ? { porM3: s.porM3, texto: textoDeOrigen(s, guia.especie, guia.providerName) } : null;
  }, [historial, guia.lineas, guia.especie, guia.providerName]);

  const vistos = dto?.lineas.map((l) => ({ id: l.id, antes: l.costoTotal })) ?? [];
  /* Era de servicio y ahora dice «la compré»: primero se le quita la marca
     (queda sin costo) y, si el precio ya está, se guarda en el mismo acto. */
  const quitaServicio = dto?.tipo === "servicio" && tipo === "compra";
  const puedeGuardar =
    !!dto &&
    !guardando &&
    dto.bloqueo?.codigo !== "GUIA_ANULADA" &&
    (tipo === "servicio" ? Boolean(duenoId) : quitaServicio || (Boolean(b.cuerpo) && !dto.bloqueo));

  async function quitarYGuardar() {
    if (!dto) return { ok: false as const, mensaje: "La guía todavía se está leyendo." };
    const r = await plata.guardar({ tipo: "quitar_servicio", gtfNumber: dto.gtfNumber, vistos });
    if (!r.ok || !b.cuerpo || dto.bloqueo) return r;
    return plata.guardar(b.cuerpo);
  }

  async function guardar() {
    if (!dto || !puedeGuardar) return;
    setGuardando(true);
    setError(null);
    setAviso(null);
    const r =
      tipo === "servicio"
        ? await plata.guardar({
            tipo: "servicio",
            gtfNumber: dto.gtfNumber,
            duenoParteId: duenoId as string,
            vistos,
          })
        : quitaServicio
          ? await quitarYGuardar()
          : b.cuerpo
            ? await plata.guardar(b.cuerpo)
            : { ok: false as const, mensaje: "Falta completar el precio." };
    setGuardando(false);
    if (!r.ok) return setError(r.mensaje);
    const msg =
      tipo === "servicio"
        ? `Guía ${dto.gtfNumber}: madera de servicio de ${partes.find((p) => p.id === duenoId)?.nombre ?? "su dueño"}`
        : `Guía ${dto.gtfNumber}: costo guardado`;
    setAviso(
      tipo === "servicio"
        ? "Marcada de servicio: ya no pide costo."
        : "Guardado. Ya puedes llevar el pago abajo.",
    );
    onGuardado(msg);
    void pago.recargar();
  }

  async function abrirFlete() {
    const base: CandidatoFlete = {
      gtfNumber: guia.gtfNumber,
      fecha: guia.fecha ?? dto?.lineas[0]?.entryDate ?? "",
      proveedorNombre: guia.providerName,
      volumenM3: guia.volumenM3 || null,
      placa: null,
      transportistaNombre: null,
      conductorNombre: null,
      tipoTransporte: "privado",
      originCode: guia.originCode ?? null,
    };
    setFlete(await candidatoFleteDe(base));
  }

  const sug = dto?.duenoSugerido ?? null;
  const descripcion = `${guia.gtfNumber}${guia.providerName ? ` · ${guia.providerName}` : ""} · ${guia.especie ?? "sin especie"} · ${formatNumber(guia.volumenM3, { max: 3 })} m³`;

  return (
    <>
      <AdminModal
        open={!flete}
        onClose={guardando ? () => {} : onClose}
        variant="wide"
        icon={Coins}
        title="Plata de la guía"
        description={descripcion}
        footer={
          <ModalFooter error={error}>
            {aviso && (
              <span
                role="status"
                className="mr-auto inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-ink)]"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden /> {aviso}
              </span>
            )}
            <Btn variant="secondary" onClick={onClose} disabled={guardando}>
              {aviso ? "Cerrar" : "Después"}
            </Btn>
            <Btn variant="primary" onClick={() => void guardar()} disabled={!puedeGuardar}>
              {guardando ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Coins className="h-4 w-4" aria-hidden />
              )}
              {tipo === "servicio"
                ? "Guardar como servicio"
                : quitaServicio && !b.cuerpo
                  ? "Quitar la marca de servicio"
                  : "Guardar el costo"}
            </Btn>
          </ModalFooter>
        }
      >
        <ModalBody className="space-y-3">
          {!dto && plata.cargando && (
            <p className="flex items-center gap-2 py-8 text-sm text-[var(--text-tertiary)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo la plata de la guía…
            </p>
          )}
          {!dto && !plata.cargando && plata.error && (
            <div className="space-y-2">
              <p
                role="alert"
                className="flex items-start gap-2 text-sm font-bold text-[var(--data-error-ink)]"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {plata.error}
              </p>
              <Btn size="sm" variant="secondary" onClick={() => void plata.cargar()}>
                Reintentar
              </Btn>
            </div>
          )}

          {dto && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Opciones
                  etiqueta="¿De quién es la madera?"
                  valor={tipo}
                  onCambio={setTipo}
                  opciones={[
                    { v: "compra", l: "La compré" },
                    { v: "servicio", l: "Es de otro, sólo la asierro" },
                  ]}
                />
              </div>
              {tipo === "compra" && sug && dto.sinCosto > 0 && dto.tipo === "compra" && (
                <button
                  type="button"
                  onClick={() => {
                    setTipo("servicio");
                    if (sug.parteId) setDuenoId(sug.parteId);
                  }}
                  className="flex w-full items-start gap-2 rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-left text-sm hover:bg-[var(--accent)]/20"
                >
                  <Sparkles
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    aria-hidden
                  />
                  <span>
                    <span className="block font-bold text-[var(--text-primary)]">
                      ¿Es madera de {sug.nombre}?
                    </span>
                    <span className="block text-[var(--text-secondary)]">{sug.motivo}</span>
                  </span>
                </button>
              )}
              {dto.mezclada && (
                <p className="flex items-start gap-2 text-sm font-bold text-[var(--data-warning-ink)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  Unos asientos de esta guía están de servicio y otros no. Al guardar quedan todos
                  iguales.
                </p>
              )}
              {dto.bloqueo && (tipo === "compra" || dto.bloqueo.codigo === "GUIA_ANULADA") && (
                <p className="flex items-start gap-2 text-sm font-bold text-[var(--data-warning-ink)]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{" "}
                  {dto.bloqueo.mensaje}
                </p>
              )}

              {tipo === "servicio" ? (
                <SeccionServicio dto={dto} partes={partes} duenoId={duenoId} onDueno={setDuenoId} />
              ) : (
                <SeccionCompra dto={dto} partes={partes} b={b} sugerencia={sugerencia} />
              )}

              <SeccionPuesto
                dto={dto}
                onAgregarFlete={() => void abrirFlete()}
                onAgregarGasto={async (g) => {
                  const r = await plata.agregarGasto(g);
                  if (r.ok) onGuardado(`Gasto anotado en la guía ${guia.gtfNumber}`);
                  return r;
                }}
                onBorrarGasto={plata.borrarGasto}
                abierto={puestoAbierto}
                onAlternar={() => setPuestoAbierto((v) => !v)}
              />

              {dto.tipo === "compra" && tipo === "compra" && (
                <SeccionPago
                  dto={dto}
                  pago={pago}
                  onPagado={(codigo) => {
                    void plata.cargar();
                    onGuardado(
                      `Pago registrado${codigo ? ` · ${codigo}` : ""} · guía ${guia.gtfNumber}`,
                    );
                  }}
                />
              )}

              <SeccionCuenta
                dto={dto}
                esServicio={dto.tipo === "servicio" || tipo === "servicio"}
                abierto={cuentaAbierta}
                onAlternar={() => setCuentaAbierta((v) => !v)}
                onCerrarModal={onClose}
              />
            </>
          )}
        </ModalBody>
      </AdminModal>

      {flete && (
        <CtpFleteModal
          flete={null}
          prellenado={flete}
          onGuardar={async (input) => {
            await plata.guardarFlete(input);
            onGuardado(`Flete anotado en la guía ${guia.gtfNumber}`);
          }}
          onClose={() => setFlete(null)}
        />
      )}
    </>
  );
}
