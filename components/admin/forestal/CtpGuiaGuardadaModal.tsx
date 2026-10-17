"use client";

/**
 * CtpGuiaGuardadaModal — guardar UNA guía antes de que llegue la madera
 * (ADR-442), con sus datos y sus seis casilleros de papeles.
 *
 * Pedido de Brandon (2026-09-27): «permitir poner el número de registro, número
 * de GTF y guardarse todos los datos […] y al realizar el ingreso de madera se
 * pondrán automático los documentos según el nº de registro». La guía se
 * guarda con su N° de registro (y la ficha de SERFOR si se busca) o a mano; sus
 * papeles son los casilleros de ADR-438 atados a su GTF, así que el ingreso con
 * esa GTF los ve sin copiar nada. Eliminar la guía no borra sus documentos.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, FolderOpen, FolderPlus, Trash2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useMiRol } from "@/hooks/use-mi-rol";
import { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import {
  eliminarGuiaGuardada,
  useGuiaGuardada,
  type ResultadoGuiaGuardada,
} from "@/hooks/use-guias-guardadas";
import { useGuiaDesdeFoto } from "@/hooks/use-guia-desde-foto";
import type { GuiaGuardadaDetalle, GuiaGuardadaVista } from "@/lib/forestal/guias-guardadas";
import { Btn, ModalFooter, useCierreSeguro } from "./ctp-shared";
import CtpDocumentosGuiaCasilleros from "./CtpDocumentosGuiaCasilleros";
import CtpGuiaDesdeFoto, { LecturaDeFoto } from "./CtpGuiaDesdeFoto";
import {
  AyudaDeGuia,
  CamposDeGuia,
  FichaResumen,
  PastillaIngresada,
  SelloSerfor,
} from "./ctp-guia-guardada-partes";
import { cambiosDe, formDe, type FormGuia } from "./guia-guardada-form";

export interface CtpGuiaGuardadaModalProps {
  /** `null` = guía nueva. */
  guiaId: string | null;
  /** Lo que ya se sabe de la lista, para no abrir en blanco mientras llega el detalle. */
  inicial?: GuiaGuardadaVista | null;
  /** Se abre desde otro modal (el listado de guías guardadas). */
  aboveModals?: boolean;
  onClose: () => void;
  /** Se guardó, se eliminó o cambiaron sus documentos: quien la lista la relee. */
  onCambio?: () => void;
  /** «Registrar el ingreso» con esta guía. Sin esto no se ofrece. */
  onIngresar?: (guia: GuiaGuardadaDetalle) => void;
}

