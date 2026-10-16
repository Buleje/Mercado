/**
 * El pie de la GTF «como el papel»: la franja DETALLE DEL PRODUCTO con el (32),
 * el (33), el cuadro (34) con la cabecera del Anexo I (agrupada en «Forma de
 * embalaje o presentación» y «Cantidad»), el (34h) TOTAL MOVILIZADO y el (35);
 * y aparte, lo que la consulta de SERFOR publica y el papel no imprime.
 *
 * Las tablas usan TH_GTF/TD_GTF y no `DataTable`: excepción a ADR-489 porque
 * replican el talonario impreso (Brandon 16-10).
 */

import { formatNumber } from "@/lib/format";
import { casilleroGtf2024 } from "@/lib/forestal/ctp-gtf-formato";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { camposNoMapeados } from "@/lib/forestal/gtf-serfor-bloques";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { FranjaGtf, PapelGtf, RenglonGtf, RotuloGtf, TABLA_GTF, TD_GTF, TD_NUM_GTF, TH_GTF } from "./gtf-papel";
import {
  AyudaFranja,
  CasilleroPapel,
  CuerpoPapel,
  EN_BLANCO,
  FilaPapel,
  PISO_RENGLON,
  casilla,
  limpio,
  rango,
  rotuloDelNumero,
  type DatosPapel,
} from "./gtf-datos-papel-comun";

/** Cabecera de una columna del (34): «(34a) Nombre Científico», número y rótulo del Anexo I. */
function Th({ clave, rowSpan }: { clave: string; rowSpan?: number }) {
  const { n, rotulo } = casilla(clave);
  return (
    <th scope="col" rowSpan={rowSpan} className={TH_GTF}>
      <span className="tabular-nums">({n})</span> {rotulo}
    </th>
  );
}

const TD_TEXTO = `${TD_GTF} text-sm`;

