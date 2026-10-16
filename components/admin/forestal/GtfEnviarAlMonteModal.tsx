"use client";

/**
 * «Enviar al monte» (16-10, ⋯ de la tabla GTF). La guía se arma en la oficina
 * y se imprime en el talonario autocopiativo que vive en el monte, donde sólo
 * hay un celular y la matricial.
 *
 * Dos pasos, a propósito:
 *   1. Elegir hojas, impresora y el WhatsApp del monte → «Enviar» mete la guía
 *      en la cola «Por imprimir» (un envío vivo por guía: reenviar actualiza).
 *      Si ya salió del talonario (impresa, observada o confirmada), en vez de
 *      «Enviar» dice en qué hoja quedó y sólo deja «Reimprimir en otra hoja»
 *      con motivo (`gtf-monte-ya-impresa.tsx`): otro envío gasta otra hoja.
 *   2. «Abrir WhatsApp» con el mensaje listo (qué hoja usar + enlace a la cola,
 *      que pide sesión: NUNCA un PDF público). En el celular, además,
 *      «Compartir con el PDF» adjunta la hoja si el navegador deja.
 * Es otro toque y no un salto automático porque el navegador bloquea abrir
 * WhatsApp o compartir después de esperar al servidor.
 */

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, RotateCcw, Send, Share2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { HojaSalida } from "@/lib/forestal/gtf-salida-tipos";
import {
  ETIQUETA_HOJA,
  HOJAS_SALIDA,
  correlativoDeGuia,
  enlaceCola,
  enlaceWhatsApp,
  esVivo,
  impresaDeGuia,
  mensajeAlMonte,
  normalizarCelular,
  rutaSalida,
  type TrabajoCola,
} from "@/lib/forestal/gtf-cola-monte";
import { bajarSalida, compartirODescargar, puedeCompartir } from "@/lib/forestal/gtf-cola-monte-imprimir";
import { Btn, I } from "./ctp-shared";
import type { Gtf } from "./gtf-tabla-columnas";
import { useColaMonteCtx } from "./cola-monte-contexto";
import { PERFIL_MONTE, useColaMonte, usePerfilesImpresora } from "./hooks/use-cola-monte";
import { PastillaEstadoMonte, cuandoLima } from "./gtf-cola-monte-ui";
import MonteYaImpresa, { MOTIVO_MINIMO } from "./gtf-monte-ya-impresa";

const ETIQUETA = "block text-sm font-bold text-[var(--text-primary)]";
const BOTON_ENLACE =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-bold text-white shadow-sm hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";