export default function CtpGuiaGuardadaModal({
  guiaId,
  inicial = null,
  aboveModals = false,
  onClose,
  onCambio,
  onIngresar,
}: CtpGuiaGuardadaModalProps) {
  const { id, abrir, guia, cargando, error: errorCarga, guardando, guardar } = useGuiaGuardada(guiaId);
  const { contratos } = usePermisosForestal();
  const { confirm } = useConfirm();
  const rol = useMiRol();
  const puedeEliminar = rol == null || rol === "admin" || rol === "owner" || rol === "superadmin";

  const vista: GuiaGuardadaVista | null = guia ?? (inicial?.id === id ? inicial : null);
  const base = vista ? formDe(vista) : null;
  const [form, setForm] = useState<FormGuia>(() => formDe(vista));
  const [error, setError] = useState<string | null>(null);
  /* Lo que el servidor avisó al guardar (SERFOR corrigió lo tipeado, no
     respondió…): queda a la vista, no sólo en un toast que se va. */
  const [delServidor, setDelServidor] = useState<{ corregidos: string[]; aviso: string | null } | null>(null);
  const [eliminando, setEliminando] = useState(false);
  /* Algo cambió de verdad (guardado, eliminado, un papel subido): la lista de
     atrás se relee al cerrar, no en cada tecla. */
  const huboCambios = useRef(false);
  /* La foto de la GTF («Leer de una foto»). Cada vez que queda en su
     casillero (`subidas`), la grilla de papeles se vuelve a montar y la muestra. */
  const foto = useGuiaDesdeFoto();

  /* Lo que devuelve el servidor es la verdad: con ficha, la GTF, el titular y
     el permiso salen del papel oficial, no de lo tipeado. */
  useEffect(() => {
    if (guia) setForm(formDe(guia));
  }, [guia]);

  const hayCambios = JSON.stringify(form) !== JSON.stringify(base ?? formDe(null));
  const ocupado = Boolean(guardando) || eliminando || foto.leyendo;

  const salir = () => {
    if (huboCambios.current) onCambio?.();
    onClose();
  };
  const cerrar = useCierreSeguro(hayCambios, salir);

  const trasGuardar = async (r: ResultadoGuiaGuardada, desdeSerfor: boolean, eraNueva: boolean) => {
    if (r.ok) {
      huboCambios.current = true;
      void foto.subirA(r.guia.gtfNumber); // la foto leída que esperaba a la guía, si hay
      setError(null);
      setDelServidor(r.corregidos.length || r.aviso ? { corregidos: r.corregidos, aviso: r.aviso } : null);
      toast.success(
        desdeSerfor ? "Guía traída de SERFOR y guardada" : eraNueva ? "Guía guardada" : "Cambios guardados",
      );
      if (r.corregidos.length)
        toast.warning(`SERFOR corrigió ${r.corregidos.length === 1 ? "un dato" : `${r.corregidos.length} datos`}`, {
          description: r.corregidos.join(" · "),
          duration: 12_000,
        });
      if (r.aviso) toast.warning(r.aviso, { duration: 10_000 });
      return r.guia;
    }
    if (r.codigo === "ya_guardada" && r.idExistente) {
      const si = await confirm({
        title: "Esa guía ya está guardada",
        description: "¿Abres la que ya existe? Lo que escribiste aquí no se guarda.",
        confirmLabel: "Abrir la guardada",
      });
      if (si) {
        setError(null);
        abrir(r.idExistente);
      } else setError(r.mensaje);
      return null;
    }
    setError(r.mensaje);
    return null;
  };

  /* `f`: la lectura de una foto guarda con el número que todavía no llegó al estado. */
  const guardarGuia = async (desdeSerfor = false, f: FormGuia = form): Promise<GuiaGuardadaDetalle | null> => {
    if (desdeSerfor && !f.numeroRegistro.trim()) {
      setError("Escribe el N° de registro de la guía (ej. 1-19-0313629).");
      return null;
    }
    const eraNueva = !id;
    const cambios = cambiosDe(f, base);
    const r = await guardar(
      desdeSerfor
        ? { ...cambios, numeroRegistro: f.numeroRegistro.trim(), consultarSerfor: true }
        : cambios,
    );
    return trasGuardar(r, desdeSerfor, eraNueva);
  };

  /* Registrar el ingreso con cambios sin guardar los guarda primero: el ingreso
     tiene que leer la misma guía que se ve en pantalla. */
  const ingresar = async () => {
    if (!onIngresar) return;
    if (hayCambios) {
      const lista = await guardarGuia();
      if (!lista) return;
      /* La bandeja de atrás tiene que ver lo guardado aunque después se
         cancele el ingreso. */
      onCambio?.();
      onIngresar(lista);
      return;
    }
    /* Sin cambios no se guarda nada (un guardado vacío dejaba una auditoría
       «editar» falsa): la vista pide el detalle fresco antes de abrir el alta. */
    const actual = guia ?? (vista ? { ...vista, serforGtf: null } : null);
    if (actual) onIngresar(actual);
  };

  const eliminar = async () => {
    if (!id || !vista) return;
    const si = await confirm({
      title: `¿Eliminar la guía guardada ${vista.gtfNumber}?`,
      description:
        "Sale de la lista de guías guardadas. Sus documentos se quedan en Documentos, en su carpeta, y el ingreso que ya la usó no cambia.",
      intent: "danger",
      confirmLabel: "Sí, eliminar",
    });
    if (!si) return;
    setEliminando(true);
    const err = await eliminarGuiaGuardada(id);
    setEliminando(false);
    if (err) {
      setError(err);
      return;
    }
    toast.success("Guía eliminada", { description: "Sus documentos siguen en Documentos." });
    onCambio?.();
    onClose();
  };

  const titulo = vista ? `Guía ${vista.gtfNumber}` : "Guardar guía";
  const descripcion = vista
    ? [vista.titularNombre, vista.permisoCodigo].filter(Boolean).join(" · ") || undefined
    : "Antes de que llegue la madera: sus datos y sus papeles";

  return (
    <AdminModal
      open
      onClose={() => void cerrar()}
      title={titulo}
      description={descripcion}
      icon={FolderPlus}
      variant="wide"
      aboveModals={aboveModals}
      claveVentana="ctp-guia-guardada"
      footer={
        <ModalFooter error={error ?? errorCarga}>
          {id && (
            <Btn
              variant="danger"
              onClick={() => void eliminar()}
              disabled={ocupado || !puedeEliminar}
              className="sm:mr-auto"
              title={
                puedeEliminar
                  ? "Sus documentos se quedan en Documentos"
                  : "Sólo el administrador o el dueño pueden eliminar una guía guardada"
              }
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {eliminando ? "Eliminando…" : "Eliminar guía"}
            </Btn>
          )}
          <Btn variant="secondary" onClick={() => void cerrar()} disabled={ocupado}>
            Cerrar
          </Btn>
          <Btn
            variant="primary"
            onClick={() => void guardarGuia()}
            disabled={ocupado || cargando || (Boolean(id) && !hayCambios)}
          >
            {guardando === "guardar" ? "Guardando…" : "Guardar guía"}
          </Btn>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} flex flex-col gap-5`} data-testid="guia-guardada">
        <section aria-labelledby="guia-guardada-datos" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle id="guia-guardada-datos" as="h3" className="text-sm font-bold">
              La guía
            </CardTitle>
            <AyudaDeGuia />
            {vista?.verificadaEnSerfor && <SelloSerfor en={vista.serforConsultadaEn} />}
            {!id && (
              <CtpGuiaDesdeFoto
                foto={foto}
                form={form}
                onForm={setForm}
                guardarConSerfor={(f) => guardarGuia(true, f)}
                bloqueado={ocupado || cargando}
              />
            )}
          </div>
          {/* Pegado al botón: en el celular, debajo de los campos no se veía. */}
          <LecturaDeFoto foto={foto} gtf={vista?.gtfNumber ?? null} />
          <CamposDeGuia
            form={form}
            onChange={setForm}
            contratos={contratos}
            onBuscarSerfor={() => void guardarGuia(true)}
            buscando={guardando === "serfor"}
            /* Mientras llega el detalle, nada se tipea: al llegar pisa el
               formulario (abierto con los datos de la lista) y se perdía. */
            bloqueado={ocupado || cargando}
            oficial={Boolean(vista?.verificadaEnSerfor)}
            ingresada={Boolean(vista?.ingreso)}
          />
          {delServidor && (
            <div
              role="status"
              className="rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 p-3 text-sm text-[var(--text-primary)]"
            >
              {delServidor.aviso && <p className="font-bold text-[var(--data-warning-ink)]">{delServidor.aviso}</p>}
              {delServidor.corregidos.length > 0 && (
                <>
                  <p className="font-bold text-[var(--data-warning-ink)]">La ficha de SERFOR corrigió lo escrito:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {delServidor.corregidos.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          {vista && <FichaResumen g={vista} />}
        </section>

        {vista && (
          <section
            aria-label="Frente al libro"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3"
          >
            {vista.ingreso ? (
              <PastillaIngresada ingreso={vista.ingreso} />
            ) : (
              <>
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  {vista.libroTh?.recibible
                    ? `Por recibir · viene de tu Libro TH con ${vista.libroTh.trozas} ${vista.libroTh.trozas === 1 ? "troza" : "trozas"}`
                    : "Por ingresar"}
                </span>
                {onIngresar && (
                  <Btn variant="primary" onClick={() => void ingresar()} disabled={ocupado} className="max-sm:w-full sm:ml-auto">
                    {vista.libroTh?.recibible ? "Recibir con sus trozas" : "Registrar el ingreso"}{" "}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Btn>
                )}
              </>
            )}
          </section>
        )}

        <section aria-labelledby="guia-guardada-docs" className="flex flex-col gap-3">
          <CardTitle id="guia-guardada-docs" as="h3" className="text-sm font-bold">
            Documentos
          </CardTitle>
          {vista ? (
            <>
              <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                <span className="min-w-0 break-words">{vista.carpeta.join(" › ")}</span>
              </p>
              <CtpDocumentosGuiaCasilleros
                key={foto.subidas}
                gtf={vista.gtfNumber}
                onCambio={(n) => {
                  if (n !== vista.docsLlenos) huboCambios.current = true;
                }}
              />
            </>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">Guarda la guía y aquí subes sus papeles.</p>
          )}
        </section>
      </div>
    </AdminModal>
  );
}
