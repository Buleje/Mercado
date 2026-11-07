"use client";
/**
 * Cruce con la PROPUESTA de ventas de SUNAT (SIRE RVIE): el dueño sube el .zip/.txt que bajó del
 * SIRE y ve, contra su libro de ventas del mes, qué comprobantes tiene SUNAT y el libro no, cuáles
 * tiene el libro y SUNAT no, y cuáles están en los dos con importes distintos. El cruce lo hace el
 * servidor (`/api/admin/contabilidad/sire-cruce`); acá solo se sube y se muestra.
 */
import { useRef, useState, type ChangeEvent } from "react";
import { CardTitle, DataTable, StatCard } from "@buleje/design-system";
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { csrfHeaders } from "@/lib/csrf-client";
import { formatCurrency } from "@/lib/format";
import { logger } from "@/lib/logger";
import type { ClaseDiferencia, CruceSire as ResultadoDeCruce, DiferenciaCruce, ImportesCruce } from "@/lib/contabilidad/libros/sire-cruce";

type Estado =
  | { fase: "inicio" }
  | { fase: "subiendo"; nombre: string }
  | { fase: "error"; mensaje: string }
  | { fase: "listo"; nombre: string; cruce: ResultadoDeCruce };

const CIFRAS: Array<{ clase: ClaseDiferencia; titulo: string; ayuda: string }> = [
  { clase: "soloSunat", titulo: "SUNAT tiene y tu libro no", ayuda: "Comprobantes que SUNAT recibió y que tu libro de ventas no anota." },
  { clase: "soloLibro", titulo: "Tu libro tiene y SUNAT no", ayuda: "Ventas anotadas en tu libro que no salen en la propuesta de SUNAT." },
  { clase: "importes", titulo: "Importes distintos", ayuda: "Están en los dos, pero la base, el IGV o el total no coinciden." },
  { clase: "repetida", titulo: "Repetidos en SUNAT", ayuda: "SUNAT trae el mismo comprobante dos veces y con importes distintos." },
];
const QUE_PASA: Record<ClaseDiferencia, string> = {
  soloSunat: "Solo en SUNAT",
  soloLibro: "Solo en tu libro",
  importes: "No cuadra",
  repetida: "Repetida en la propuesta",
};
const CAMPO: Record<keyof ImportesCruce, string> = { base: "base", igv: "IGV", total: "total" };
const TIPO: Record<string, string> = { "01": "Factura", "03": "Boleta", "07": "Nota de crédito", "08": "Nota de débito" };
const TIPOS_ARCHIVO = ".zip,.txt,application/zip,text/plain";
const MAX_AVISOS = 6;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const nombreDelMes = (periodo: string): string => {
  const [a, m] = periodo.split("-").map(Number);
  return a && MESES[m - 1] ? `${MESES[m - 1]} ${a}` : periodo;
};

/** La frase para el dueño según lo que respondió el servidor. */
function mensajeDeError(status: number, error: unknown): string {
  if (status === 401) return "Tu sesión venció. Vuelve a entrar al panel y sube la propuesta otra vez.";
  if (status === 403) return "Tu usuario no puede ver los libros del contador. Pídeselo al dueño.";
  if (status === 429) return "Muchos intentos seguidos. Espera un minuto y vuelve a subirla.";
  if (status === 413) return "El archivo pesa más de 4 MB. Sube el .zip tal cual lo da el SIRE, sin descomprimir.";
  if (typeof error === "string" && error) return error;
  return "No se pudo cruzar la propuesta. Intenta de nuevo en un momento.";
}

/** Sube el archivo y guarda el resultado; una subida a la vez. */
function useCruceSire(periodo: string) {
  const [estado, setEstado] = useState<Estado>({ fase: "inicio" });
  const subir = async (archivo: File) => {
    setEstado({ fase: "subiendo", nombre: archivo.name });
    const datos = new FormData();
    datos.set("periodo", periodo);
    datos.set("archivo", archivo);
    try {
      // Sin Content-Type: el navegador pone el multipart con su separador.
      const r = await fetch("/api/admin/contabilidad/sire-cruce", { method: "POST", headers: csrfHeaders(), body: datos, credentials: "same-origin" });
      const json: unknown = await r.json().catch((err: unknown) => {
        logger.error("[cruce-sire] respuesta sin JSON", { status: r.status, error: String(err) });
        return null;
      });
      if (!r.ok || !json || typeof json !== "object" || !("resumen" in json)) {
        const error = json && typeof json === "object" && "error" in json ? json.error : null;
        setEstado({ fase: "error", mensaje: mensajeDeError(r.status, error) });
        return;
      }
      setEstado({ fase: "listo", nombre: archivo.name, cruce: json as ResultadoDeCruce });
    } catch (err) {
      logger.error("[cruce-sire] subida falló", { error: String(err) });
      setEstado({ fase: "error", mensaje: "No hay conexión con el panel. Revisa el internet y vuelve a subirla." });
    }
  };
  return { estado, subir };
}

/** Total en grande y, si lo que no cuadra es la base o el IGV, esos importes debajo. */
function Importes({ importes, campos }: { importes: ImportesCruce | null; campos: DiferenciaCruce["campos"] }) {
  if (!importes) return <span className="text-[var(--text-tertiary)]">—</span>;
  const otros = campos.filter((c) => c !== "total");
  return (
    <>
      <span className="block">{formatCurrency(importes.total)}</span>
      {otros.map((c) => (
        <span key={c} className="block text-xs text-[var(--text-secondary)]">
          {CAMPO[c]} {formatCurrency(importes[c])}
        </span>
      ))}
    </>
  );
}

