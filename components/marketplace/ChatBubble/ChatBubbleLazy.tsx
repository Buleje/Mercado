"use client";

/**
 * ChatBubbleLazy — wrapper client-only que carga ChatBubble en background.
 *
 * Brandon 2026-05-21 perf v6: ChatBubble es 496 LOC / ~20KB del bundle inicial
 * del storefront. Es un floating widget que el usuario activa con click — NO
 * afecta LCP, SEO, ni el render del catálogo. Bajamos a `dynamic({ ssr: false })`
 * para sacarlo del JS crítico. El consumer (page.tsx, server component) usa este
 * wrapper en lugar del componente directo.
 *
 * El delay perceptual al primer click es de ~50ms en cache miss; en hover/idle
 * los chunks suelen pre-warm.
 */

import dynamic from "next/dynamic";

const ChatBubble = dynamic(() => import("./index"), {
  ssr: false,
  loading: () => null,
});

type Props = {
  storeSlug: string;
  storeName: string;
};

export default function ChatBubbleLazy(props: Props) {
  return <ChatBubble {...props} />;
}
