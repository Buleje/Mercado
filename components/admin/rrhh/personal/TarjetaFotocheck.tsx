"use client";

/**
 * TarjetaFotocheck — cómo va a salir el fotocheck, en pantalla (ADR-416).
 *
 * Réplica a escala de lo que dibuja `lib/rrhh/fotocheck-pdf.ts`: tarjeta CR80
 * (54 × 85,6 mm) vertical, frente y dorso. Recibe la MISMA `PersonaFotocheck`
 * que alimenta al PDF, así que lo que se ve acá es lo que se imprime — si el
 * preview y el papel discrepan, discrepan por el dibujo, nunca por los datos.
 *
 * Cómo se mantiene la escala: la tarjeta es un `container`, y cada medida sale
 * de la del PDF dividida por los 54 mm de ancho (`cqw`) o los 85,6 de alto (%).
 * Un cuerpo de 9 pt = 3,17 mm = 5,9 % de 54 mm → `text-[5.9cqw]`. Así la
 * tarjeta se ve igual a 200 px que a 400. Los colores salen de los tokens del
 * panel: en oscuro la tarjeta acompaña al tema, el PDF siempre imprime blanco.
 */

import { useState } from "react";

import type { PersonaFotocheck } from "@/lib/rrhh/fotocheck-pdf";
import { cn } from "@/lib/utils";
import { iniciales } from "../rrhh-ui";

/** El turquesa del PDF (#007F7F): el token que el panel usa para tinta de marca sobre claro. */
const TURQUESA = "var(--color-primary-dark)";

interface Props {
  persona: PersonaFotocheck;
  /** Data URL del QR ya generado; mientras carga se ve el recuadro vacío. */
  qr: string | null;
  negocio: string | null;
  contacto: string | null;
  logoUrl: string | null;
  cara: "frente" | "dorso";
  className?: string;
}

export default function TarjetaFotocheck({ persona, qr, negocio, contacto, logoUrl, cara, className }: Props) {
  return (
    <div
      style={{ containerType: "inline-size" }}
      className={cn(
        "relative flex aspect-[54/85.6] w-full flex-col overflow-hidden rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {cara === "frente" ? (
        <Frente persona={persona} qr={qr} negocio={negocio} logoUrl={logoUrl} />
      ) : (
        <Dorso persona={persona} qr={qr} negocio={negocio} contacto={contacto} />
      )}
    </div>
  );
}

