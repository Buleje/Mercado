"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeStatus, SectionTitle, WarningAlert } from "@buleje/design-system";
import { ArrowLeft, BookOpen } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import { Interruptor } from "@/components/ui-system/Interruptor";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { suplantarTienda } from "@/components/superadmin/tenants/abrir-panel-tienda";
import type { FuenteLectura, PlantaResumen } from "@/lib/superadmin/plantas-forestales/tipos";
import { SemaforoBadge } from "./cifras";
import { FUENTE } from "./formato";

interface Props {
  resumen: PlantaResumen;
  sufijo: string;
  marcarPrueba: (v: boolean) => void;
  cambiandoPrueba: boolean;
}

const TONO_MOTIVO = {
  verde: "border-[var(--data-success)] bg-[var(--data-success-50)]",
  amarillo: "border-[var(--data-warning)] bg-[var(--data-warning-50)]",
  rojo: "border-[var(--data-error)] bg-[var(--data-error-50)]",
  gris: "border-[var(--rule-strong)] bg-[var(--surface-sunken)]",
} as const;

/** Libro de la planta: entra como ella (candado cerrado → Credenciales) en el libro CTP. */
function AbrirLibro({ slug }: { slug: string }) {
  const [estado, setEstado] = useState<"listo" | "abriendo" | "error">("listo");
  const abrir = async () => {
    setEstado("abriendo");
    const r = await suplantarTienda(slug, undefined, "tab=ctp-libro-operaciones");
    setEstado(r === "error" ? "error" : "listo");
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="primary" onClick={() => void abrir()} disabled={estado === "abriendo"}>
        <BookOpen className="h-4 w-4" aria-hidden />
        {estado === "abriendo" ? "Abriendo…" : "Abrir su libro"}
      </Button>
      {estado === "error" && <span role="alert" className="text-[length:var(--ts-xs)] text-[var(--data-error)]">No se pudo entrar. Prueba de nuevo.</span>}
    </div>
  );
}

/** Nombre, semáforo y por qué, con quién opera y las dos acciones de la planta. */
export function FichaCabecera({ resumen, sufijo, marcarPrueba, cambiandoPrueba }: Props) {
  const { identidad: id, semaforo, motivoSemaforo, lecturas } = resumen;
  const fallidas = (Object.keys(lecturas) as FuenteLectura[]).filter((f) => lecturas[f] === "error");
  const hermanas = id.grupoOperaciones?.hermanas ?? [];

  return (
    <div className="space-y-4">
      <Link href={`/superadmin/plantas${sufijo}`} className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Todas las plantas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <SectionTitle className="min-w-0 break-words">{id.nombre}</SectionTitle>
            <SemaforoBadge semaforo={semaforo} size="md" />
            {id.esPrueba && <BadgeStatus variant="neutral" label="Prueba" size="sm" />}
            {!id.activo && <BadgeStatus variant="error" label="Inactiva" size="sm" />}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-tertiary)]">
            <span>{id.slug}</span>
            <span aria-hidden>·</span>
            <span>Plan {id.plan}</span>
            {id.especializaciones.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{id.especializaciones.join(", ")}</span>
              </>
            )}
          </div>
          {hermanas.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="text-[var(--text-tertiary)]">Opera junto con</span>
              {hermanas.map((h) => (
                <Link key={h.tenantId} href={`/superadmin/tenants?ficha=${encodeURIComponent(h.slug)}`} className="font-medium text-[var(--text-primary)] hover:underline">
                  {h.nombre}
                </Link>
              ))}
              <InfoTip
                title="Operaciones hermanas"
                what="Negocios del mismo dueño que comparten la operación (por ejemplo, la planta y su tienda)."
                affects="Lo de cada una se cuenta en su propio libro: acá no se suman."
              />
            </div>
          )}
        </div>
        <AbrirLibro slug={id.slug} />
      </div>

      <div className={`rounded-xl border-l-4 px-4 py-3 text-sm text-[var(--text-primary)] ${TONO_MOTIVO[semaforo]}`}>
        <span className="font-semibold">Por qué: </span>
        {motivoSemaforo}
      </div>

      {fallidas.length > 0 && (
        <WarningAlert
          title="Parte del libro no se pudo leer"
          description={`Falta ${fallidas.map((f) => FUENTE[f]).join(", ")}. Lo que no se leyó se ve como «—», nunca como 0. Prueba «Recalcular».`}
        />
      )}

      <Interruptor
        enabled={id.esPrueba}
        onChange={marcarPrueba}
        disabled={cambiandoPrueba}
        label="Planta de prueba"
        desc="No se suma en los totales ni en «Plantas en rojo» de la lista."
      />
    </div>
  );
}
