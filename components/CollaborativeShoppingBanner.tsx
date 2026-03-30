"use client";

export default function CollaborativeShoppingBanner() {
  return (
    <section className="bg-gradient-to-r from-[#0f766e]/5 to-[#f97316]/5 border-b border-gray-100 dark:border-card-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">&#128101;</span>
            <div>
              <p className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-foreground">
                Compra con tus vecinos y ahorren en delivery
              </p>
              <p className="text-xs text-gray-500 dark:text-muted mt-0.5">
                Junten sus pedidos en una sola lista. Si el total supera S/100, el delivery es GRATIS para todos.
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => {
                const code = "BSM-" + Math.random().toString(36).substring(2, 6).toUpperCase();
                const cartData = localStorage.getItem("cart");
                if (cartData) {
                  localStorage.setItem(`shared-cart-${code}`, cartData);
                }
                navigator.clipboard.writeText(`${window.location.origin}/tienda?lista=${code}`).then(() => {
                  alert(`Lista compartida creada!\n\nCodigo: ${code}\n\nLink copiado al portapapeles. Compartelo con tus vecinos por WhatsApp.`);
                }).catch(() => {
                  alert(`Lista compartida creada! Codigo: ${code}\nComparte este codigo con tus vecinos.`);
                });
              }}
              className="px-4 py-2.5 rounded-xl bg-[#0f766e] text-white text-xs font-bold hover:bg-[#235c42] transition-colors whitespace-nowrap"
            >
              Crear lista compartida
            </button>
            <button
              onClick={() => {
                const code = prompt("Ingresa el codigo de la lista (ej: BSM-A1B2):");
                if (!code) return;
                const sharedData = localStorage.getItem(`shared-cart-${code.toUpperCase()}`);
                if (sharedData) {
                  try {
                    const existing = JSON.parse(localStorage.getItem("cart") || "[]");
                    const shared = JSON.parse(sharedData);
                    const merged = [...existing];
                    for (const item of shared) {
                      const found = merged.find((m: { id: number }) => m.id === item.id);
                      if (found) found.quantity += item.quantity;
                      else merged.push(item);
                    }
                    localStorage.setItem("cart", JSON.stringify(merged));
                    window.dispatchEvent(new Event("storage"));
                    alert("Productos del vecino agregados a tu lista!");
                  } catch { alert("No se pudo cargar la lista."); }
                } else {
                  alert("No se encontro esa lista. Verifica el codigo.");
                }
              }}
              className="px-4 py-2.5 rounded-xl border-2 border-[#0f766e] text-[#0f766e] text-xs font-bold hover:bg-[#0f766e]/5 transition-colors whitespace-nowrap"
            >
              Unirme a lista
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