function Frente({ persona, qr, negocio, logoUrl }: Pick<Props, "persona" | "qr" | "negocio" | "logoUrl">) {
  const [tipo, ...numero] = (persona.documento ?? "").split(" ");
  // La foto se pide con las MISMAS reglas que el PDF (`crossOrigin`, que el canvas
  // exige): si un origen sin CORS la va a dejar fuera del papel, tampoco se ve acá.
  // Si no, el preview mostraría una foto que la impresión reemplaza por iniciales.
  const [fotoRota, setFotoRota] = useState(false);
  const conFoto = Boolean(persona.fotoUrl) && !fotoRota;
  return (
    <>
      {/* Banda del negocio: 14 mm de 85,6 = 16,4 % del alto. */}
      <div className="flex h-[16.4%] shrink-0 items-center gap-[2cqw] px-[4cqw]" style={{ backgroundColor: TURQUESA }}>
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- logo del tenant, sin dominio fijo
          <img src={logoUrl} alt="" className="h-[64%] w-auto max-w-[30%] rounded-[1cqw] bg-[var(--surface-raised)] object-contain p-[1cqw]" />
        )}
        <p className="min-w-0 flex-1 text-center text-[5.2cqw] font-extrabold uppercase leading-tight text-white">
          <span className="line-clamp-3">{negocio || "Fotocheck"}</span>
        </p>
      </div>

      {/* Foto 28 × 37,3 mm centrada; sin foto, las iniciales — igual que el PDF. */}
      <div className="mt-[4.7%] flex justify-center">
        <div
          className="relative flex aspect-[28/37.3] w-[52%] items-center justify-center overflow-hidden border-[0.9cqw] bg-[var(--accent-muted)]"
          style={{ borderColor: TURQUESA }}
        >
          {conFoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto subida por el tenant
            <img
              src={persona.fotoUrl ?? ""}
              alt=""
              crossOrigin="anonymous"
              onError={() => setFotoRota(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="text-[16cqw] font-black leading-none" style={{ color: TURQUESA }}>
              {iniciales(persona.nombre)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-[2.5%] px-[6cqw] text-center">
        <p className="line-clamp-2 text-[6.2cqw] font-bold leading-tight text-[var(--text-primary)]">{persona.nombre}</p>
        {persona.puesto && (
          <p className="mt-[1cqw] truncate text-[4.9cqw] font-semibold" style={{ color: TURQUESA }}>
            {persona.puesto}
          </p>
        )}
      </div>

      {/* Pie: documento e ingreso a la izquierda, QR de 12 mm a la derecha. */}
      <div className="mt-auto flex items-end justify-between gap-[2cqw] p-[6.5cqw]">
        <dl className="min-w-0 space-y-[2cqw]">
          {persona.documento && <Dato etiqueta={tipo || "Documento"} valor={numero.join(" ")} />}
          {persona.ingreso && <Dato etiqueta="Ingreso" valor={persona.ingreso} />}
        </dl>
        <Qr src={qr} className="w-[22%]" />
      </div>
    </>
  );
}

/**
 * Dorso. Con datos de seguridad (ADR-417) el PDF achica el QR de 26 a 22 mm
 * —48 % → 41 % del ancho— para hacerle sitio a la caja del grupo sanguíneo:
 * acá se achica igual, y con la misma condición, para que el preview no
 * prometa un QR más grande del que se imprime.
 */
function Dorso({ persona, qr, negocio, contacto }: Pick<Props, "persona" | "qr" | "negocio" | "contacto">) {
  const alergias = persona.alergias?.trim();
  const conCuidados = Boolean(persona.grupoSanguineo || alergias);
  return (
    <>
      <div className="flex h-[10.5%] shrink-0 items-center justify-center" style={{ backgroundColor: TURQUESA }}>
        <p className="text-[4.2cqw] font-extrabold uppercase text-white">Personal e intransferible</p>
      </div>

      <div className="mt-[4%] flex flex-col items-center">
        <Qr src={qr} className={conCuidados ? "w-[41%]" : "w-[48%]"} />
        <p className="mt-[2cqw] text-center text-[3.8cqw] text-[var(--text-tertiary)]">Escanea para abrir su ficha en el panel</p>
      </div>

      {conCuidados && (
        // Caja de 16 × 13 mm (29,6 % × 15,2 %) con el grupo a 16 pt = 10,5cqw:
        // la letra más grande del dorso, que es lo que se lee en una emergencia.
        <div className={cn("mt-[2.2%] flex h-[15.2%] shrink-0 items-stretch gap-[4.6cqw] pr-[9cqw]", persona.grupoSanguineo ? "pl-[7.4cqw]" : "pl-[9cqw]")}>
          {persona.grupoSanguineo && (
            <div className="flex w-[29.6%] shrink-0 flex-col items-center justify-center rounded-[2.8cqw]" style={{ backgroundColor: TURQUESA }}>
              <span className="text-[3.4cqw] uppercase leading-none text-white">Grupo</span>
              <span className="mt-[1.6cqw] text-[10.5cqw] font-bold leading-none text-white">{persona.grupoSanguineo}</span>
            </div>
          )}
          {alergias && (
            <div className="min-w-0 flex-1">
              <p className="text-[3.6cqw] uppercase leading-none text-[var(--text-tertiary)]">Alergias</p>
              <p className="mt-[1.4cqw] line-clamp-3 text-[4.25cqw] font-bold leading-snug text-[var(--text-primary)]">{alergias}</p>
            </div>
          )}
        </div>
      )}

      <div className={cn("space-y-[1cqw] px-[9cqw]", conCuidados ? "mt-[2.5%]" : "mt-[4%]")}>
        <p className="text-[4.2cqw] font-extrabold uppercase text-[var(--text-primary)]">En caso de emergencia</p>
        <p className="truncate text-[4.6cqw] text-[var(--text-primary)]">{persona.emergencia.nombre ?? "—"}</p>
        {persona.emergencia.celular && <p className="text-[4.6cqw] text-[var(--text-primary)]">{persona.emergencia.celular}</p>}
      </div>

      {negocio && (
        <div className="mt-[4%] space-y-[1cqw] px-[9cqw]">
          <p className="text-[3.8cqw] text-[var(--text-tertiary)]">Si encuentras este fotocheck, devuélvelo a:</p>
          <p className="truncate text-[4.6cqw] font-bold text-[var(--text-primary)]">{negocio}</p>
          {contacto && <p className="truncate text-[4.2cqw] text-[var(--text-secondary)]">{contacto}</p>}
        </div>
      )}

      <div className="mt-auto px-[16cqw] pb-[4cqw] text-center">
        <div className="border-t border-[var(--rule-base)] pt-[1cqw]">
          <p className="text-[3.8cqw] text-[var(--text-tertiary)]">Firma del titular</p>
        </div>
      </div>
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[3.8cqw] uppercase leading-none text-[var(--text-tertiary)]">{etiqueta}</dt>
      <dd className="truncate text-[4.7cqw] font-bold leading-tight text-[var(--text-primary)]">{valor}</dd>
    </div>
  );
}

/** El mismo QR que el PDF: lleva a la ficha en el panel, que pide iniciar sesión. */
function Qr({ src, className }: { src: string | null; className: string }) {
  return (
    <div className={cn("aspect-square shrink-0 overflow-hidden rounded-[1cqw] bg-[var(--surface-sunken)]", className)}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- data URL generado en el navegador
        <img src={src} alt="" className="h-full w-full" />
      )}
    </div>
  );
}
