"use client";

/**
 * «Lo que lleva el papel», al costado de la hoja en monitores anchos (Brandon,
 * 2026-10-03: «más ancho… que tenga más campos»). La hoja a escala no deja
 * leer de un vistazo qué bloque cae en qué hoja, cuántos renglones de los 35
 * usa ni cuánto suma cada uno: acá va hoja por hoja, bloque por bloque, con
 * el (3) VOLUMEN TOTAL de cada hoja. Mismo `Anexo04` que dibuja la hoja.
 */
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { FILAS_OFICIAL, fmtAnexo, type Anexo04 } from "@/lib/forestal/anexo04-serfor";

const TH = "px-1.5 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-1.5 py-1 font-mono tabular-nums";

export default function Anexo04BloquesPapel({ anexo }: { anexo: Anexo04 }) {
  const unidad = anexo.unidadV === "pt" ? "PT" : "m³";
  const bloques = anexo.hojas.reduce((a, h) => a + h.bloques.length, 0);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">Lo que lleva el papel</CardTitle>
        <InfoTip
          title="Hoja por hoja"
          what={`Cada bloque impreso: especie y tipo, renglones usados de los ${FILAS_OFICIAL}, piezas y su (11) subtotal.`}
          affects="El (3) de cada hoja es lo que esa hoja ampara sola en un puesto de control."
          side="left"
        />
        <span className="ml-auto text-xs text-[var(--text-tertiary)]">{bloques} {bloques === 1 ? "bloque" : "bloques"}</span>
      </div>
      {bloques === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-4 text-center text-xs text-[var(--text-tertiary)]">
          Hoja en blanco: sin piezas.
        </p>
      ) : (
        anexo.hojas.map((hoja, h) => (
          <div key={h} className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <p className="flex items-baseline justify-between gap-2 bg-[var(--surface-sunken)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)]">
              <span>Hoja {h + 1} de {anexo.hojas.length}</span>
              <span className="font-mono tabular-nums text-[var(--text-primary)]">(3) {fmtAnexo(hoja.totalM3)} m³</span>
            </p>
            <table className="w-full text-xs">
              <caption className="sr-only">Bloques de la hoja {h + 1}</caption>
              <thead>
                <tr>
                  <th scope="col" className={`${TH} text-left`}>Especie · tipo</th>
                  <th scope="col" className={`${TH} text-right`}>Reng.</th>
                  <th scope="col" className={`${TH} text-right`}>Pzas</th>
                  <th scope="col" className={`${TH} text-right`}>{unidad}</th>
                </tr>
              </thead>
              <tbody>
                {hoja.bloques.map((b, i) => (
                  <tr key={i} className="border-t border-[var(--rule-soft)]">
                    <td className="px-1.5 py-1 text-left">
                      <span className="font-bold text-[var(--text-primary)]">{i + 1}. {b.tipo}</span>
                      <span className="block text-[var(--text-tertiary)]">{b.especie}{b.continuacion ? " · sigue" : ""}</span>
                    </td>
                    <td className={`${TD} text-right text-[var(--text-secondary)]`}>{b.filas.length}/{FILAS_OFICIAL}</td>
                    <td className={`${TD} text-right text-[var(--text-secondary)]`}>{b.filas.reduce((a, f) => a + f.cantidad, 0)}</td>
                    <td className={`${TD} text-right font-bold text-[var(--text-primary)]`}>{fmtAnexo(b.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
