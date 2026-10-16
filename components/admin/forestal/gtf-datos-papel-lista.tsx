/**
 * La lista de trozas de una guía importada dibujada como la hoja del talonario
 * (Brandon 16-10): cabecera de la imprenta con el N° de la lista y el (2) GTF
 * N°, la tabla N° | ESPECIE (3)(4) | (5) Codificación | Dimensiones (6)(7)(8) |
 * (9) Cantidad | (10) Volumen m³ y la fila (11) TOTAL. La especie se escribe
 * una vez por tramo, como a mano en el papel.
 *
 * Al final, aparte y en gris, el «Código único» de cada troza en el libro
 * (ADR-474): el papel dice lo que dice la guía; el libro puede haberla
 * renombrado al importarla.
 *
 * Tabla con TH_GTF/TD_GTF y no `DataTable`: excepción a ADR-489 porque replica
 * el papel. Sólo lectura: ningún valor se recalcula (el volumen es el del libro).
 */

import { formatNumber } from "@/lib/format";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { PiezaGuia } from "@/lib/forestal/loth-guia-despacho";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { EncabezadoGtfPapel, PapelGtf, RotuloGtf, TABLA_GTF, TD_GTF, TD_NUM_GTF, TD_N_GTF, TH_GTF } from "./gtf-papel";
import { cabeceraDeLaFicha, partirNumero } from "./gtf-datos-papel-comun";

/*
 * Los números impresos de la hoja «Lista de trozas». No tienen fuente única en
 * código como la guía (`casilleroGtf2024`): son los rótulos del catálogo del
 * talonario (`CATALOGO.lista` en gtf-matricial-disposicion.ts). Si cambia uno,
 * cambian los dos.
 */
const LISTA = {
  gtf: "2",
  cientifico: "3",
  comun: "4",
  codigo: "5",
  d1: "6",
  d2: "7",
  largo: "8",
  cantidad: "9",
  volumen: "10",
  total: "11",
} as const;

const m = (v: number | null) => (v == null ? "—" : formatNumber(v, 2));
const n = (k: keyof typeof LISTA) => <span className="tabular-nums">({LISTA[k]})</span>;

/** Tramos de piezas seguidas de la misma especie: la especie se escribe una vez por tramo. */
function tramos(piezas: readonly PiezaGuia[]): number[] {
  const largo: number[] = [];
  let inicio = 0;
  piezas.forEach((p, i) => {
    const prev = piezas[inicio];
    if (i > inicio && (p.comun ?? "") === (prev.comun ?? "") && (p.cientifico ?? "") === (prev.cientifico ?? "")) {
      largo[inicio] += 1;
      largo[i] = 0;
    } else {
      inicio = i;
      largo[i] = 1;
    }
  });
  return largo;
}

function GtfDeLaLista({ gtfNumber, nroLista }: { gtfNumber: string; nroLista: string | null }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span className="flex flex-wrap items-baseline justify-center gap-x-1.5">
        <RotuloGtf n={LISTA.gtf} dosPuntos={false} className="uppercase">
          GTF N°
        </RotuloGtf>
        <span className="font-mono text-base text-[var(--text-primary)]">{gtfNumber}</span>
      </span>
      {!nroLista && <span className="text-sm italic text-[var(--text-tertiary)]">sin N° de lista de trozas</span>}
    </span>
  );
}