function TablaDiferencias({ diferencias }: { diferencias: DiferenciaCruce[] }) {
  return (
    <div className="overflow-x-auto">
      <DataTable>
        <thead>
          <tr>
            <th scope="col">Comprobante</th>
            <th scope="col">Qué pasa</th>
            <th scope="col" className="text-right">
              Tu libro
            </th>
            <th scope="col" className="text-right">
              SUNAT
            </th>
            <th scope="col" className="text-right">
              Diferencia
            </th>
          </tr>
        </thead>
        <tbody>
          {diferencias.map((d) => (
            <tr key={d.clave}>
              <td className="min-w-[10rem]">
                <span className="block font-medium text-[var(--text-primary)]">{d.comprobante}</span>
                <span className="block text-xs text-[var(--text-secondary)]">
                  {[TIPO[d.tipo] ?? `Tipo ${d.tipo}`, d.fecha, d.cliente].filter(Boolean).join(" · ")}
                </span>
              </td>
              <td className="whitespace-nowrap">
                <span className="block">{QUE_PASA[d.clase]}</span>
                {d.campos.length > 0 && <span className="block text-xs text-[var(--text-secondary)]">en {d.campos.map((c) => CAMPO[c]).join(", ")}</span>}
                {d.rango && (
                  <span className="block text-xs text-[var(--text-secondary)]">
                    rango de {d.rango.boletas} boletas · {d.rango.enLibro} en tu libro
                  </span>
                )}
              </td>
              <td className="text-right tabular-nums">
                <Importes importes={d.libro} campos={d.campos} />
              </td>
              <td className="text-right tabular-nums">
                <Importes importes={d.sunat} campos={d.campos} />
                {d.sunatOtro && (
                  <>
                    <span className="block text-xs text-[var(--text-secondary)]">y otra vez:</span>
                    <Importes importes={d.sunatOtro} campos={d.campos} />
                  </>
                )}
              </td>
              <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatCurrency(d.diferencia)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

function Resultado({ cruce, nombre }: { cruce: ResultadoDeCruce; nombre: string }) {
  const { resumen, totales } = cruce;
  const todoCuadra = resumen.soloSunat + resumen.soloLibro + resumen.importes + resumen.repetida + resumen.sinExpandir === 0;
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-secondary)]">
        {nombre}: {resumen.enSunat} en SUNAT ({formatCurrency(totales.sunat.total)}) · {resumen.enLibro} en tu libro ({formatCurrency(totales.libro.total)}) · {resumen.iguales}{" "}
        iguales
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CIFRAS.map((c) => (
          <StatCard key={c.clase} label={c.titulo} value={resumen[c.clase]} subValue={c.ayuda} density="compact" emphasis={resumen[c.clase] > 0 ? "warning" : "success"} />
        ))}
      </div>
      {todoCuadra && (
        <p className="flex items-start gap-2 text-sm text-[var(--data-success-700)]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Todo cuadra: los {resumen.enSunat} comprobantes de SUNAT están en tu libro con los mismos importes.
        </p>
      )}
      {cruce.avisos.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-[var(--text-secondary)]">
          {cruce.avisos.slice(0, MAX_AVISOS).map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {cruce.diferencias.length > 0 && <TablaDiferencias diferencias={cruce.diferencias} />}
    </div>
  );
}

export default function CruceSire({ periodo }: { periodo: string }) {
  const { estado, subir } = useCruceSire(periodo);
  const entrada = useRef<HTMLInputElement>(null);
  const subiendo = estado.fase === "subiendo";

  const alElegir = (e: ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    // Vaciar el input deja volver a subir el mismo archivo después de corregirlo.
    e.target.value = "";
    if (archivo) void subir(archivo);
  };

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4" aria-label="Cruce con la propuesta de SUNAT">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <CardTitle>Cruce con la propuesta de SUNAT · {nombreDelMes(periodo)}</CardTitle>
          <InfoTip
            title="Cruce con la propuesta de SUNAT"
            what="SUNAT arma en el SIRE una propuesta de tu registro de ventas con los comprobantes que le llegaron. Bájala (el .zip o el .txt) y súbela aquí: la comparo con tu libro de este mes."
            affects="Solo lee: el archivo no se guarda y tu libro no cambia. Compara por tipo, serie y número; los importes cuadran si la diferencia es de S/ 0,01 o menos."
            example="SUNAT tiene la boleta B001-45 y tu libro no: sale en «SUNAT tiene y tu libro no» para que la anotes antes de aceptar la propuesta."
          />
        </div>
        <button type="button" className={button({ variant: "secondary", className: "shrink-0 gap-2 rounded-xl px-4 disabled:opacity-60" })} disabled={subiendo} onClick={() => entrada.current?.click()}>
          {subiendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileUp className="h-4 w-4" aria-hidden />}
          {subiendo ? "Cruzando…" : "Subir propuesta"}
        </button>
        <input ref={entrada} type="file" accept={TIPOS_ARCHIVO} className="sr-only" tabIndex={-1} aria-hidden onChange={alElegir} />
      </div>
      {estado.fase === "subiendo" && (
        <p className="text-sm text-[var(--text-secondary)]" role="status">
          Leyendo {estado.nombre} y cruzando con tu libro…
        </p>
      )}
      {estado.fase === "error" && (
        <p className="flex items-start gap-2 text-sm text-[var(--data-error-700)]" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {estado.mensaje}
        </p>
      )}
      {estado.fase === "listo" && <Resultado cruce={estado.cruce} nombre={estado.nombre} />}
    </section>
  );
}
