import { Suspense } from "react";
import { headers } from "next/headers";
import { PapelesEmitidosDB } from "@/lib/db/papeles-emitidos.db";
import { TenantsDB } from "@/lib/db/tenants.db";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { ETIQUETA_TIPO_PAPEL, TIPOS_PAPEL, type PapelPublico, type TipoPapel } from "@/lib/papeles/registro";
import { fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { tenantDeVerificacion } from "../../_componentes/tenant-verificacion";
import { Consultando, MarcoVerificacion, NoEncontrado, fdate } from "../../_componentes/certificado-troza";

/**
 * /verificar/papel/[codigo] — lo que abre el QR del pie de un papel del
 * negocio (proforma, liquidación, contrato…; ADR-534). Corta: `/v/<negocio>/p/<código>?k=<clave>`.
 *
 * Muestra lo MÍNIMO para saber si el papel es legítimo y vigente: tipo, número,
 * fecha, hojas y estado. El total sale SOLO con la clave del QR (`?k=`, 12 hex
 * que no se imprimen), así que quien adivine un código no ve plata. La tabla
 * no guarda nombre, DNI ni detalle (Ley 29733): no hay nada más que mostrar.
 * Un código de otro negocio o inventado da el mismo «no encontrado».
 *
 * Revisión de seguridad (ADR-534): la página dice QUIÉN emitió el papel
 * (cualquiera puede darse de alta: «está registrado» no prueba de quién es) y
 * pone un tope de consultas por IP antes de tocar la base (los números son
 * correlativos y el código impreso lleva solo 4 hex).
 */

export const metadata = {
  title: "Verificación de papel",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const KICKER = "Verificación de papel emitido";
const SUBTITULO = "Copia registrada en el sistema del negocio";
const PIE = "Verificación generada por el sistema Buleje · Solo datos mínimos del papel, sin datos personales";

/** 30 consultas por minuto por IP (por instancia): de sobra para quien escanea, lento para quien adivina. */
const consultas = createRateLimiter({ maxRequests: 30, windowMs: 60_000 });

export default function VerificarPapelPage(props: Props) {
  return (
    <Suspense fallback={<Consultando />}>
      <Contenido {...props} />
    </Suspense>
  );
}

async function Contenido({ params, searchParams }: Props) {
  const [{ codigo }, sp, h] = await Promise.all([params, searchParams, headers()]);
  if (!consultas.check(getClientIp({ headers: h }))) {
    return (
      <MarcoVerificacion kicker={KICKER} titulo="Demasiadas consultas" subtitulo={SUBTITULO} pie={PIE}>
        <NoEncontrado titulo="Demasiadas consultas">Espera un minuto y vuelve a escanear el QR.</NoEncontrado>
      </MarcoVerificacion>
    );
  }
  const k = (Array.isArray(sp.k) ? sp.k[0] : sp.k) ?? null;
  // Host (subdominio, dominio propio, `/t/<slug>`) o el código de `/v/…` (ADR-486).
  const tenantId = await tenantDeVerificacion();
  const [papel, emisor] = tenantId
    ? await Promise.all([
        PapelesEmitidosDB.publico(tenantId, codigo, k).catch((err: unknown) => {
          logger.warn("[verificar/papel] no se pudo leer el papel", { error: String(err) });
          return null;
        }),
        TenantsDB.getBasicById(tenantId).catch((err: unknown) => {
          logger.warn("[verificar/papel] no se pudo leer el negocio", { error: String(err) });
          return null;
        }),
      ])
    : [null, null];
  if (!papel || !emisor) {
    return (
      <MarcoVerificacion kicker={KICKER} titulo="Papel no encontrado" subtitulo={SUBTITULO} pie={PIE}>
        <NoEncontrado titulo="Papel no encontrado">Este código no corresponde a un papel registrado por este negocio.</NoEncontrado>
      </MarcoVerificacion>
    );
  }
  return (
    <MarcoVerificacion kicker={KICKER} titulo={<span className="font-mono">{papel.numero}</span>} subtitulo={SUBTITULO} pie={PIE}>
      <div className="divide-y divide-slate-100" data-papel-estado={papel.estado}>
        <div className="space-y-3 px-6 pt-5">
          <AvisoEstado estado={papel.estado} />
          <div>
            <div className="text-xs text-slate-500">Emitido por</div>
            <div className="text-base font-bold text-slate-800" data-papel-emisor>{emisor.name}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 px-6 py-5 sm:grid-cols-4">
          <Dato label="Tipo" value={etiquetaTipo(papel.tipo)} />
          <Dato label="Fecha" value={fdate(`${papel.fecha}T00:00:00.000Z`)} />
          <Dato label="Hojas" value={papel.hojas == null ? "—" : String(papel.hojas)} />
          <Dato label="Total" value={textoTotal(papel)} />
        </div>
        <div className="px-6 py-4 text-sm text-slate-600">
          Código: <span className="font-mono font-semibold text-slate-800">{papel.codigo}</span> · tiene que ser el mismo que está
          impreso al pie del papel.
          {!papel.conClave && " El total se ve solo al escanear el QR impreso."}
        </div>
      </div>
    </MarcoVerificacion>
  );
}

const esTipo = (t: string): t is TipoPapel => (TIPOS_PAPEL as readonly string[]).includes(t);
const etiquetaTipo = (t: string) => (esTipo(t) ? ETIQUETA_TIPO_PAPEL[t] : t);

function textoTotal(p: PapelPublico): string {
  if (p.total == null) return "—";
  const n = Number(p.total);
  if (!Number.isFinite(n)) return "—";
  return `${p.moneda === "USD" ? "US$" : "S/"} ${fmtSoles(n)}`;
}

const AVISO: Record<PapelPublico["estado"], { clase: string; texto: string }> = {
  oficial: { clase: "bg-emerald-50 text-emerald-800", texto: "Papel vigente: es la versión oficial registrada por el negocio." },
  revision: { clase: "bg-amber-50 text-amber-900", texto: "En revisión: todavía no es la versión final." },
  borrador: { clase: "bg-amber-50 text-amber-900", texto: "Borrador: no es un papel final." },
  reemplazado: { clase: "bg-red-50 text-red-800", texto: "Este papel fue REEMPLAZADO por una versión más nueva: pide la última." },
  anulado: { clase: "bg-red-50 text-red-800", texto: "Este papel fue ANULADO: no tiene validez." },
};

function AvisoEstado({ estado }: { estado: PapelPublico["estado"] }) {
  const a = AVISO[estado];
  return <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${a.clase}`}>{a.texto}</div>;
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-base font-bold text-slate-800">{value}</div>
    </div>
  );
}
