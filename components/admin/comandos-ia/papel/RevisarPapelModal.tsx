"use client";

/**
 * La revisión de un papel leído, según lo que es: factura → compra, Yape →
 * cobro del fiado, lista → «Precios en bloque», cualquier otro → Documentos.
 * Nada se guarda sin pasar por acá. Rol sin permiso para ese destino: se ve
 * todo, sin el botón que guarda.
 */

import { useState } from "react";
import { AlertTriangle, FileText, Tags } from "@buleje/design-system/icons";
import { type CamposLista, type PropuestaPapel, type RespuestaEntender } from "@/lib/admin/comandos-ia/papel";
import type { Papel } from "./use-leer-papel";
import { MarcoPapel } from "./MarcoPapel";
import { RevisarCompra } from "./RevisarCompra";
import { RevisarCobro } from "./RevisarCobro";
import { anotarRecibo, guardarEnDocumentos, llevarAPrecios, type SubComandos } from "./guardar-papel";
import { CAMPO, SIN_PERMISO, soles, permite } from "./formato";

interface PropsRevisar {
  papel: Papel;
  rol: string | null;
  onCerrar: () => void;
  onDescartar: () => void;
  onGuardado: (resumen: string) => void;
  irA: (sub: SubComandos) => void;
}

const ETIQUETA = "text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]";

export default function RevisarPapelModal(props: PropsRevisar) {
  const r = props.papel.resultado;
  if (!r) return null;
  const comun = { rol: props.rol, onCerrar: props.onCerrar, onDescartar: props.onDescartar, onGuardado: props.onGuardado };
  switch (r.propuesta.destino) {
    case "compra":
      return <RevisarCompra papel={props.papel} resultado={r} {...comun} />;
    case "cobro":
      return <RevisarCobro resultado={r} texto={props.papel.texto} {...comun} />;
    case "precios":
      return <RevisarLista resultado={r} texto={props.papel.texto} {...comun} irA={props.irA} />;
    default:
      return <RevisarDocumento papel={props.papel} resultado={r} {...comun} />;
  }
}

function RevisarLista({ resultado: r, texto, rol, onCerrar, onDescartar, irA }: Omit<PropsRevisar, "papel" | "onGuardado"> & { resultado: RespuestaEntender; texto: string }) {
  const campos = r.campos as CamposLista;
  const { filas } = r.propuesta as Extract<PropuestaPapel, { destino: "precios" }>;
  const puede = permite(rol, "precios");
  const emparejadas = filas.filter((f) => f.producto).length;

  return (
    <MarcoPapel
      abierto
      onCerrar={onCerrar}
      titulo={campos.proveedor ? `Lista de ${campos.proveedor}` : "Lista de precios"}
      icono={Tags}
      costoIaUsd={r.costoIaUsd}
      error={null}
      motivo={!puede ? SIN_PERMISO.precios : filas.length === 0 ? "No encontré filas con precio." : null}
      onDescartar={onDescartar}
      textoLeido={texto}
      accion={puede ? { texto: "Comparar en Precios", onClick: () => llevarAPrecios(campos.filas, irA), deshabilitada: filas.length === 0 } : null}
    >
      <p className="text-sm text-[var(--text-secondary)]">
        {filas.length} {filas.length === 1 ? "fila" : "filas"} · {emparejadas} con su producto en tu catálogo
      </p>
      <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
        {filas.map((f, i) => (
          <li key={`${f.nombre}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 text-[var(--text-primary)]">
              {f.producto?.nombre ?? f.nombre}
              {!f.producto && <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]"><AlertTriangle className="h-3.5 w-3.5 text-[var(--data-warning-500)]" aria-hidden />no está en tu catálogo</span>}
            </span>
            <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">
              {f.producto?.costo != null ? `${soles(f.producto.costo)} → ` : ""}
              <b className="text-[var(--text-primary)]">{soles(f.costo)}</b>
            </span>
          </li>
        ))}
      </ul>
    </MarcoPapel>
  );
}

function RevisarDocumento({ papel, resultado: r, rol, onCerrar, onDescartar, onGuardado }: Omit<PropsRevisar, "irA"> & { resultado: RespuestaEntender }) {
  const sugerido = r.propuesta.destino === "documento" ? r.propuesta.nombreSugerido : papel.nombre;
  const [nombre, setNombre] = useState(sugerido.replace(/\.(png|jpe?g|webp|pdf|txt)$/i, ""));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const puede = permite(rol, "documento");

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const id = await guardarEnDocumentos(papel, nombre);
      anotarRecibo({ tipo: "documento", resumen: `Guardaste «${nombre.trim() || "Papel leído"}» en Documentos`, costoIaUsd: r.costoIaUsd, refId: id ?? undefined });
      onGuardado("Guardado en Documentos");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar en Documentos.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <MarcoPapel
      abierto
      onCerrar={onCerrar}
      titulo="Guardar en Documentos"
      icono={FileText}
      costoIaUsd={r.costoIaUsd}
      error={error}
      motivo={!puede ? SIN_PERMISO.documento : r.aviso}
      onDescartar={onDescartar}
      textoLeido={papel.texto}
      accion={puede ? { texto: "Guardar en Documentos", onClick: () => void guardar(), deshabilitada: !nombre.trim(), ocupada: guardando } : null}
    >
      <label className="block space-y-1">
        <span className={ETIQUETA}>Nombre · revisa</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={CAMPO} maxLength={120} />
        <span className="block text-xs text-[var(--text-tertiary)]">
          {papel.origen === "imagen" ? "La foto se guarda como PDF, igual que el escáner." : papel.origen === "pdf" ? "El PDF se guarda tal cual." : "El texto se guarda como .txt."}
        </span>
      </label>
    </MarcoPapel>
  );
}
