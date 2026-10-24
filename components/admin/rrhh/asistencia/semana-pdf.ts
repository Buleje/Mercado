/**
 * semana-pdf.ts — arma el PDF de la hoja semanal con lo mismo que pinta la
 * pantalla (ADR-416).
 *
 * El documento de cada persona se pide sólo al descargar: la hoja no lo trae
 * (el nivel marcar no ve documentos) y pedirlo en cada apertura sería un
 * pedido de más.
 */

import { leerMembrete, logoParaPdf } from "@/lib/admin/membrete-cliente";
import { leerJson, sinDato } from "@/lib/errores/sin-dato";
import { descargarHojaSemanal, type FilaHojaSemanalPdf } from "@/lib/rrhh/asistencia-semanal-pdf";
import type { AsistenciaDTO, ColaboradorDTO, ColaboradorMinDTO, EstadoAsistencia, FechaKey, GanadoPersona, NivelRrhh } from "@/lib/rrhh/tipos";
import { COPY_REFERENCIA, ESTADO_ASISTENCIA_META, estaIncluidoEseDia, etiquetaModalidad, formatearPEN, leyendaDeCalculo } from "../rrhh-ui";
import { encabezadoDia, etiquetaSemana } from "./semana";

/** Una fila de la hoja semanal: lo que pinta la tabla y lo que va al papel. */
export interface FilaSemana {
  c: ColaboradorMinDTO;
  marcasDeLaPersona: AsistenciaDTO[];
  conteo: Record<EstadoAsistencia, number>;
  sinMarcar: number;
  trabajados: number;
  plata: GanadoPersona | null;
}

async function documentosPorId(nivel: NivelRrhh): Promise<Map<string, string>> {
  if (nivel === "marcar") return new Map();
  const res = await fetch("/api/rrhh/colaboradores?incluirCesados=1", { credentials: "include" }).catch(sinDato("RRHH documentos para el PDF semanal"));
  if (!res?.ok) return new Map();
  const data = await leerJson<{ colaboradores: ColaboradorDTO[] }>(res);
  const pares: [string, string][] = [];
  for (const c of data?.colaboradores ?? []) {
    if (c.documento) pares.push([c.id, `${c.tipoDocumento ?? "Doc."} ${c.documento}`]);
  }
  return new Map(pares);
}

export async function descargarPdfDeLaSemana(p: {
  filas: FilaSemana[];
  dias: FechaKey[];
  lunes: FechaKey;
  hoy: FechaKey;
  nivel: NivelRrhh;
  total: number | null;
}): Promise<void> {
  const conPlata = p.nivel === "completo";
  const [documentos, membrete] = await Promise.all([documentosPorId(p.nivel), leerMembrete()]);
  const logo = await logoParaPdf(membrete.logoUrl);

  const filas: FilaHojaSemanalPdf[] = p.filas.map((f) => ({
    nombre: f.c.nombre,
    documento: documentos.get(f.c.id) ?? null,
    puesto: f.c.puesto?.nombre ?? null,
    dias: p.dias.map((d) => {
      const marca = f.marcasDeLaPersona.find((m) => m.fecha === d);
      if (marca) return ESTADO_ASISTENCIA_META[marca.estado].letra;
      return d > p.hoy || !estaIncluidoEseDia(f.c, d) ? "—" : "";
    }),
    diasTrabajados: f.trabajados,
    faltas: f.conteo.FALTA,
    permisos: f.conteo.PERMISO,
    ...(conPlata
      ? {
          importes: p.dias.map((d) => f.plata?.dias.find((x) => x.fecha === d)?.importe ?? null),
          referencia: f.plata?.referencia ? `${formatearPEN(f.plata.referencia.monto)} ${etiquetaModalidad(f.plata.referencia.modalidad)}` : "Sin tarifa",
          ganado: f.plata?.total ?? null,
        }
      : {}),
  }));

  await descargarHojaSemanal({
    negocio: membrete.nombre,
    logo,
    semana: etiquetaSemana(p.lunes),
    encabezadosDias: p.dias.map(encabezadoDia),
    filas,
    conPlata,
    total: conPlata ? p.total : null,
    notas: [
      `${leyendaDeCalculo()} · (vacío) sin marcar · — no le tocaba ese día${conPlata ? " · montos del día en soles" : ""}`,
      ...(conPlata ? [COPY_REFERENCIA] : []),
    ],
    archivo: `asistencia-semana-${p.lunes}`,
  });
}
