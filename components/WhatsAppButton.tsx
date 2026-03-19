"use client";

import { useCustomer } from "@/contexts/customer-context";

const WA_NUMBER = "51916409675";
const WA_MESSAGE = "Hola, quiero hacer un pedido";

export default function WhatsAppButton() {
  const { customer } = useCustomer();

  // Hide when customer is logged in — they have the in-app LiveChatWidget instead
  if (customer?.phone) return null;

  const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(WA_MESSAGE)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chatea por WhatsApp"
      className="fixed bottom-28 right-4 z-40 flex items-center justify-center h-14 w-14 rounded-full bg-[#25D366] text-white shadow-lg hover:scale-110 active:scale-95 transition-all duration-200 animate-[fadeUp_0.3s_ease-out]"
    >
      <svg viewBox="0 0 32 32" fill="currentColor" className="h-7 w-7">
        <path d="M16.004 2.002c-7.731 0-14.002 6.271-14.002 14.002 0 2.468.655 4.876 1.898 6.993L2 30l7.193-1.883A13.94 13.94 0 0 0 16.004 30c7.731 0 14.002-6.271 14.002-14.002S23.735 2.002 16.004 2.002Zm0 25.62a11.56 11.56 0 0 1-5.903-1.616l-.424-.251-4.387 1.15 1.17-4.28-.276-.438a11.537 11.537 0 0 1-1.772-6.183c0-6.389 5.2-11.59 11.592-11.59 6.389 0 11.59 5.2 11.59 11.59 0 6.392-5.2 11.618-11.59 11.618Zm6.36-8.685c-.348-.175-2.062-1.018-2.382-1.134-.32-.116-.553-.175-.786.175-.233.348-.902 1.134-1.106 1.368-.204.233-.407.262-.756.087-.348-.175-1.47-.542-2.8-1.727-1.035-.923-1.734-2.063-1.937-2.41-.204-.349-.022-.537.153-.71.157-.157.348-.407.523-.612.175-.204.233-.348.348-.581.116-.233.058-.437-.029-.612-.087-.175-.786-1.895-1.077-2.594-.284-.681-.572-.59-.786-.6l-.67-.012c-.233 0-.612.087-.932.437-.32.349-1.222 1.194-1.222 2.912 0 1.718 1.251 3.378 1.426 3.611.175.233 2.462 3.757 5.963 5.267.834.36 1.484.574 1.991.735.837.265 1.598.228 2.2.138.671-.1 2.062-.843 2.353-1.657.29-.815.29-1.514.204-1.66-.087-.146-.32-.233-.67-.408Z" />
      </svg>
    </a>
  );
}
