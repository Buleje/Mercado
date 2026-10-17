"use client";

/**
 * Una carga medida en el monte (16-10, F3): qué trozas, cuánto, quién, cuándo
 * y sus fotos. La comparten el monte (lo suyo) y la oficina («Cargas
 * medidas» del despacho con guía); cada uno pone sus botones en `acciones`.
 */
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { fotosQueFaltan, rangoDeCodigos, type CargaMedida } from "@/lib/forestal/medicion-carga";
import { Btn } from "./ctp-shared";
import { cuandoLima } from "./gtf-cola-monte-ui";
import { srcFotoCarga, type Respuesta } from "./hooks/use-cargas-medidas";

const AVISO = "text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const CAMPO =
  "h-10 min-w-0 flex-1 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-base)] px-3 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40";

/** «Descartar» pide el motivo en la misma tarjeta: queda en la auditoría y lo ve el monte. */
export function DescartarCarga({ onDescartar }: { onDescartar: (motivo: string) => Promise<Respuesta<CargaMedida>> }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (!abierto) {
    return (
      <Btn size="sm" variant="ghost" onClick={() => setAbierto(true)} data-qa="descartar-carga">
        Descartar
      </Btn>
    );
  }
  const corto = motivo.trim().length < 3;
  async function enviar() {
    if (corto) return;
    setEnviando(true);
    const r = await onDescartar(motivo.trim());
    setEnviando(false);
    if (r.ok) toast.success("Carga descartada.");
    else toast.error(r.mensaje);
  }
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <input
        autoFocus
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        maxLength={200}
        placeholder="Por qué (p. ej. foto repetida)"
        aria-label="Motivo para descartar la carga"
        className={CAMPO}
        data-qa="motivo-descarte"
      />
      <Btn size="sm" variant="danger" type="submit" disabled={corto || enviando} data-qa="confirmar-descarte">
        {enviando ? "Descartando…" : "Descartar"}
      </Btn>
      <Btn size="sm" variant="ghost" onClick={() => setAbierto(false)}>
        No
      </Btn>
    </form>
  );
}

/** «Tornillo · 3,20 m» o «varias especies · varios largos». */
function deQue(c: CargaMedida): string {
  const especie = c.especie ?? (c.filas.some((f) => f.especie) ? "varias especies" : "sin especie");
  const largo = c.largoM != null ? `${c.largoM.toLocaleString("es-PE", { maximumFractionDigits: 2 })} m` : "varios largos";
  return `${especie} · ${largo}`;
}

export function EstadoDeCarga({ c }: { c: CargaMedida }) {
  if (c.estado === "usada") {
    return (
      <span className="text-xs font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
        Usada en la guía <span className="font-mono">{c.usada?.gtfNumber}</span> · {cuandoLima(c.usada?.en)}
      </span>
    );
  }
  if (c.estado === "descartada") {
    return (
      <span className="text-xs font-bold text-[var(--text-secondary)]">
        Descartada: {c.descartada?.motivo} · {cuandoLima(c.descartada?.en)}
      </span>
    );
  }
  const faltan = fotosQueFaltan(c);
  return faltan > 0 ? <span className={AVISO}>{faltan === 1 ? "Falta 1 foto" : `Faltan ${faltan} fotos`} del monte (sin subir todavía)</span> : null;
}

export default function LothCargasMedidasTarjeta({
  c,
  permiso,
  aviso,
  acciones,
}: {
  c: CargaMedida;
  /** «Tornillo PO-2026-001»: el permiso para el que se midió (`null` = sin permiso). */
  permiso: string | null;
  aviso?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <article className="space-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3" data-qa="carga-medida" data-carga={c.id}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="font-mono text-base font-black tabular-nums text-[var(--text-primary)]">N° {rangoDeCodigos(c.filas)}</span>
        <span className="text-sm font-bold text-[var(--text-primary)]">
          {c.trozas} {c.trozas === 1 ? "troza" : "trozas"} · {fmtM3(c.volumenM3)} m³
        </span>
        <span className="text-sm text-[var(--text-secondary)]">{deQue(c)}</span>
      </div>
      <p className="text-xs text-[var(--text-tertiary)]">
        {c.creada.por} · {cuandoLima(c.creada.en)} · {permiso ?? "sin permiso"}
        {c.nota ? ` · ${c.nota}` : ""}
      </p>
      {c.fotos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Fotos de la carga">
          {c.fotos.map((f) => (
            <li key={f.docId}>
              <a href={srcFotoCarga(c.id, f.docId)} target="_blank" rel="noopener noreferrer" title={f.tipo === "anotada" ? "Foto con los N°" : "Foto original"}>
                {/* eslint-disable-next-line @next/next/no-img-element -- ruta con sesión que redirige a una URL firmada */}
                <img
                  src={srcFotoCarga(c.id, f.docId)}
                  alt={f.tipo === "anotada" ? "Foto de la carga con los N°" : "Foto de la carga"}
                  loading="lazy"
                  className="h-16 w-16 rounded-lg border border-[var(--rule-soft)] object-cover"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
      <EstadoDeCarga c={c} />
      {aviso}
      {acciones && <div className="flex flex-wrap items-center gap-2 pt-1">{acciones}</div>}
    </article>
  );
}
