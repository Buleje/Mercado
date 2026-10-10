"use client";

/**
 * «Foto o PDF» — la tercera puerta de «Importar guías despachadas» (ADR-461).
 *
 * Lee la GTF con el MISMO lector de guías que el alta de una guía guardada
 * (`leerGuiaDeFoto` → `gtf-ocr`): de la foto sale el N° de registro del SNIFFS
 * y con él la guía se trae de SERFOR, que es la que manda (trozas, titular,
 * permiso). La foto no aporta trozas: sólo el número.
 *
 * Sin clave de IA va el aviso único (`AvisoClaveIa`), no un error.
 */

import { useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileUp,
  Loader2,
  X,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import AvisoClaveIa from "@/components/admin/shared/AvisoClaveIa";
import { comprimirImagen } from "@/lib/documents/compress-image";
import { leerGuiaDeFoto, type SinClaveIa } from "@/hooks/use-guia-desde-foto";
import { Btn } from "./ctp-shared";

/** Lo que pasó con cada archivo leído. */
interface Lectura {
  id: number;
  nombre: string;
  estado: "leyendo" | "ok" | "sin_registro" | "error";
  registro?: string;
  gtf?: string;
  mensaje?: string;
}

/** Más de esto de una vez es una tanda que conviene partir (cada lectura cuesta ≈ US$ 0,02). */
const MAX_ARCHIVOS = 12;
/**
 * Un PDF viaja entero (la foto se achica antes): en base64 crece un tercio y el
 * servidor recibe hasta ~4,5 MB por pedido. 3 MB de PDF son de sobra para una
 * GTF con su lista de trozas (el lector lee hasta 5 hojas).
 */
const MAX_BYTES_PDF = 3 * 1024 * 1024;

const OK = "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]";
const ALERTA = "text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]";
const ERROR = "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

export default function LothImportarGuiasFoto({
  onRegistro,
}: {
  /** Un N° de registro leído: se suma a la lista de guías a traer. */
  onRegistro: (numero: string) => void;
}) {
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const [sinClave, setSinClave] = useState<{ mensaje: string; clave: SinClaveIa } | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const camaraRef = useRef<HTMLInputElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const siguiente = useRef(0);

  const cambiar = (id: number, cambio: Partial<Lectura>) =>
    setLecturas((ls) => ls.map((l) => (l.id === id ? { ...l, ...cambio } : l)));

  async function leer(files: FileList | null) {
    const lista = Array.from(files ?? []).slice(0, MAX_ARCHIVOS);
    if (lista.length === 0 || leyendo) return;
    setLeyendo(true);
    setSinClave(null);
    const nuevas = lista.map((f) => ({
      id: ++siguiente.current,
      nombre: f.name || "guía",
      estado: "leyendo" as const,
    }));
    setLecturas((ls) => [...nuevas, ...ls]);
    try {
      /* De a una: el lector tiene rate limit estricto y, sin clave, la primera ya lo dice. */
      for (const [i, file] of lista.entries()) {
        const id = nuevas[i].id;
        const esPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        if (esPdf && file.size > MAX_BYTES_PDF) {
          cambiar(id, { estado: "error", mensaje: "El PDF pesa más de 3 MB: guarda sólo las hojas de la guía o súbela como foto." });
          continue;
        }
        const r = await leerGuiaDeFoto(esPdf ? file : await comprimirImagen(file));
        if (!r.ok) {
          if (r.sinClave) {
            setSinClave({ mensaje: r.mensaje, clave: r.sinClave });
            setLecturas((ls) => ls.filter((l) => !nuevas.some((n) => n.id === l.id)));
            return;
          }
          cambiar(id, { estado: "error", mensaje: r.mensaje });
          continue;
        }
        if (r.lectura.numeroRegistro) {
          cambiar(id, {
            estado: "ok",
            registro: r.lectura.numeroRegistro,
            gtf: r.lectura.gtfNumber,
          });
          onRegistro(r.lectura.numeroRegistro);
        } else {
          cambiar(id, { estado: "sin_registro", gtf: r.lectura.gtfNumber });
        }
      }
    } finally {
      setLeyendo(false);
    }
  }

  const input = (ref: React.RefObject<HTMLInputElement | null>, camara: boolean) => (
    <input
      ref={ref}
      type="file"
      accept={camara ? "image/*" : "image/*,application/pdf"}
      capture={camara ? "environment" : undefined}
      multiple={!camara}
      hidden
      onChange={(e) => {
        void leer(e.target.files);
        e.target.value = "";
      }}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="secondary" onClick={() => archivoRef.current?.click()} disabled={leyendo}>
          {leyendo ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <FileUp className="h-4 w-4" aria-hidden />
          )}
          {leyendo ? "Leyendo…" : "Elegir fotos o PDF"}
        </Btn>
        {/* En el celular abre la cámara trasera. */}
        <Btn
          variant="secondary"
          className="sm:hidden"
          onClick={() => camaraRef.current?.click()}
          disabled={leyendo}
        >
          <Camera className="h-4 w-4" aria-hidden /> Sacar foto
        </Btn>
        <InfoTip
          title="Leer la guía de una foto"
          what="Se lee el N° de registro del SNIFFS (junto al QR) y con él se trae la guía de SERFOR: las trozas, el titular y el permiso salen de la ficha oficial, no de la foto."
          affects="Cada guía leída se suma a la lista de «Por N° de registro». Fotos JPG/PNG o PDF de hasta 5 hojas y 3 MB. Si no se ve el registro, escríbelo a mano."
          example="Te mandaron 5 guías por WhatsApp: elígelas todas juntas y se leen de a una."
        />
        {input(archivoRef, false)}
        {input(camaraRef, true)}
      </div>

      {sinClave && (
        <AvisoClaveIa mensaje={sinClave.mensaje} conInstrucciones={sinClave.clave.instrucciones} />
      )}

      {lecturas.length > 0 && (
        <ul
          className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]"
          aria-live="polite"
        >
          {lecturas.map((l) => (
            <li key={l.id} className="flex items-start gap-2 px-3 py-2 text-sm">
              <EstadoIcono estado={l.estado} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-[var(--text-primary)]" title={l.nombre}>
                  {l.nombre}
                </div>
                <DetalleLectura l={l} />
              </div>
              {l.estado !== "leyendo" && (
                <button
                  type="button"
                  onClick={() => setLecturas((ls) => ls.filter((x) => x.id !== l.id))}
                  aria-label={`Quitar ${l.nombre} de la lista`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EstadoIcono({ estado }: { estado: Lectura["estado"] }) {
  const cls = "mt-0.5 h-4 w-4 shrink-0";
  if (estado === "leyendo")
    return <Loader2 className={`${cls} animate-spin text-[var(--text-tertiary)]`} aria-hidden />;
  if (estado === "ok") return <CheckCircle2 className={`${cls} ${OK}`} aria-hidden />;
  return <AlertTriangle className={`${cls} ${estado === "error" ? ERROR : ALERTA}`} aria-hidden />;
}

function DetalleLectura({ l }: { l: Lectura }) {
  if (l.estado === "leyendo")
    return <div className="text-[var(--text-tertiary)]">Leyendo la guía…</div>;
  if (l.estado === "ok")
    return (
      <div className={OK}>
        Registro <span className="font-mono font-bold">{l.registro}</span>
        {l.gtf ? <span className="text-[var(--text-secondary)]"> · GTF {l.gtf}</span> : null} —
        sumado a la lista
      </div>
    );
  if (l.estado === "sin_registro")
    return (
      <div className={ALERTA}>
        {l.gtf
          ? `Se leyó la GTF ${l.gtf}, pero no su N° de registro`
          : "No se leyó el N° de registro"}
        : escríbelo en «Por N° de registro».
      </div>
    );
  return <div className={ERROR}>{l.mensaje}</div>;
}