export function DetalleProductoPapel({ d, ficha }: { d: DatosPapel; ficha: GtfSerfor }) {
  const productos = ficha.productos ?? [];
  /* El total es el que publica SERFOR; si no lo publica, la suma de las filas (como siempre). */
  const suma = productos.reduce((a, p) => a + (p.volumen ?? 0), 0);
  const total = ficha.volumenTotal ?? (productos.length ? suma : null);
  /* El número del cuadro sale del de sus columnas: (34a) → (34). */
  const nCuadro = (casilleroGtf2024("37a") ?? "").replace(/[a-z]$/, "");
  const nTotal = casilleroGtf2024("volumenTotal");
  return (
    <>
      <FranjaGtf
        titulo="Detalle del producto"
        extra={
          <AyudaFranja
            titulo="Detalle del producto"
            que={`${rango("36", "38")}: qué madera viaja y cuánto, tal como lo declara la guía.`}
            nota="No se recalcula: es lo que dice el documento. El total movilizado es el que publica SERFOR; si no lo publica, la suma de las filas."
          />
        }
      />
      <CuerpoPapel>
        <FilaPapel cols={2}>
          <CasilleroPapel d={d} claves={["36"]} />
          <CasilleroPapel d={d} claves={["35"]} />
        </FilaPapel>
        <div className="space-y-1">
          <RotuloGtf n={nCuadro}>{rotuloDelNumero(nCuadro)}</RotuloGtf>
          <div className="overflow-x-auto">
            <table className={TABLA_GTF} style={{ minWidth: "40rem" }}>
              <caption className="sr-only">
                ({nCuadro}) {rotuloDelNumero(nCuadro)}: {productos.length} {productos.length === 1 ? "línea" : "líneas"}
              </caption>
              <thead>
                <tr>
                  <Th clave="37a" rowSpan={2} />
                  <Th clave="37b" rowSpan={2} />
                  <Th clave="37c" rowSpan={2} />
                  <th scope="colgroup" colSpan={2} className={TH_GTF}>
                    Forma de embalaje o presentación del producto
                  </th>
                  <th scope="colgroup" colSpan={2} className={TH_GTF}>
                    Cantidad
                  </th>
                </tr>
                <tr>
                  <Th clave="37d" />
                  <Th clave="37e" />
                  <Th clave="37f" />
                  <Th clave="37g" />
                </tr>
              </thead>
              <tbody>
                {productos.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={`${TD_GTF} text-center text-sm italic text-[var(--text-tertiary)]`}>
                      La guía no publica líneas de producto
                    </td>
                  </tr>
                ) : (
                  productos.map((p, i) => (
                    <tr key={`${p.cientifico ?? p.comun ?? "p"}-${i}`}>
                      <td className={`${TD_TEXTO} italic`}>{p.cientifico || "—"}</td>
                      <td className={`${TD_TEXTO} font-semibold`}>{p.comun || "—"}</td>
                      <td className={TD_TEXTO}>{p.tipoProducto || "—"}</td>
                      <td className={TD_TEXTO}>{p.presentacion || "—"}</td>
                      <td className={TD_NUM_GTF}>{p.cantidad == null ? "—" : formatNumber(p.cantidad, 0)}</td>
                      <td className={`${TD_TEXTO} text-center`}>{p.unidad || "—"}</td>
                      <td className={`${TD_NUM_GTF} font-semibold`}>{p.volumen == null ? "—" : fmtM3(p.volumen)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} className={`${TD_GTF} text-right`}>
                    {/* Mayúsculas en el texto, no por CSS: «(34h)» se imprime en minúscula. */}
                    <RotuloGtf n={nTotal}>{rotuloDelNumero(nTotal ?? "").toLocaleUpperCase("es")}</RotuloGtf>
                  </td>
                  <td className={`${TD_NUM_GTF} text-base font-bold`}>
                    {total == null ? <span className="font-sans text-sm font-normal italic text-[var(--text-tertiary)]">{EN_BLANCO}</span> : fmtM3(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <CasilleroPapel d={d} claves={["38"]} />
      </CuerpoPapel>
    </>
  );
}

/**
 * Lo que la consulta de SERFOR publica y el talonario no imprime: estado,
 * registro, RUC de la instancia, dirección del titular y cualquier etiqueta que
 * ningún casillero recoge. Nada se pierde en silencio.
 */
export function RegistroSerforPapel({ ficha }: { ficha: GtfSerfor }) {
  const registrada = [ficha.fechaRegistro, ficha.registradoPor].map(limpio).filter(Boolean).join(" · ");
  const otros = camposNoMapeados(ficha);
  const r = (rotulo: string, valor: string | null, mono = false) => (
    <RenglonGtf key={rotulo} rotulo={rotulo} vacio={EN_BLANCO} className={PISO_RENGLON}>
      {valor ? <span className={`break-words ${mono ? "font-mono" : ""}`}>{valor}</span> : null}
    </RenglonGtf>
  );
  return (
    <PapelGtf>
      <FranjaGtf
        titulo="Datos del registro en SERFOR"
        extra={
          <AyudaFranja
            titulo="Registro en SERFOR"
            que="Lo que publica la consulta pública de SERFOR y no sale en el papel: el estado de la guía, quién y cuándo la registró, el RUC de la instancia y la dirección del titular."
          />
        }
      />
      <CuerpoPapel>
        <FilaPapel cols={2}>
          {r("Estado en SERFOR", limpio(ficha.estado))}
          {r("Registrada", registrada || null)}
        </FilaPapel>
        <FilaPapel cols={2}>
          {r("RUC de la instancia", limpio(ficha.rucInstancia), true)}
          {r("Dirección del titular", limpio(ficha.direccionTitular))}
        </FilaPapel>
        {otros.length > 0 && (
          <div className="space-y-1.5 border-t border-dotted border-[var(--gtf-linea)] pt-2">
            <span className="flex items-center gap-1.5">
              <RotuloGtf dosPuntos={false}>Otros datos que publica SERFOR</RotuloGtf>
              <AyudaFranja
                titulo="Otros datos que publica SERFOR"
                que="Etiquetas de la consulta que ningún casillero del formato recoge. Se muestran para que nada se pierda en silencio."
              />
            </span>
            <FilaPapel cols={3}>{otros.map((c) => r(c.etiqueta, c.valor))}</FilaPapel>
          </div>
        )}
      </CuerpoPapel>
    </PapelGtf>
  );
}
