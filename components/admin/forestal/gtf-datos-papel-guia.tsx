/**
 * La GTF importada dibujada como el talonario (Brandon 16-10: «que se parezca
 * lo más posible a esos formatos… con ese color de texto, tamaños, formatos»):
 * la cabecera de la imprenta, y debajo, en el orden del Anexo I del 2024, las
 * franjas del origen, el propietario, el punto de partida, el destinatario, el
 * transportista y el detalle del producto, con sus renglones agrupados como en
 * el papel. Lo que el papel no tiene (estado y registro en SERFOR, RUC de la
 * instancia, dirección del titular, otras etiquetas) va al final, en su franja.
 *
 * La usan «Datos de la GTF» y la vista previa de «Importar guías»
 * (`LothImportarGuiasBloques` con `partes="datos"`). Sólo lectura.
 */

import { CASILLEROS_GTF_2024, ORIGENES } from "@/lib/forestal/ctp-gtf-formato";
import { claveOrigen } from "@/lib/forestal/serfor-gtf-campos";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { CasillaGtf, EncabezadoGtfPapel, FranjaGtf, PapelGtf, RotuloGtf } from "./gtf-papel";
import {
  AyudaFranja,
  CasilleroPapel,
  CuerpoPapel,
  FilaPapel,
  cabeceraDeLaFicha,
  casilla,
  datosDeLaFicha,
  limpio,
  partirNumero,
  rango,
  type DatosPapel,
} from "./gtf-datos-papel-comun";
import { DetalleProductoPapel, RegistroSerforPapel } from "./gtf-datos-papel-detalle";

/** El (5): las diez casillas del formato 2024, con la «X» en la que dice la ficha. */
function OrigenCasillas({ texto }: { texto: string | null }) {
  const marcada = claveOrigen(texto);
  const enCasilla = ORIGENES.some((o) => o.clave === marcada);
  const { n, rotulo } = casilla("5");
  return (
    <div className="space-y-1.5">
      <RotuloGtf n={n} className="uppercase">
        {rotulo}
      </RotuloGtf>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-1 @3xl/papel:grid-cols-4">
        {ORIGENES.map((o) => (
          <CasillaGtf key={o.clave} marcada={o.clave === marcada}>
            {o.label}
          </CasillaGtf>
        ))}
      </div>
      {/* Lo que SERFOR escribió y no cae en ninguna casilla del 2024 (p. ej. «Bosque» o un plan consolidado del 2015) no se pierde. */}
      {texto && !enCasilla && (
        <p className="text-sm text-[var(--text-secondary)]">
          La ficha dice <span className="font-semibold text-[var(--text-primary)]">«{texto}»</span>: no cae en ninguna casilla del formato 2024.
        </p>
      )}
      {!texto && <p className="text-sm italic text-[var(--text-tertiary)]">En blanco</p>}
    </div>
  );
}

/** N° de registro SERFOR, debajo del N° de la guía, como el renglón impreso «N° DE REGISTRO: ……». */
function RegistroEnCabecera({ registro }: { registro: string | null }) {
  return (
    <span className="flex flex-wrap items-baseline justify-center gap-x-1.5 text-sm font-semibold uppercase text-[var(--gtf-tinta)]">
      N° de registro:
      {registro ? (
        <span className="font-mono text-base normal-case text-[var(--text-primary)]">{registro}</span>
      ) : (
        <span className="font-normal normal-case italic text-[var(--text-tertiary)]">En blanco</span>
      )}
    </span>
  );
}

const ORIGEN = "Datos del origen del recurso o procedencia";
const PROPIETARIO = "Datos del propietario del producto";
const PARTIDA = "Datos del punto de partida";
const DESTINATARIO = "Datos del destinatario";
const TRANSPORTISTA = "Datos del transportista";

