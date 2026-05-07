import Link from "next/link";
import { MessageCircle, Mail } from "@buleje/design-system/icons";

const FOOTER_LINKS = {
  producto: [
    { label: "Características", href: "#caracteristicas" },
    { label: "Planes", href: "#planes" },
    { label: "Registro", href: "/registro" },
    { label: "Demo", href: "/demo" },
  ],
  legal: [
    { label: "Privacidad", href: "/privacidad" },
    { label: "Términos", href: "/terminos" },
  ],
};

const WHATSAPP_NUMBER = "51999999999";
const CONTACT_EMAIL = "hola@buleje.pe";

export default function SaasFooter() {
  return (
    <footer
      className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800"
      aria-label="Pie de página"
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-10 sm:py-14">
        {/* Grid de 3 columnas */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 sm:gap-12 mb-10">
          {/* Columna Producto */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">
              Producto
            </h3>
            <ul className="space-y-2.5" role="list">
              {FOOTER_LINKS.producto.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={[
                      "text-sm text-gray-600 dark:text-gray-400",
                      "hover:text-[var(--accent)] dark:hover:text-[var(--accent)]",
                      "transition-colors duration-200",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] rounded",
                    ].join(" ")}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Columna Legal */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">
              Legal
            </h3>
            <ul className="space-y-2.5" role="list">
              {FOOTER_LINKS.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={[
                      "text-sm text-gray-600 dark:text-gray-400",
                      "hover:text-[var(--accent)] dark:hover:text-[var(--accent)]",
                      "transition-colors duration-200",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] rounded",
                    ].join(" ")}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Columna Contacto */}
          <div className="col-span-2 sm:col-span-1">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">
              Contacto
            </h3>
            <ul className="space-y-3" role="list">
              <li>
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hola%2C%20me%20interesa%20el%20sistema%20ERP`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={[
                    "inline-flex items-center gap-2.5 text-sm",
                    "text-gray-600 dark:text-gray-400",
                    "hover:text-[var(--accent)] dark:hover:text-[var(--accent)]",
                    "transition-colors duration-200",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] rounded",
                  ].join(" ")}
                  aria-label="Contactar por WhatsApp"
                >
                  <MessageCircle
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>WhatsApp</span>
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className={[
                    "inline-flex items-center gap-2.5 text-sm",
                    "text-gray-600 dark:text-gray-400",
                    "hover:text-[var(--accent)] dark:hover:text-[var(--accent)]",
                    "transition-colors duration-200",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] rounded",
                  ].join(" ")}
                  aria-label={`Enviar correo a ${CONTACT_EMAIL}`}
                >
                  <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{CONTACT_EMAIL}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center sm:text-left">
            © 2026 Buleje · Hecho con ❤️ en Pucallpa, Perú 🇵🇪
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Sistema ERP para bodegas y minimarkets
          </p>
        </div>
      </div>
    </footer>
  );
}
