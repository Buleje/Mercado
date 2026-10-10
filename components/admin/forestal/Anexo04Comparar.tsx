"use client";

/**
 * Pestaña «Comparar con el resumen» del ANEXO N° 04 (Brandon, 2026-10-03):
 * por especie × tipo, lo que dice el resumen contra lo que imprime la hoja,
 * la diferencia con signo y si es exacto.
 *
 * La lógica vive en `lib/forestal/anexo04-comparar.ts` (con test); acá sólo
 * se dibuja. Una sola fila de cabecera con `data-label` completo («Anexo ·
 * PT»): en el celular el panel convierte las tablas en tarjetas y una
 * cabecera de dos filas le corría los rótulos.
 */
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Check } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { ComparacionAnexo, EstadoComparado, FilaComparada, LadoComparado } from "@/lib/forestal/anexo04-comparar";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";

const pt2 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Diferencia con signo y en la resolución que se muestra; lo que redondea a 0 es «0». */
function conSigno(v: number, dec: number): string {
  const r = Math.round(v * 10 ** dec) / 10 ** dec;
  if (r === 0) return "0";
  const txt = Math.abs(r).toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return r > 0 ? `+${txt}` : `−${txt}`;
}

/* Angosta hasta que el panel pasa de 56rem: a 1280 la tabla tiene ~800 px
   para 11 columnas y con text-sm + px-2 la columna Estado quedaba cortada. */
const TH = "px-1.5 py-1.5 text-right align-bottom text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] @4xl:px-2";
const TD = "px-1.5 py-1.5 text-right font-mono text-xs tabular-nums @4xl:px-2 @4xl:text-sm";
const GRUPO = "border-l-2 border-[var(--rule-base)]";
const EXTRA = "hidden @5xl:table-cell";

const ESTADO: Record<EstadoComparado, { label: string; clase: string }> = {
  exacto: {
    label: "Exacto",
    clase: "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
  },
  redondeo: {
    label: "Redondeo",
    clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  },
  difiere: {
    label: "Difiere",
    clase: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  },
};