export default function GtfDatosPapelLista({
  ficha,
  gtfNumber,
  nroLista,
  piezas,
}: {
  ficha: GtfSerfor | null;
  gtfNumber: string;
  nroLista: string | null;
  piezas: readonly PiezaGuia[];
}) {
  const cabecera = ficha ? cabeceraDeLaFicha(ficha) : {};
  const { serie, numero } = partirNumero(nroLista);
  const volumen = piezas.reduce((a, p) => a + (p.volumeM3 ?? 0), 0);
  const largo = tramos(piezas);
  return (
    <PapelGtf>
      <EncabezadoGtfPapel
        hoja="lista"
        {...cabecera}
        serie={serie}
        numero={numero}
        extra={<GtfDeLaLista gtfNumber={gtfNumber} nroLista={nroLista} />}
      />
      <div className="overflow-x-auto">
        <table className={TABLA_GTF} style={{ minWidth: "44rem" }}>
          <caption className="sr-only">
            Trozas de la guía ({piezas.length}) · {fmtM3(volumen)} m³
            {nroLista ? ` · Lista de trozas N° ${nroLista}` : " · sin N° de lista de trozas"}
          </caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2} className={`${TH_GTF} w-10`}>
                N°
              </th>
              <th scope="colgroup" colSpan={2} className={`${TH_GTF} uppercase`}>
                Especie
              </th>
              <th scope="col" rowSpan={2} className={TH_GTF}>
                {n("codigo")} Codificación
              </th>
              <th scope="colgroup" colSpan={3} className={TH_GTF}>
                Dimensiones (m)
              </th>
              <th scope="col" rowSpan={2} className={TH_GTF}>
                {n("cantidad")} Cantidad
              </th>
              <th scope="col" rowSpan={2} className={TH_GTF}>
                {n("volumen")} Volumen m³
              </th>
              <th scope="col" rowSpan={2} className={`${TH_GTF} font-normal text-[var(--text-tertiary)]`}>
                Código único
              </th>
            </tr>
            <tr>
              <th scope="col" className={TH_GTF}>
                {n("cientifico")} Nombre científico
              </th>
              <th scope="col" className={TH_GTF}>
                {n("comun")} Nombre común o comercial
              </th>
              <th scope="col" className={`${TH_GTF} whitespace-nowrap`}>
                {n("d1")} d1
              </th>
              <th scope="col" className={`${TH_GTF} whitespace-nowrap`}>
                {n("d2")} d2
              </th>
              <th scope="col" className={`${TH_GTF} whitespace-nowrap`}>
                {n("largo")} L
              </th>
            </tr>
          </thead>
          <tbody>
            {piezas.length === 0 ? (
              <tr>
                <td colSpan={10} className={`${TD_GTF} py-6 text-center text-sm italic text-[var(--text-tertiary)]`}>
                  La guía no trajo su lista de trozas.
                </td>
              </tr>
            ) : (
              piezas.map((p, i) => (
                <tr key={`${p.codigo}-${i}`}>
                  <td className={TD_N_GTF}>{i + 1}</td>
                  {largo[i] > 0 && (
                    <>
                      <td rowSpan={largo[i]} className={`${TD_GTF} align-top italic`}>
                        {p.cientifico || "—"}
                      </td>
                      <td rowSpan={largo[i]} className={`${TD_GTF} align-top font-semibold`}>
                        {p.comun || "—"}
                      </td>
                    </>
                  )}
                  <td className={`${TD_GTF} font-mono`}>{p.codigoGuia || p.codigo || "—"}</td>
                  <td className={TD_NUM_GTF}>{m(p.diamMayorM)}</td>
                  <td className={TD_NUM_GTF}>{m(p.diamMenorM)}</td>
                  <td className={TD_NUM_GTF}>{m(p.lengthM)}</td>
                  <td className={`${TD_NUM_GTF} text-center`}>1</td>
                  <td className={TD_NUM_GTF}>{p.volumeM3 == null ? "—" : fmtM3(p.volumeM3)}</td>
                  <td className={`${TD_GTF} font-mono text-sm text-[var(--text-tertiary)]`}>{p.codigo || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} className={`${TD_GTF} text-right`}>
                <RotuloGtf n={LISTA.total} dosPuntos={false} className="uppercase">
                  Total
                </RotuloGtf>
              </td>
              <td className={`${TD_NUM_GTF} text-center text-base font-bold`}>{piezas.length}</td>
              <td className={`${TD_NUM_GTF} text-base font-bold`}>{fmtM3(volumen)}</td>
              <td className={TD_GTF} />
            </tr>
          </tfoot>
        </table>
      </div>
    </PapelGtf>
  );
}
