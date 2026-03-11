"use client";

import {
  Store,
  MapPin,
  Phone,
  Clock,
  MessageCircle,
  Truck,
  ShieldCheck,
  Heart,
  Star,
} from "lucide-react";

const perks = [
  { icon: Truck, label: "Delivery Gratis en Pucallpa", color: "#818cf8" },
  { icon: MessageCircle, label: "Pedidos por WhatsApp", color: "#25D366" },
  { icon: Clock, label: "Lun - Sáb: 7am - 9pm", color: "#f4a261" },
  { icon: ShieldCheck, label: "Pago con Yape o Efectivo", color: "#60a5fa" },
];

const quickLinks = [
  { href: "/", label: "Inicio" },
  { href: "/tienda", label: "Tienda" },
  { href: "/#beneficios", label: "Beneficios" },
  { href: "/#preguntas", label: "Preguntas Frecuentes" },
  { href: "/#contacto", label: "Contacto" },
];

const categoryLinks = [
  { href: "/tienda", label: "Abarrotes" },
  { href: "/tienda", label: "Bebidas" },
  { href: "/tienda", label: "Golosinas y Snacks" },
  { href: "/tienda", label: "Carne y Pollo" },
  { href: "/tienda", label: "Productos de Limpieza" },
  { href: "/tienda", label: "Artículos para el Hogar" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer style={{ background: "linear-gradient(180deg, #4f46e5 0%, #3730a3 100%)" }} className="text-white">
      {/* Perks Bar */}
      <div className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {perks.map((perk) => (
              <div
                key={perk.label}
                className="flex items-center gap-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: perk.color + "22" }}>
                  <perk.icon className="h-4.5 w-4.5" style={{ color: perk.color }} />
                </div>
                <span className="text-sm font-medium text-white/85">{perk.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3 mb-5">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl"
                style={{
                  background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #3730a3 100%)",
                  boxShadow: "0 4px 12px rgba(99,102,241,0.35)",
                }}
              >
                <Store className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-extrabold block leading-tight">Bodega San Martín</span>
                <span className="text-[11px] text-white/40 font-medium tracking-wide">Pucallpa · Ucayali</span>
              </div>
            </div>
            {/* Stars */}
            <div className="flex items-center gap-1.5 mb-3">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              ))}
              <span className="text-white/60 text-xs ml-1.5">4.8 / 5 · +800 clientes</span>
            </div>
            <p className="text-white/50 text-sm leading-relaxed mb-5">
              Tienda virtual de abarrotes en Pucallpa. Delivery rápido, pago con Yape o efectivo.
            </p>
            {/* Social + WhatsApp */}
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href="https://wa.me/51916409675?text=Hola%2C%20quiero%20hacer%20un%20pedido"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all hover:scale-[1.03] active:scale-[0.97] shadow-lg shadow-[#25D366]/20"
                style={{ background: "#25D366" }}
                aria-label="WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-white/8 hover:bg-white/15 transition-colors text-white/80 text-xs font-semibold border border-white/8"
                aria-label="Facebook"
              >
                f/ Facebook
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-white/8 hover:bg-white/15 transition-colors text-white/80 text-xs font-semibold border border-white/8"
                aria-label="Instagram"
              >
                📸 Instagram
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <nav aria-label="Navegación rápida">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4">
              Navegación
            </h3>
            <ul className="space-y-2.5">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-white/70 hover:text-secondary transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Categories */}
          <nav aria-label="Categorías de productos">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4">
              Categorías
            </h3>
            <ul className="space-y-2.5">
              {categoryLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-white/70 hover:text-secondary transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact Info */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4">
              Contacto
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
                <span className="text-sm text-white/70">
                  Jr. Ucayali 450, Pucallpa, Ucayali
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-secondary shrink-0" />
                <a
                  href="tel:+51916409675"
                  className="text-sm text-white/70 hover:text-secondary transition-colors"
                >
                  916 409 675
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Clock className="h-4 w-4 text-secondary shrink-0" />
                <span className="text-sm text-white/70">
                  Lun - Sáb: 7am - 9pm
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Trust badges + copyright */}
      <div className="border-t border-white/8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-white/55 bg-white/5 border border-white/8">
                <ShieldCheck className="h-3 w-3 text-green-400" />
                Sitio Seguro
              </div>
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-white/55 bg-white/5 border border-white/8">
                <span className="font-bold text-white/70">Yape</span>
                Aceptado
              </div>
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-white/55 bg-white/5 border border-white/8">
                💵 Efectivo OK
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-white/35">
              © {year} Bodega San Martín · Hecho con <Heart className="h-3 w-3 text-red-400 fill-red-400" aria-hidden="true" /> en Pucallpa
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
