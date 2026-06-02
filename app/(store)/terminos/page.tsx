import type { Metadata } from "next";
import Link from "next/link";
import {
  FileCheck,
  Store,
  User,
  ShoppingCart,
  Tag,
  CreditCard,
  Receipt,
  Truck,
  RotateCcw,
  Wine,
  MessageSquare,
  Copyright,
  Ban,
  Briefcase,
  ShieldCheck,
  Scale,
  Power,
  RefreshCw,
  Gavel,
  Info,
  ChevronRight,
} from "lucide-react";
import Breadcrumbs from "@/components/ui-system/Breadcrumbs";
import { LEGAL, LEGAL_COMPLETO } from "@/lib/legal";

const BASE_URL = "https://www.buleje.pe";
const LAST_UPDATED = "2 de junio de 2026";

const CARD =
  "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
  description:
    "Términos y Condiciones de uso de la plataforma Buleje: marketplace, pedidos, pagos, delivery, vendedores y solución de controversias. Conforme a la Ley N° 29571.",
  alternates: { canonical: `${BASE_URL}/terminos` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Términos y Condiciones — Buleje",
    description: "Condiciones de uso de la plataforma Buleje.",
    url: `${BASE_URL}/terminos`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
};

const TOC = [
  { id: "aceptacion", n: 1, title: "Aceptación y titular", icon: FileCheck },
  { id: "marketplace", n: 2, title: "Naturaleza: marketplace", icon: Store },
  { id: "cuenta", n: 3, title: "Tu cuenta", icon: User },
  { id: "pedidos", n: 4, title: "Cómo funciona el pedido", icon: ShoppingCart },
  { id: "precios", n: 5, title: "Precios, impuestos y errores", icon: Tag },
  { id: "pagos", n: 6, title: "Métodos de pago", icon: CreditCard },
  { id: "comprobantes", n: 7, title: "Comprobantes (SUNAT)", icon: Receipt },
  { id: "delivery", n: 8, title: "Delivery y entrega", icon: Truck },
  { id: "devoluciones", n: 9, title: "Cancelaciones y reembolsos", icon: RotateCcw },
  { id: "alcohol", n: 10, title: "Bebidas alcohólicas (+18)", icon: Wine },
  { id: "contenido", n: 11, title: "Contenido del usuario", icon: MessageSquare },
  { id: "propiedad", n: 12, title: "Propiedad intelectual", icon: Copyright },
  { id: "uso", n: 13, title: "Uso aceptable", icon: Ban },
  { id: "vendedores", n: 14, title: "Para vendedores y negocios", icon: Briefcase },
  { id: "responsabilidad", n: 15, title: "Limitación de responsabilidad", icon: ShieldCheck },
  { id: "indemnizacion", n: 16, title: "Indemnización", icon: Scale },
  { id: "terminacion", n: 17, title: "Suspensión, baja y cesión", icon: Power },
  { id: "modificaciones", n: 18, title: "Modificaciones", icon: RefreshCw },
  { id: "ley", n: 19, title: "Ley aplicable e INDECOPI", icon: Gavel },
  { id: "varios", n: 20, title: "Disposiciones varias y contacto", icon: Info },
] as const;

function Section({
  id,
  n,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  n: number;
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`${CARD} scroll-mt-24 p-6 sm:p-7`}>
      <h2 className="flex items-center gap-3 text-xl font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Icon className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <span className="text-sm font-bold text-[var(--text-tertiary)] tabular-nums">{n}.</span>
        {title}
      </h2>
      <div className="mt-4 space-y-3 text-base leading-relaxed text-[var(--text-secondary)]">
        {children}
      </div>
    </section>
  );
}

const LI = "flex gap-2.5";
function Dot() {
  return <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.5} aria-hidden />;
}
const B = ({ children }: { children: React.ReactNode }) => (
  <strong className="text-[var(--text-primary)]">{children}</strong>
);

