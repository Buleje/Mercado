"use client";

/**
 * La línea de ayuda de cada origen del importador del cubicador (archivo,
 * foto, audio). Sacada de `ImportarCubicacionModal` para que el modal no pase
 * las 300 líneas al sumar «Pegar» (que trae su propia ayuda en la tabla).
 */
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

export type OrigenImport = "excel" | "pegar" | "foto" | "audio";

export default function AyudaDelOrigen({ modo }: { modo: OrigenImport }) {
  if (modo === "pegar") return null;
  return (
    <>
    {modo === "excel" ? (
      <p className="mb-3 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        Sube un Excel con <b>Especie · Cantidad · Espesor · Ancho · Largo</b>.
        <InfoTip
          icono="ayuda"
          title="Importar desde Excel"
          what="Cantidad es opcional (por defecto 1). Espesor y ancho se toman en pulgadas y el largo en pies, salvo que agregues columnas de unidad."
          example="La plantilla trae al lado un resumen en vivo (piezas · pie tablar · m³ · especies distintas) que se calcula solo mientras la vas llenando, para ver qué se va a importar sin salir del Excel."
        />
      </p>
    ) : modo === "foto" ? (
      <p className="mb-3 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        Sácale una foto a la planilla de cubicación escrita a mano.
        <InfoTip
          icono="ayuda"
          title="Escanear planilla de cubicación"
          what="La IA lee la letra y arma la lista de piezas: cantidad, espesor, ancho y largo por fila."
          example="Tú la revisas contra la foto antes de sumarla al lote; las filas donde la IA no estuvo segura salen resaltadas."
        />
      </p>
    ) : (
      <p className="mb-3 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        Sube un audio con las medidas dictadas tabla por tabla.
        <InfoTip
          icono="ayuda"
          title="Importar dictado de audio"
          what={<>Se transcribe y se separa en piezas automáticamente — espesor, ancho y largo (&ldquo;dos ocho once, dos ocho diez…&rdquo;); tú revisas el transcript y la lista antes de sumarla al lote.</>}
          example={<>Igual que el micrófono en vivo: &ldquo;cinco tablas de dos por ocho por diez&rdquo; (cantidad), &ldquo;especie cedro&rdquo;, &ldquo;pon fijo el largo a diez&rdquo; / &ldquo;quita el fijo&rdquo;, &ldquo;elimina el último&rdquo; si te corregiste al dictar.</>}
          ancho="w-80"
        />
      </p>
    )}
    </>
  );
}
