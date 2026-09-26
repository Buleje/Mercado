"use client";

/**
 * «Reportes diarios» del Libro CTP (ADR-439). Brandon, 2026-09-26: *«recibir
 * reportes diarios por correo y WhatsApp, por ejemplo al terminar el día a las
 * 6 pm […] todo configuro: la hora, el reporte, el medio»*.
 *
 * A la izquierda los reportes guardados; a la derecha el editor, cómo salió el
 * último envío (con el error en palabras) y la vista previa lado a lado. Se
 * abre desde Opciones del libro.
 */
import { useEffect, useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { CalendarClock, Loader2, Save, Send, Trash2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import type { ReporteDiarioInput } from "@/lib/forestal/reporte-diario";
import { useReportesDiarios, type ResultadoEnvio, type VistaPrevia } from "./hooks/use-reportes-diarios";
import ReporteDiarioEditor, { BORRADOR_NUEVO } from "./ctp-reporte-diario-editor";
import ReporteDiarioLista from "./ctp-reporte-diario-lista";
import ReporteDiarioEnvios, { ResultadoDeEnvio } from "./ctp-reporte-diario-envios";
import ReporteDiarioVistaPrevia from "./ctp-reporte-diario-vista-previa";
import { Btn, ModalBody, ModalFooter } from "./ctp-shared";

/** Lo editable de un reporte guardado (sin id ni fechas), para comparar y mandar. */
function aBorrador(r: ReporteDiarioInput): ReporteDiarioInput {
  const { nombre, activo, hora, dias, porCorreo, porWhatsapp, correos, telefonos, secciones, rango } = r;
  return { nombre, activo, hora, dias, porCorreo, porWhatsapp, correos, telefonos, secciones, rango };
}

export default function CtpReportesDiariosModal({ onClose }: { onClose: () => void }) {
  const rd = useReportesDiarios();
  const { confirm } = useConfirm();
  const [elegido, setElegido] = useState<string>("");
  const [borrador, setBorrador] = useState<ReporteDiarioInput>(BORRADOR_NUEVO);
  const [ocupado, setOcupado] = useState<"guardar" | "enviar" | "borrar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoEnvio[] | null>(null);
  const [previa, setPrevia] = useState<VistaPrevia | null>(null);
  const [previaCargando, setPreviaCargando] = useState(false);
  const [previaError, setPreviaError] = useState<string | null>(null);

  const guardado = rd.reportes.find((r) => r.id === elegido) ?? null;
  const hayCambios = useMemo(
    () => JSON.stringify(borrador) !== JSON.stringify(guardado ? aBorrador(guardado) : BORRADOR_NUEVO) || elegido === "nuevo",
    [borrador, guardado, elegido],
  );

  const elegir = (id: string) => {
    const r = rd.reportes.find((x) => x.id === id);
    setElegido(id);
    setBorrador(r ? aBorrador(r) : BORRADOR_NUEVO);
    setError(null);
    setAviso(null);
    setResultado(null);
    setPrevia(null);
    setPreviaError(null);
  };

  /* Al abrir: el primero guardado, o uno nuevo si no hay ninguno. */
  useEffect(() => {
    if (rd.cargando || elegido) return;
    elegir(rd.reportes[0]?.id ?? "nuevo");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo la primera carga elige
  }, [rd.cargando]);

  async function guardar() {
    setOcupado("guardar");
    setError(null);
    const r = await rd.guardar(borrador, guardado?.id);
    setOcupado(null);
    if ("motivo" in r) return setError(r.motivo);
    setElegido(r.reporte.id);
    setBorrador(aBorrador(r.reporte));
    setAviso("Guardado.");
  }

  async function enviarAhora() {
    if (!guardado) return;
    const n = (guardado.porCorreo ? guardado.correos.length : 0) + (guardado.porWhatsapp ? guardado.telefonos.length : 0);
    const ok = await confirm({
      title: `¿Mandar «${guardado.nombre}» ahora?`,
      description: `Sale ya a ${n} destinatario${n === 1 ? "" : "s"} con los datos de este momento. El envío programado de hoy sale igual a su hora.`,
      confirmLabel: "Sí, mandar ahora",
    });
    if (!ok) return;
    setOcupado("enviar");
    setError(null);
    const r = await rd.enviarAhora(guardado.id);
    setOcupado(null);
    if ("motivo" in r) return setError(r.motivo);
    setResultado(r.resultados);
  }

  async function borrar() {
    if (!guardado) return;
    const ok = await confirm({
      title: `¿Borrar «${guardado.nombre}»?`,
      description: "Deja de salir desde hoy. El historial de lo que ya se mandó queda guardado.",
      intent: "danger",
      confirmLabel: "Sí, borrar",
    });
    if (!ok) return;
    setOcupado("borrar");
    const motivo = await rd.eliminar(guardado.id);
    setOcupado(null);
    if (motivo) return setError(motivo);
    setElegido("");
    elegir(rd.reportes.find((r) => r.id !== guardado.id)?.id ?? "nuevo");
  }

  async function pedirPrevia() {
    setPreviaCargando(true);
    setPreviaError(null);
    const r = await rd.vistaPrevia({ nombre: borrador.nombre, secciones: borrador.secciones, rango: borrador.rango });
    setPreviaCargando(false);
    if ("motivo" in r) setPreviaError(r.motivo);
    else setPrevia(r);
  }

  const sinCanal = [!rd.canales.correo && "correo", !rd.canales.whatsapp && "WhatsApp"].filter(Boolean);

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Reportes diarios"
      description="El libro te llega solo, por correo o WhatsApp, a la hora que elijas"
      icon={CalendarClock}
      variant="wide"
      className="sm:max-w-[80rem]"
      aboveModals
      footer={
        <ModalFooter error={error} aviso={aviso}>
          {guardado && (
            <Btn variant="danger" onClick={() => void borrar()} disabled={ocupado !== null} className="mr-auto">
              {ocupado === "borrar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              <span className="max-sm:sr-only">Borrar</span>
            </Btn>
          )}
          <Btn
            onClick={() => void enviarAhora()}
            disabled={!guardado || hayCambios || ocupado !== null}
            title={hayCambios ? "Guarda los cambios antes de mandarlo" : "Mandarlo ya a sus destinatarios"}
          >
            {ocupado === "enviar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar ahora
          </Btn>
          <Btn variant="primary" onClick={() => void guardar()} disabled={!hayCambios || ocupado !== null}>
            {ocupado === "guardar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Btn>
        </ModalFooter>
      }
    >
      <ModalBody className="space-y-4">
        {rd.error && <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{rd.error}</p>}
        {sinCanal.length > 0 && (
          <p className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/10">
            Este servidor todavía no tiene {sinCanal.join(" ni ")} conectado: los envíos por ahí van a fallar hasta que se configure.
          </p>
        )}
        {rd.cargando && !elegido ? (
          <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando reportes…
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <ReporteDiarioLista reportes={rd.reportes} envios={rd.envios} elegido={elegido} onElegir={elegir} onNuevo={() => elegir("nuevo")} />
            <div className="min-w-0 space-y-5">
              <ReporteDiarioEditor borrador={borrador} onCambio={setBorrador} canales={rd.canales} />
              {guardado && (
                <section aria-labelledby="reporte-envios-titulo" className="space-y-2">
                  <CardTitle as="h3" id="reporte-envios-titulo" className="text-sm font-bold text-[var(--text-primary)]">
                    {resultado ? "Así salió recién" : "Cómo salió"}
                  </CardTitle>
                  {resultado ? <ResultadoDeEnvio resultados={resultado} /> : <ReporteDiarioEnvios envios={rd.envios[guardado.id] ?? []} />}
                </section>
              )}
              <ReporteDiarioVistaPrevia previa={previa} cargando={previaCargando} error={previaError} onPedir={() => void pedirPrevia()} />
            </div>
          </div>
        )}
      </ModalBody>
    </AdminModal>
  );
}
