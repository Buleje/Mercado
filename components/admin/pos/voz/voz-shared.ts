

/** Tipos y constantes del dictado por voz del POS (partido de POSVoiceInput, 09-10). */

export interface VoiceItem {
  productName: string;
  quantity: number;
  matchedProductId?: number;
  confidence: number;
}

export interface ClarificationInfo {
  question: string;
  options: string[];
}

export interface POSVoiceInputProps {
  /** `stock` habilita avisar en el acto cuando no alcanza para lo dictado. */
  products: { id: number; name: string; price: number; stock?: number | null }[];
  onAddToCart: (productId: number, quantity?: number) => void;
  onHighlightProduct?: (productId: number | null) => void;
}

export const QUICK_PROMPTS = [
  "2 leches",
  "3 arroces y 1 aceite",
  "5 panes",
  "1 coca cola grande",
];