export default function GtfEnviarAlMonteModal({ g, onClose }: { g: Gtf; onClose: () => void }) {
  const ctx = useColaMonteCtx();
  const propio = useColaMonte({ activo: !ctx });
  const cola = ctx ?? propio;
  const perfiles = usePerfilesImpresora(true);
  const conLista = (g.items?.length ?? 0) > 0;
  const [hojas, setHojas] = useState<HojaSalida[]>(conLista ? ["guia", "lista"] : ["guia"]);
  const [perfilId, setPerfilId] = useState("");
  /** `null` = no lo tocó: vale el guardado (llega con la cola). */
  const [numero, setNumero] = useState<string | null>(null);
  const celular = numero ?? cola.datos?.contacto?.numero ?? "";
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ trabajo: TrabajoCola; reenviado: boolean } | null>(null);
  const [motivo, setMotivo] = useState("");
  const previo = cola.datos?.trabajos.find((t) => t.gtfId === g.id && esVivo(t));
  /* Ya salió del talonario (impresa, observada o confirmada): sólo «Reimprimir en otra hoja», con motivo. */
  const impreso = cola.datos ? impresaDeGuia(cola.datos.trabajos, g.id) : undefined;
  const motivoOk = motivo.trim().length >= MOTIVO_MINIMO;
  /* La elegida; si no, la del envío anterior; si no, «Monte» (de fábrica): la de la oficina corre distinto. */
  const existe = (id?: string) => !!id && perfiles.some((p) => p.id === id);
  const perfil = [perfilId, (previo ?? impreso)?.perfilId, PERFIL_MONTE.id].find(existe) ?? perfiles[0]?.id ?? PERFIL_MONTE.id;

  const enviar = async () => {
    const c = celular.trim();
    if (c && !normalizarCelular(c)) return setError("Ese celular no sirve: 9 dígitos (987 654 321) o con código de país.");
    if (!hojas.length) return setError("Elige al menos una hoja.");
    if (impreso && !motivoOk) return setError("Escribe por qué se reimprime: gasta otra hoja del talonario.");
    setEnviando(true);
    setError(null);
    const r = await cola.enviar({ gtfId: g.id, hojas, perfilId: perfil, ...(c ? { contacto: c } : {}), ...(impreso ? { reimprimir: { motivo: motivo.trim() } } : {}) });
    setEnviando(false);
    /* 409: otro ya la imprimió mientras tanto; al releer aparece «Reimprimir en otra hoja». */
    if (!r.ok) {
      if (r.status === 409) void cola.recargar();
      return setError(r.mensaje);
    }
    /* La reimpresión anula el impreso vivo en el servidor: se relee para que su pastilla no quede vieja. */
    if (impreso) void cola.recargar();
    setHecho({ trabajo: r.valor.trabajo, reenviado: r.valor.reenviado });
  };

  const hoja = correlativoDeGuia(g.gtfNumber) ?? g.gtfNumber;
  return (
    <AdminModal
      open
      onClose={onClose}
      size="md"
      icon={Send}
      title={hecho ? "Lista para el monte" : impreso ? "Ya impresa" : "Enviar al monte"}
      description={`Guía ${g.gtfNumber}`}
      footer={
        hecho ? (
          <PieListo g={g} trabajo={hecho.trabajo} celular={celular} onClose={onClose} />
        ) : (
          <ModalFooter error={error}>
            <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
            {impreso ? (
              <Btn variant="primary" onClick={() => void enviar()} disabled={enviando || !motivoOk} data-qa="reimprimir-monte">
                <RotateCcw className="h-4 w-4" aria-hidden /> {enviando ? "Enviando…" : "Reimprimir en otra hoja"}
              </Btn>
            ) : (
              <Btn variant="primary" onClick={() => void enviar()} disabled={enviando} data-qa="enviar-monte">
                <Send className="h-4 w-4" aria-hidden /> {enviando ? "Enviando…" : previo ? "Actualizar el envío" : "Enviar al monte"}
              </Btn>
            )}
          </ModalFooter>
        )
      }
    >
      {hecho ? (
        <div className={cn(MODAL_BODY, "space-y-3 text-center")}>
          <p className="text-sm font-bold text-[var(--text-secondary)]">{hecho.trabajo.reimpresion ? "Reimprímela en otra hoja · guía N°" : "Usa la hoja N°"}</p>
          <p className="font-mono text-4xl font-black tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]" data-qa="hoja-a-usar">{hoja}</p>
          <p className="text-sm text-[var(--text-secondary)]">
            {hecho.reenviado
              ? "Se actualizó el envío que ya estaba en la cola."
              : hecho.trabajo.reimpresion
                ? `Reimpresión por: ${hecho.trabajo.reimpresion}. Avísale por WhatsApp.`
                : "Quedó en «Por imprimir». Avísale por WhatsApp."}
          </p>
        </div>
      ) : (
        <div className={cn(MODAL_BODY, "space-y-4")}>
          {impreso ? (
            <MonteYaImpresa t={impreso} motivo={motivo} onMotivo={setMotivo} />
          ) : (
            previo && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                <PastillaEstadoMonte estado={previo.estado} conFoto={!!previo.fotoDocId} />
                <span>desde el {cuandoLima(previo.creadoEn)}</span>
              </div>
            )
          )}
          <fieldset className="space-y-2">
            <legend className={ETIQUETA}>Qué hojas</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {HOJAS_SALIDA.map((h) => {
                const sinTrozas = h === "lista" && !conLista;
                return (
                  <label key={h} className={cn("flex min-h-12 items-center gap-3 rounded-xl border border-[var(--rule-base)] px-3 text-base", sinTrozas ? "opacity-50" : "cursor-pointer hover:bg-[var(--surface-sunken)]")}>
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-[var(--accent-dark)]"
                      disabled={sinTrozas}
                      checked={hojas.includes(h)}
                      onChange={(e) => setHojas((xs) => (e.target.checked ? HOJAS_SALIDA.filter((x) => x === h || xs.includes(x)) : xs.filter((x) => x !== h)))}
                    />
                    {ETIQUETA_HOJA[h]}
                    {sinTrozas && <span className="text-xs text-[var(--text-tertiary)]">(sin trozas)</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5">
              <label htmlFor="monte-impresora" className={ETIQUETA}>Impresora</label>
              <InfoTip title="Perfil de la impresora" what="Cada matricial corre la hoja un poco distinto: el perfil guarda su calibración para que cada valor caiga en su casillero." />
            </span>
            <select id="monte-impresora" className={cn(I, "h-12 text-base")} value={perfil} onChange={(e) => setPerfilId(e.target.value)}>
              {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5">
              <label htmlFor="monte-celular" className={ETIQUETA}>WhatsApp del monte</label>
              <InfoTip title="Celular del monte" what="Queda guardado: la próxima guía ya lo trae. Vacío, WhatsApp te deja elegir el contacto." example="987 654 321" />
            </span>
            <input
              id="monte-celular"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="987 654 321"
              className={cn(I, "h-12 text-base")}
              value={celular}
              onChange={(e) => setNumero(e.target.value)}
              data-qa="celular-monte"
            />
          </div>
        </div>
      )}
    </AdminModal>
  );
}

/** Paso 2: el WhatsApp con el mensaje armado y, si el celular deja, el PDF adjunto. */
function PieListo({ g, trabajo, celular, onClose }: { g: Gtf; trabajo: TrabajoCola; celular: string; onClose: () => void }) {
  const [origen, setOrigen] = useState("");
  const [pdfs, setPdfs] = useState<File[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => setOrigen(window.location.origin), []);
  const mensaje = useMemo(
    () => mensajeAlMonte(g.gtfNumber, enlaceCola(origen, trabajo.id), trabajo.reimpresion),
    [g.gtfNumber, origen, trabajo.id, trabajo.reimpresion],
  );

  /* Se baja ANTES del toque: compartir exige que el toque sea reciente y el PDF tarda. */
  useEffect(() => {
    if (typeof navigator.share !== "function") return;
    let vivo = true;
    Promise.all(
      trabajo.hojas.map(async (h) => {
        const r = await bajarSalida(rutaSalida({ gtfId: trabajo.gtfId, formato: "pdf", perfilId: trabajo.perfilId, hoja: h }), `guia-${trabajo.numeroGuia}-${h}.pdf`);
        return r.ok ? new File([r.blob], r.nombre, { type: "application/pdf" }) : null;
      }),
    ).then((fs) => {
      const listos = fs.filter((f): f is File => f !== null);
      if (vivo && listos.length === fs.length && puedeCompartir(listos)) setPdfs(listos);
    });
    return () => {
      vivo = false;
    };
  }, [trabajo]);

  const compartir = async () => {
    if (!pdfs) return;
    const r = await compartirODescargar(pdfs, mensaje);
    if (r === "descargado") setAviso("El celular no dejó compartir: el PDF quedó en Descargas.");
  };

  return (
    <ModalFooter aviso={aviso}>
      <Btn variant="secondary" onClick={onClose}>Cerrar</Btn>
      {pdfs && (
        <Btn variant="secondary" onClick={() => void compartir()} data-qa="compartir-pdf-monte">
          <Share2 className="h-4 w-4" aria-hidden /> Compartir con el PDF
        </Btn>
      )}
      <a href={enlaceWhatsApp(normalizarCelular(celular), mensaje)} target="_blank" rel="noopener noreferrer" className={BOTON_ENLACE} data-qa="abrir-whatsapp-monte">
        <MessageCircle className="h-4 w-4" aria-hidden /> Abrir WhatsApp
      </a>
    </ModalFooter>
  );
}
