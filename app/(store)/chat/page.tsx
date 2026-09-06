import type { Metadata } from "next";
import dynamic from "next/dynamic";

/**
 * /chat — Brandon 2026-06-12: el chat del cliente como RUTA REAL (estilo
 * Messenger). El bottom-nav navega acá en vez de abrir un overlay. ChatPageClient
 * hace el takeover full-screen (fixed inset-0) y reusa ChatConversationView.
 */

export const metadata: Metadata = {
  title: "Mensajes",
  description: "Chatea con las tiendas del marketplace.",
  robots: { index: false, follow: false },
};

const ChatPageClient = dynamic(
  () => import("@/components/marketplace/chat/ChatPageClient"),
);

export default function ChatPage() {
  return <ChatPageClient />;
}
