import { ShoppingBasket, Wrench } from "lucide-react";

export default function MaintenancePage({ message }: { message?: string }) {
  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="mx-auto w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
          <Wrench className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 mb-3">En Mantenimiento</h1>
        <p className="text-gray-500 text-base leading-relaxed mb-6">
          {message || "Estamos mejorando la tienda. Volvemos pronto con novedades para ti."}
        </p>
        <div className="flex items-center justify-center gap-2 text-primary">
          <ShoppingBasket className="h-5 w-5" />
          <span className="font-bold text-sm">Buleje</span>
        </div>
      </div>
    </div>
  );
}