function Estado({ estado }: { estado: EstadoComparado }) {
  const e = ESTADO[estado];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs font-bold ${e.clase}`}>
      {estado === "exacto" ? <Check className="h-3 w-3" aria-hidden /> : estado === "difiere" ? <AlertTriangle className="h-3 w-3" aria-hidden /> : <span aria-hidden>≈</span>}
      {e.label}
    </span>
  );
}

/** Cabecera de una columna numérica: el grupo arriba sólo en la primera del grupo. */
function Th({ grupo, label, primera, impresa, extra }: { grupo: string; label: string; primera?: boolean; impresa?: boolean; extra?: boolean }) {
  return (
    <th scope="col" data-label={`${grupo} · ${label}`} className={`${TH} ${primera ? GRUPO : ""} ${extra ? EXTRA : ""}`}>
      {/* El nombre del grupo no ensancha su columna: arranca en la primera
          y se derrama sobre las otras dos, como un rótulo de grupo. */}
      {primera
        ? <span className="block w-0 whitespace-nowrap text-left text-[var(--text-secondary)]">{grupo}</span>
        : <><span className="block" aria-hidden>&nbsp;</span><span className="sr-only">{grupo} · </span></>}
      {label}
      {impresa && <span className="ml-1 rounded bg-primary/12 px-1 text-[var(--accent-ink)] dark:text-[var(--accent)]" title="La columna (10) V de la hoja va en esta unidad">V</span>}
    </th>
  );
}

function Lado({ lado, unidadImpresa, borde }: { lado: LadoComparado | null; unidadImpresa?: "pt" | "m3"; borde?: boolean }) {
  if (!lado) {
    return (
      <>
        <td className={`${TD} text-[var(--text-tertiary)] ${borde ? GRUPO : ""}`}>—</td>
        <td className={`${TD} text-[var(--text-tertiary)]`}>—</td>
        <td className={`${TD} text-[var(--text-tertiary)]`}>—</td>
      </>
    );
  }
  const marca = (u: "pt" | "m3") => (unidadImpresa === u ? "bg-primary/5 font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]");
  return (
    <>
      <td className={`${TD} text-[var(--text-secondary)] ${borde ? GRUPO : ""}`}>{fmtPiezas(lado.piezas)}</td>
      <td className={`${TD} ${marca("pt")}`}>{pt2(lado.pt)}</td>
      <td className={`${TD} ${marca("m3")}`}>{fmtM3(lado.m3)}</td>
    </>
  );
}

function Fila({ f, unidadImpresa, total }: { f: FilaComparada; unidadImpresa: "pt" | "m3"; total?: boolean }) {
  const tono = (v: string) => (v === "0" ? "text-[var(--text-tertiary)]" : f.estado === "difiere" ? "font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]");
  const dPz = conSigno(f.dif.piezas, 0), dPt = conSigno(f.dif.pt, 2), dM3 = conSigno(f.dif.m3, 3);
  const Celda = total ? "th" : "td";
  return (
    <tr className={total ? "border-t-2 border-[var(--accent)]/40 bg-primary/8" : "border-t border-[var(--rule-soft)]"}>
      <Celda scope={total ? "row" : undefined} className="px-1.5 py-1.5 text-left text-xs @4xl:px-2 @4xl:text-sm">
        {total ? (
          <span className="font-bold text-[var(--text-primary)]">Total</span>
        ) : (
          <>
            <span className="font-bold text-[var(--text-primary)]">{f.tipo}</span>
            <span className="block text-xs text-[var(--text-tertiary)]">
              {f.especie}
              {!f.anexo && " · no llegó a la hoja"}
              {!f.resumen && " · no está en el resumen"}
            </span>
          </>
        )}
      </Celda>
      <Lado lado={f.resumen} borde />
      <Lado lado={f.anexo} unidadImpresa={unidadImpresa} borde />
      <td className={`${TD} ${GRUPO} ${tono(dPz)}`}>{dPz}</td>
      <td className={`${TD} ${tono(dPt)}`}>{dPt}</td>
      <td className={`${TD} ${tono(dM3)}`}>{dM3}</td>
      <td className={`px-1.5 py-1.5 text-center @4xl:px-2 ${GRUPO}`}><Estado estado={f.estado} /></td>
      <td className={`${TD} ${EXTRA} ${GRUPO} text-[var(--text-secondary)]`}>
        {f.resumen?.filas ?? 0} → {f.anexo?.filas ?? 0}
      </td>
      <td className={`${EXTRA} px-2 py-1.5 text-left text-xs text-[var(--text-secondary)]`}>
        {total ? "" : f.ubicacion.length > 0 ? f.ubicacion.join(" · ") : "—"}
      </td>
    </tr>
  );
}

/** La línea de arriba: exacto, sólo redondeo, o cuántas difieren. */
function Veredicto({ c }: { c: ComparacionAnexo }) {
  const n = c.filas.length;
  const a = c.total.anexo;
  if (c.difieren === 0 && c.redondeo === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] px-3 py-2 text-sm font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        Exacto: la hoja imprime lo mismo que el resumen en {n === 1 ? "la línea" : `las ${n} líneas`}
        {a ? ` · ${fmtPiezas(a.piezas)} pzas · ${pt2(a.pt)} PT · ${fmtM3(a.m3)} m³` : ""}
      </p>
    );
  }
  if (c.difieren === 0) {
    return (
      <p className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)]">
        <Check className="h-4 w-4 shrink-0 text-[var(--data-success-500)]" aria-hidden />
        Cuadra: {c.redondeo === 1 ? "una línea difiere" : `${c.redondeo} líneas difieren`} sólo por redondeo
        <InfoTip
          title="Redondeo, no error"
          what="El cubicador guarda el pie tablar de cada fila con 2 decimales; la hoja suma el exacto y redondea el subtotal a 3."
          example={<span>Diez piezas de 2&quot;×5&quot;×7&apos;: el cubicador suma 10 × 5,83 = 58,30 PT y la hoja imprime 58,333.</span>}
        />
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-sm font-bold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      {c.difieren} de {n} {n === 1 ? "línea difiere" : "líneas difieren"} del resumen
      <InfoTip
        title="Por qué puede diferir"
        what="Medidas corregidas en «Editar medidas», un dueño elegido, otra cubicación como origen, o una medida que al cambiar pasó a otro tipo."
        affects="El PDF sale con lo de la columna «Anexo»: si no es lo que querías, corrige antes de descargar."
      />
    </p>
  );
}

export default function Anexo04Comparar({
  comparacion: c,
  rotuloResumen,
  contexto = [],
}: {
  comparacion: ComparacionAnexo;
  /** De dónde sale el lado «Resumen» («Lote actual del cubicador»…). */
  rotuloResumen: string;
  /** Lo que explica una diferencia y el modal sabe (dueño elegido, medidas editadas…). */
  contexto?: string[];
}) {
  const u = c.unidadImpresa;
  return (
    <div className="@container space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">Anexo vs. resumen por especie y tipo</CardTitle>
        <InfoTip
          title="Comparar con el resumen"
          what="Cada especie y tipo: lo que dice el resumen, lo que imprime la hoja y la diferencia."
          affects={<span>Exacto = hasta 0,01 PT y 0,001 m³. La columna marcada con <b>V</b> es la unidad que va impresa en la hoja.</span>}
          example={<span>Tornillo · Comercial: resumen 66,67 PT, anexo 66,667 PT → Exacto.</span>}
        />
        <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
          <span className="rounded-lg bg-[var(--surface-raised)] px-2 py-1">Resumen: {rotuloResumen}</span>
          {contexto.map((t) => (
            <span key={t} className="rounded-lg bg-[var(--data-warning-50)] px-2 py-1 font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">{t}</span>
          ))}
        </span>
      </div>

      {c.filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-6 text-center text-sm text-[var(--text-tertiary)]">
          No hay piezas para comparar.
        </p>
      ) : (
        <>
          <Veredicto c={c} />
          <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <table className="w-full text-sm">
              <caption className="sr-only">Anexo N° 04 contra el resumen por especie y tipo</caption>
              <thead className="bg-[var(--surface-sunken)]">
                <tr>
                  <th scope="col" data-label="Especie · tipo" className={`${TH} text-left`}>Especie · tipo</th>
                  <Th grupo="Resumen" label="Pzas" primera />
                  <Th grupo="Resumen" label="PT" />
                  <Th grupo="Resumen" label="m³" />
                  <Th grupo="Anexo" label="Pzas" primera />
                  <Th grupo="Anexo" label="PT" impresa={u === "pt"} />
                  <Th grupo="Anexo" label="m³" impresa={u === "m3"} />
                  <Th grupo="Diferencia" label="Pzas" primera />
                  <Th grupo="Diferencia" label="PT" />
                  <Th grupo="Diferencia" label="m³" />
                  <th scope="col" data-label="Estado" className={`${TH} ${GRUPO} text-center`}>Estado</th>
                  <Th grupo="Medidas" label="resumen → hoja" primera extra />
                  <th scope="col" data-label="En el papel" className={`${TH} ${EXTRA} text-left`}>En el papel</th>
                </tr>
              </thead>
              <tbody>
                {c.filas.map((f) => <Fila key={f.clave} f={f} unidadImpresa={u} />)}
              </tbody>
              <tfoot>
                <Fila f={c.total} unidadImpresa={u} total />
              </tfoot>
            </table>
          </div>
          {c.totalDeclaradoM3 != null && c.total.resumen && (
            <p className="text-xs text-[var(--text-secondary)]">
              El (3) VOLUMEN TOTAL está declarado a mano: <b className="font-mono">{fmtM3(c.totalDeclaradoM3)} m³</b> contra{" "}
              <b className="font-mono">{fmtM3(c.total.resumen.m3)} m³</b> del resumen ({conSigno(c.totalDeclaradoM3 - c.total.resumen.m3, 3)} m³). Las líneas de arriba no cambian: es sólo el número del casillero.
            </p>
          )}
        </>
      )}
    </div>
  );
}