/** Las secciones del cuerpo, en el orden del papel. `c` = un casillero de la ficha. */
function Secciones({ d, ficha }: { d: DatosPapel; ficha: GtfSerfor }) {
  const c = (claves: readonly string[], className?: string) => <CasilleroPapel key={claves.join("+")} d={d} claves={claves} className={className} />;
  return (
    <>
      <CuerpoPapel>
        {c(["2"])}
        <FilaPapel cols={2}>
          {c(["3"])}
          {c(["4"])}
        </FilaPapel>
      </CuerpoPapel>

      <FranjaGtf
        titulo={ORIGEN}
        extra={<AyudaFranja titulo="Origen del recurso" que={`${rango("5", "12")}: el permiso que ampara la madera, su titular y dónde está el recurso.`} />}
      />
      <CuerpoPapel>
        <OrigenCasillas texto={limpio(ficha.origenRecurso)} />
        {c(["6"])}
        <FilaPapel cols="ancha">
          {c(["7"])}
          {c(["rep"])}
        </FilaPapel>
        <FilaPapel cols={2}>
          {c(["8"])}
          {c(["9"])}
        </FilaPapel>
        <FilaPapel cols={3}>
          {c(["10"])}
          {c(["11"])}
          {c(["12"])}
        </FilaPapel>
      </CuerpoPapel>

      <FranjaGtf
        titulo={PROPIETARIO}
        extra={<AyudaFranja titulo="Propietario del producto" que={`${rango("13", "21")}: el dueño de la madera que viaja.`} />}
      />
      <CuerpoPapel>
        {c(["13"])}
        <FilaPapel cols={2}>
          {c(["15", "14"])}
          {c(["16"])}
        </FilaPapel>
        <FilaPapel cols={3}>
          {c(["17"])}
          {c(["18"])}
          {c(["19"])}
        </FilaPapel>
        <FilaPapel cols="ancha">
          {c(["20"])}
          {c(["21"])}
        </FilaPapel>
      </CuerpoPapel>

      <FranjaGtf
        titulo={PARTIDA}
        extra={
          <AyudaFranja
            titulo="Punto de partida"
            que={`${rango("p17", "p20d")}: de dónde sale la madera.`}
            nota={`La consulta de SERFOR no publica el punto de partida. Al importar la guía se guarda como partida el lugar del origen del recurso, (${casilla("10").n}) a (${casilla("12").n}): eso es lo que ves en departamento, provincia y distrito.`}
          />
        }
      />
      <CuerpoPapel>
        <FilaPapel cols="ancha">
          {c(["p17"])}
          {c(["p18"])}
        </FilaPapel>
        <FilaPapel cols={2}>
          {c(["p19"])}
          {c(["p20a"])}
        </FilaPapel>
        <FilaPapel cols={3}>
          {c(["p20b"])}
          {c(["p20c"])}
          {c(["p20d"])}
        </FilaPapel>
      </CuerpoPapel>

      <FranjaGtf
        titulo={DESTINATARIO}
        extra={
          <AyudaFranja
            titulo="Destinatario"
            que={`${rango("22", "28")}: a quién va la madera. Su dirección es el punto de llegada (el formato 2024 no tiene un bloque de llegada aparte).`}
          />
        }
      />
      <CuerpoPapel>
        <FilaPapel cols="ancha">
          {c(["22"])}
          {c(["d22"])}
        </FilaPapel>
        <FilaPapel cols={2}>
          {c(["24", "23"])}
          {c(["25"])}
        </FilaPapel>
        <FilaPapel cols={3}>
          {c(["26"])}
          {c(["27"])}
          {c(["28"])}
        </FilaPapel>
      </CuerpoPapel>

      <FranjaGtf
        titulo={TRANSPORTISTA}
        extra={<AyudaFranja titulo="Transportista" que={`${rango("29", "34")}: la guía de remisión, el vehículo y el conductor.`} />}
      />
      <CuerpoPapel>
        <FilaPapel cols="ancha">
          {c(["29"])}
          {c(["30"])}
        </FilaPapel>
        <FilaPapel cols={2}>
          {c(["31"])}
          {c(["31p"])}
        </FilaPapel>
        <FilaPapel cols="3a">
          {c(["32"])}
          {c(["33"])}
          {c(["34"])}
        </FilaPapel>
      </CuerpoPapel>
    </>
  );
}

/** Cuántos casilleros del Anexo I dibuja esta hoja (para el lector de pantalla). */
const TOTAL_CASILLEROS = CASILLEROS_GTF_2024.length;

/** `conTrozas`: la guía trae su lista de trozas (para la «X» del Anexo 03 cuando SERFOR no publica el N° del (33)). */
export default function GtfDatosPapelGuia({ ficha, conTrozas = false }: { ficha: GtfSerfor; conTrozas?: boolean }) {
  const d = datosDeLaFicha(ficha);
  const cabecera = cabeceraDeLaFicha(ficha);
  const { serie, numero } = partirNumero(ficha.gtfNumber);
  return (
    <div className="@container/papel space-y-3">
      <PapelGtf>
        <section aria-label={`Guía de transporte forestal ${ficha.gtfNumber ?? ""} como el papel, ${TOTAL_CASILLEROS} casilleros del formato 2024`}>
          <EncabezadoGtfPapel
            hoja="guia"
            {...cabecera}
            serie={serie}
            numero={numero}
            extra={<RegistroEnCabecera registro={limpio(ficha.numeroRegistro)} />}
          />
          <Secciones d={d} ficha={ficha} />
          <DetalleProductoPapel d={d} ficha={ficha} conTrozas={conTrozas} />
        </section>
      </PapelGtf>
      <RegistroSerforPapel ficha={ficha} />
    </div>
  );
}