export default function TerminosPage() {
  return (
    <main id="main-content" className="bg-[var(--surface-canvas)]">
      {/* ── Breadcrumb ── */}
      <div className="border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <Breadcrumbs items={[{ label: "Términos y Condiciones" }]} />
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-[var(--rule-soft)] bg-gradient-to-b from-[var(--accent-soft)]/60 to-[var(--surface-raised)]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--accent)]/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:py-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/25 bg-[var(--surface-raised)] px-3 py-1 text-sm font-bold text-[var(--accent)] shadow-[var(--shadow-sm)]">
            <Scale className="h-4 w-4" strokeWidth={2.5} />
            Conforme a la Ley N° 29571 · Marketplace Buleje
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)] sm:text-5xl">
            Términos y Condiciones
          </h1>
          <p className="mt-3 text-sm font-medium text-[var(--text-tertiary)]">
            Última actualización: {LAST_UPDATED}
          </p>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
            Estas condiciones regulan el uso de la plataforma Buleje por parte de
            consumidores, tiendas y repartidores. Al usar Buleje las aceptas. Léelas
            junto con nuestra{" "}
            <Link href="/privacidad" className="font-bold text-[var(--accent)] hover:underline">
              Política de Privacidad
            </Link>
            .
          </p>
        </div>
      </section>

      {/* ── Cuerpo: TOC + secciones ── */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          {/* Índice */}
          <nav aria-label="Índice" className="hidden lg:block lg:sticky lg:top-24">
            <p className="mb-3 text-xs font-extrabold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
              En esta página
            </p>
            <ul className="space-y-1">
              {TOC.map(({ id, n, title }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="flex gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                  >
                    <span className="tabular-nums text-[var(--text-tertiary)]">{n}.</span>
                    {title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Secciones */}
          <div className="space-y-5">
            <Section id="aceptacion" n={1} title="Aceptación y titular" icon={FileCheck}>
              <p>
                Al crear una cuenta, navegar o realizar un pedido en la plataforma Buleje
                (web, aplicaciones y servicios) aceptas estos Términos. Si no estás de
                acuerdo, no uses la plataforma.
              </p>
              {LEGAL_COMPLETO ? (
                <dl className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["Titular", LEGAL.razonSocial],
                      ["RUC", LEGAL.ruc],
                      ["Domicilio", LEGAL.domicilioFiscal],
                      ["Nombre comercial", LEGAL.nombreComercial],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-sm font-bold text-[var(--text-tertiary)]">{k}</dt>
                      <dd className="font-semibold text-[var(--text-primary)]">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>
                  El titular de la plataforma es <B>{LEGAL.nombreComercial}</B>. Los datos
                  completos de identificación del titular se publican en esta página.
                </p>
              )}
              <p>
                Nada en estos Términos limita los <B>derechos irrenunciables</B> que la ley
                peruana reconoce al consumidor (Ley N° 29571). Si una cláusula resultara
                contraria a una norma imperativa de protección al consumidor, prevalecerá
                la norma y el resto de los Términos seguirá vigente.
              </p>
            </Section>

            <Section id="marketplace" n={2} title="Naturaleza del servicio: marketplace e intermediación" icon={Store}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>Buleje es una <B>plataforma tecnológica (marketplace)</B> que conecta a consumidores con tiendas y vendedores independientes (los “vendedores”).</span></li>
                <li className={LI}><Dot /><span>Los vendedores son <B>terceros responsables</B> de sus productos: calidad, stock, precios y emisión de comprobantes. Salvo pedidos vendidos y despachados directamente por Buleje, la relación de consumo se entabla entre el consumidor y el vendedor.</span></li>
                <li className={LI}><Dot /><span>Buleje facilita el pedido, el pago y, cuando aplica, el delivery, y colabora en la solución de controversias vía el <Link href="/libro-de-reclamaciones" className="font-bold text-[var(--accent)] hover:underline">Libro de Reclamaciones</Link>, sin perjuicio de la responsabilidad que la ley pueda atribuir a la plataforma.</span></li>
              </ul>
            </Section>

            <Section id="cuenta" n={3} title="Tu cuenta" icon={User}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>Debes ser <B>mayor de 18 años</B> para registrarte y comprar.</span></li>
                <li className={LI}><Dot /><span>Te comprometes a brindar información <B>veraz y actualizada</B> y a mantener la confidencialidad de tu contraseña. Eres responsable de la actividad realizada desde tu cuenta.</span></li>
                <li className={LI}><Dot /><span>La cuenta es personal e intransferible. Podemos solicitar verificación de identidad cuando sea necesario.</span></li>
              </ul>
            </Section>

            <Section id="pedidos" n={4} title="Cómo funciona el pedido" icon={ShoppingCart}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>La exhibición de productos es una <B>invitación a ofertar</B>. Tu pedido es una oferta de compra que se perfecciona cuando el vendedor la <B>confirma</B>.</span></li>
                <li className={LI}><Dot /><span>Buleje o el vendedor pueden <B>rechazar o cancelar</B> un pedido por falta de stock, error de precio, sospecha de fraude, incumplimiento de estos Términos o estar fuera de la zona de cobertura, reembolsando lo pagado si corresponde.</span></li>
              </ul>
            </Section>

            <Section id="precios" n={5} title="Precios, impuestos y errores" icon={Tag}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>Los precios se expresan en <B>Soles (S/)</B> e incluyen IGV cuando corresponda. Antes de confirmar verás el <B>total</B> (productos + envío + impuestos), sin cobros ocultos.</span></li>
                <li className={LI}><Dot /><span>Los precios, promociones y la disponibilidad pueden cambiar en cualquier momento.</span></li>
                <li className={LI}><Dot /><span>Ante un <B>error evidente</B> de precio o tipográfico, podemos cancelar el pedido afectado y reembolsar lo pagado, aun si ya fue confirmado.</span></li>
              </ul>
            </Section>

            <Section id="pagos" n={6} title="Métodos de pago" icon={CreditCard}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>Aceptamos <B>Yape, Plin, efectivo contra entrega</B> y, en tiendas habilitadas, <B>tarjeta</B>.</span></li>
                <li className={LI}><Dot /><span>El total se calcula y valida en nuestros servidores (medida anti-fraude). Los pagos con tarjeta los procesan pasarelas certificadas; <B>no almacenamos los datos de tu tarjeta</B>.</span></li>
              </ul>
            </Section>

            <Section id="comprobantes" n={7} title="Comprobantes de pago (SUNAT)" icon={Receipt}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>Por cada pedido se emite <B>boleta de venta</B> o <B>factura</B> electrónica conforme a las normas de la SUNAT.</span></li>
                <li className={LI}><Dot /><span>Si necesitas factura, indica tu <B>RUC y razón social</B> al comprar. El comprobante lo emite la tienda vendedora, responsable de la transacción.</span></li>
              </ul>
            </Section>

            <Section id="delivery" n={8} title="Delivery y entrega" icon={Truck}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>El delivery está sujeto a la <B>zona de cobertura</B> y a disponibilidad. Los tiempos mostrados son <B>estimados</B>, no garantizados.</span></li>
                <li className={LI}><Dot /><span>Debes brindar una dirección y referencia correctas, estar disponible para recibir y <B>verificar los productos</B> al momento de la entrega.</span></li>
              </ul>
            </Section>

            <Section id="devoluciones" n={9} title="Cancelaciones, devoluciones y reembolsos" icon={RotateCcw}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>Puedes cancelar tu pedido <B>antes</B> de que el vendedor empiece a prepararlo.</span></li>
                <li className={LI}><Dot /><span>Si recibes un producto <B>defectuoso, vencido, equivocado o no idóneo</B>, tienes derecho a cambio o reembolso conforme al Código de Protección y Defensa del Consumidor. Repórtalo lo antes posible (idealmente dentro de las 24 horas) con evidencia.</span></li>
                <li className={LI}><Dot /><span>Los reembolsos se realizan por el mismo medio de pago: Yape/Plin suelen ser inmediatos; tarjeta, según los plazos de tu banco.</span></li>
              </ul>
            </Section>

            <Section id="alcohol" n={10} title="Venta de bebidas alcohólicas (mayores de 18 años)" icon={Wine}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>La venta y entrega de bebidas alcohólicas se permite <B>únicamente a mayores de 18 años</B>, conforme a la Ley N° 28681. Al comprarlas declaras ser mayor de edad.</span></li>
                <li className={LI}><Dot /><span>El repartidor podrá <B>solicitar documento de identidad</B> y negar la entrega si no se acredita la mayoría de edad o si el receptor está en evidente estado de ebriedad. Está prohibida la venta de alcohol a menores.</span></li>
              </ul>
            </Section>

            <Section id="contenido" n={11} title="Contenido que publicas" icon={MessageSquare}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>Al publicar reseñas, fotos, calificaciones o comentarios declaras que son <B>veraces</B> y que tienes derecho a compartirlos.</span></li>
                <li className={LI}><Dot /><span>Otorgas a Buleje una <B>licencia mundial, no exclusiva, gratuita, transferible y sublicenciable</B> para usar, reproducir, mostrar, adaptar y difundir ese contenido con el fin de operar y promocionar la plataforma, incluso después de cerrar tu cuenta.</span></li>
                <li className={LI}><Dot /><span>Podemos moderar o retirar contenido que infrinja estos Términos, la ley o derechos de terceros.</span></li>
              </ul>
            </Section>

            <Section id="propiedad" n={12} title="Propiedad intelectual" icon={Copyright}>
              <p>
                La plataforma, la marca <B>“Buleje”</B>, los logotipos, el diseño, el software
                y los contenidos propios son propiedad de Buleje o de sus licenciantes y
                están protegidos por la ley. No puedes copiarlos, modificarlos, realizar
                ingeniería inversa ni explotarlos sin autorización escrita.
              </p>
            </Section>

            <Section id="uso" n={13} title="Uso aceptable" icon={Ban}>
              <p>Al usar Buleje te comprometes a NO:</p>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>usar la plataforma para fines ilegales, fraudulentos o no autorizados;</span></li>
                <li className={LI}><Dot /><span>vulnerar la seguridad, acceder a áreas restringidas, hacer scraping masivo o ingeniería inversa;</span></li>
                <li className={LI}><Dot /><span>suplantar identidades, publicar contenido ilícito, ofensivo o engañoso, ni interferir con el funcionamiento del servicio.</span></li>
              </ul>
            </Section>

            <Section id="vendedores" n={14} title="Para vendedores y negocios" icon={Briefcase}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>Registrarte como vendedor requiere <B>RUC vigente</B>, datos veraces y el cumplimiento de tus obligaciones tributarias y de protección al consumidor.</span></li>
                <li className={LI}><Dot /><span>Las <B>comisiones, tarifas y planes</B> se rigen por el plan que contrates, informados en <Link href="/negocios" className="font-bold text-[var(--accent)] hover:underline">Buleje para negocios</Link> y en <Link href="/pricing" className="font-bold text-[var(--accent)] hover:underline">Planes</Link>; Buleje puede actualizarlos con aviso previo.</span></li>
                <li className={LI}><Dot /><span>El vendedor es responsable de sus productos, precios, stock, comprobantes y, si aplica, su entrega, y mantiene <B>indemne</B> a Buleje frente a reclamos derivados de ello.</span></li>
                <li className={LI}><Dot /><span>Buleje puede <B>suspender o dar de baja</B> tiendas que incumplan estos Términos o la ley.</span></li>
              </ul>
            </Section>

            <Section id="responsabilidad" n={15} title="Limitación de responsabilidad y fuerza mayor" icon={ShieldCheck}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>En la máxima medida permitida por la ley, la plataforma se ofrece <B>“tal cual” y “según disponibilidad”</B>.</span></li>
                <li className={LI}><Dot /><span>Buleje no responde por los actos, productos o incumplimientos de los vendedores o repartidores terceros, ni por daños indirectos o lucro cesante. Esto <B>sin perjuicio</B> de los derechos irrenunciables del consumidor y de la responsabilidad que la ley imponga a la plataforma.</span></li>
                <li className={LI}><Dot /><span>No somos responsables por demoras o fallas causadas por <B>fuerza mayor</B>: clima extremo, problemas viales, cortes de servicios, fallas de proveedores tecnológicos u otras circunstancias fuera de nuestro control.</span></li>
              </ul>
            </Section>

            <Section id="indemnizacion" n={16} title="Indemnización" icon={Scale}>
              <p>
                Te comprometes a mantener indemne a Buleje, sus directivos y colaboradores
                frente a cualquier reclamo, daño o gasto (incluidos honorarios legales
                razonables) derivado del incumplimiento de estos Términos, de tu contenido o
                del uso indebido de la plataforma.
              </p>
            </Section>

            <Section id="terminacion" n={17} title="Suspensión, baja y cesión" icon={Power}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>Buleje puede <B>suspender o cancelar</B> cuentas que incumplan estos Términos o la ley, con o sin aviso según la gravedad. Puedes cerrar tu cuenta cuando quieras.</span></li>
                <li className={LI}><Dot /><span>Buleje podrá <B>ceder o transferir</B> estos Términos y la operación de la plataforma —incluida una eventual venta, fusión o reorganización del negocio— a un tercero, que asumirá los mismos compromisos. Tú no puedes ceder tu cuenta sin nuestra autorización.</span></li>
              </ul>
            </Section>

            <Section id="modificaciones" n={18} title="Modificaciones" icon={RefreshCw}>
              <p>
                Podemos modificar estos Términos en cualquier momento. Los cambios rigen
                desde su publicación en el sitio y, cuando sean sustanciales, te avisaremos.
                El uso continuado de la plataforma implica la aceptación de la versión vigente.
              </p>
            </Section>

            <Section id="ley" n={19} title="Ley aplicable, controversias e INDECOPI" icon={Gavel}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span>Estos Términos se rigen por las <B>leyes del Perú</B>.</span></li>
                <li className={LI}><Dot /><span>Sin perjuicio del derecho del consumidor a acudir al <B>INDECOPI</B> y de sus derechos irrenunciables, las controversias que no se resuelvan de buena fe se someten a los jueces y tribunales competentes del domicilio del titular.</span></li>
                <li className={LI}><Dot /><span>Ponemos a tu disposición el <Link href="/libro-de-reclamaciones" className="font-bold text-[var(--accent)] hover:underline">Libro de Reclamaciones Virtual</Link> (plazo de respuesta: 15 días hábiles). Presentar un reclamo no impide acudir a otras vías ni denunciar ante el{" "}
                  <a href="https://www.gob.pe/indecopi" target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--accent)] hover:underline">INDECOPI</a>.</span></li>
              </ul>
            </Section>

            <Section id="varios" n={20} title="Disposiciones varias y contacto" icon={Info}>
              <ul className="space-y-2">
                <li className={LI}><Dot /><span><B>Divisibilidad:</B> si una cláusula resulta inválida, las demás siguen vigentes.</span></li>
                <li className={LI}><Dot /><span><B>Acuerdo íntegro:</B> estos Términos y la <Link href="/privacidad" className="font-bold text-[var(--accent)] hover:underline">Política de Privacidad</Link> constituyen el acuerdo completo entre tú y Buleje.</span></li>
                <li className={LI}><Dot /><span><B>No renuncia:</B> que no ejerzamos un derecho no implica que renunciemos a él.</span></li>
                <li className={LI}><Dot /><span><B>Comunicaciones electrónicas:</B> aceptas recibir avisos y comunicaciones por medios electrónicos (WhatsApp, correo, notificaciones).</span></li>
              </ul>
              <p>
                Para consultas sobre estos Términos escríbenos por WhatsApp al{" "}
                <a href={`tel:${LEGAL.telefono.replace(/\s/g, "")}`} className="font-bold text-[var(--accent)] hover:underline">
                  {LEGAL.telefono}
                </a>{" "}
                o revisa el{" "}
                <Link href="/libro-de-reclamaciones" className="font-bold text-[var(--accent)] hover:underline">
                  Libro de Reclamaciones
                </Link>
                .
              </p>
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}
