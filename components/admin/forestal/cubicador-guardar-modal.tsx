"use client";

/**
 * «Guardar cubicación» del Cubicador de madera (Brandon 24-10): antes era un
 * panelcito con nombre, fecha, cliente y notas. Ahora es una ventana con todo
 * lo que se anota del lote —a quién se vende, de qué CCNN salió, permiso, GTF,
 * camión—, el precio por pie, el resumen detallado (por especie y los demás) y,
 * si se quiere, la subida a la cuenta de una persona.
 *
 * Lo que se escribe vive en ESTA ventana (no redibuja la tabla en cada tecla) y
 * pasa al lote al guardar o al cerrar. La cuenta va por el camino de siempre:
 * primero se guarda el lote y después la cubicación comercial lo referencia
 * (`useSubirMaderaACuenta`); el dueño o el admin sigue a Valorizar.
 */
import { useRef, useState } from "react";
import { AlertTriangle, Loader2, Save } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { esDelCubicador } from "@/lib/forestal/cubicacion-madera-cuenta";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";
import CuentaDeGuardar from "./cubicador-guardar-cuenta";
import DatosDeGuardar from "./cubicador-guardar-datos";
import PrecioDeGuardar from "./cubicador-guardar-precio";
import ResumenDeGuardar from "./cubicador-guardar-resumen";
import type { DatosDeLaCubicacion } from "./cubicador-guardar-tipos";
import { ERROR_CUENTA } from "./cubicador-madera-cuenta-avisos";
import { useCuentaDeMaderaDelLote } from "./cubicador-madera-cuenta-contexto";
import { useLibretaDeLaFicha } from "./hooks/use-libreta-de-la-ficha";
import type { PrecioCubicador } from "./hooks/use-precio-cubicador";
import { fechaValidaCuenta, useSubirMaderaACuenta } from "./hooks/use-subir-madera-a-cuenta";

const sinReintento = () => {};
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default function GuardarCubicacionModal({
  inicial, nombreSugerido, actualizando, rows, precios, especiesLote, especieDelLote, onGuardar, onCerrar,
}: {
  inicial: DatosDeLaCubicacion;
  nombreSugerido: string;
  /** El nombre de la guardada que se actualiza (null = lote nuevo). */
  actualizando: string | null;
  rows: PiezaCubicada[];
  precios: PrecioCubicador;
  especiesLote: string[];
  especieDelLote: string | null;
  /** Guarda el lote con estos datos; `silencioso` = sin el aviso propio (lo da la cuenta). */
  onGuardar: (datos: DatosDeLaCubicacion, opciones: { silencioso: boolean }) => Promise<{ id: string; nombre: string } | null>;
  /** Al cerrar sin guardar, lo escrito queda en el lote (como el panel de antes). */
  onCerrar: (datos: DatosDeLaCubicacion | null) => void;
}) {
  const [datos, setDatos] = useState<DatosDeLaCubicacion>(() => ({ ...inicial, nombre: inicial.nombre || nombreSugerido }));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guardado = useRef(false);
  const libreta = useLibretaDeLaFicha(true);
  const cuenta = useCuentaDeMaderaDelLote();
  const conCuenta = !!cuenta?.activo;
  const [aCuenta, setACuenta] = useState(false);
  const subida = useSubirMaderaACuenta({
    activo: conCuenta && aCuenta,
    rows,
    especieDelLote,
    cliente: datos.cliente,
    delLote: cuenta?.delLote ?? null,
    reintentar: cuenta?.recargar ?? sinReintento,
    /* Ya está en una cuenta y sin descontar: se sigue actualizando esa (si no, quedaría con las medidas viejas). */
    alIniciar: (v) => { if (v.estado === "borrador" && esDelCubicador(v)) setACuenta(true); },
  });
  const subir = conCuenta && aCuenta;
  const listo = rows.length > 0 && FECHA.test(datos.fecha) && (!subir || subida.puede);

  const cerrar = () => onCerrar(guardado.current ? null : datos);
  const abrirEnLaCuenta = (id: string) => { cerrar(); cuenta?.setAbierta(id); };

  const guardar = async () => {
    if (!listo || enviando) return;
    setEnviando(true);
    setError(null);
    /* 1) El lote tal como se ve, con sus datos y el precio de cada pieza. */
    const ref = await onGuardar(datos, { silencioso: subir });
    if (!ref) {
      setEnviando(false);
      setError(subir ? "No se pudo guardar la cubicación: no se subió nada a la cuenta. Prueba de nuevo." : "No se pudo guardar la cubicación. Prueba de nuevo.");
      return;
    }
    guardado.current = true;
    if (!subir || !cuenta) { setEnviando(false); onCerrar(null); return; }
    /* 2) La cubicación comercial que lo referencia (nunca manda piezas ni PT). */
    const r = await subida.subir(ref, { fecha: fechaValidaCuenta(datos.fecha), gtf: datos.gtf, notas: datos.notas });
    setEnviando(false);
    if (r.ok) { onCerrar(null); cuenta.alGuardar(r.data); return; }
    setError(`La cubicación quedó guardada como «${ref.nombre}», pero no se subió a la cuenta: ${r.mensaje}`);
  };

  const { valorLote: total, conValor } = precios;
  const pt = rows.reduce((a, r) => a + (Number.isFinite(r.pieTablar) ? r.pieTablar : 0), 0);
  const etiqueta = subir
    ? subida.actualiza ? `Guardar y actualizar ${subida.actualiza.codigo}` : "Guardar y subir a la cuenta"
    : actualizando ? "Actualizar" : "Guardar";

  return (
    <AdminModal
      open
      onClose={cerrar}
      size="planilla"
      title={actualizando ? `Actualizar «${actualizando}»` : "Guardar cubicación"}
      description={`${rows.length} ${rows.length === 1 ? "fila" : "filas"} · ${fmtPt(pt)} PT${conValor ? ` · S/ ${fmtSoles(total)}` : ""}`}
      icon={Save}
      claveVentana="cubicador-madera-guardar"
      aboveModals
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto hidden text-sm text-[var(--text-tertiary)] sm:inline">Queda en tu cuenta: la ves desde cualquier dispositivo.</span>
          <button type="button" className={BOTON_SECUNDARIO} onClick={cerrar}>Cancelar</button>
          <button type="button" className={BOTON_PRIMARIO} disabled={!listo || enviando} onClick={() => void guardar()} data-accion="guardar-cubicacion">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {enviando ? "Guardando…" : etiqueta}
          </button>
        </div>
      }
    >
      <div className={`${MODAL_BODY} grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`} data-vista="cubicador-madera-guardar">
        <div className="min-w-0 space-y-6">
          <DatosDeGuardar datos={datos} actualizar={setDatos} nombreSugerido={nombreSugerido} libreta={libreta} />
          <PrecioDeGuardar precios={precios} especiesLote={especiesLote} />
          {conCuenta && cuenta && (
            <CuentaDeGuardar cuenta={cuenta} subida={subida} encendido={aCuenta} onEncendido={setACuenta}
              importe={conValor ? total : null} onAbrir={abrirEnLaCuenta} />
          )}
          {error && <p role="alert" className={ERROR_CUENTA}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}
        </div>
        <ResumenDeGuardar rows={rows} precioDe={precios.precioDe} conValor={conValor} />
      </div>
    </AdminModal>
  );
}
