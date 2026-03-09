export type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  image: string;
  unit: string;
  badge?: string;
};

export type Category = {
  id: string;
  label: string;
  emoji: string;
};

export const categories: Category[] = [
  { id: "todos", label: "Todos", emoji: "🛒" },
  { id: "frutas-verduras", label: "Frutas y Verduras", emoji: "🥬" },
  { id: "abarrotes", label: "Abarrotes", emoji: "🏪" },
  { id: "carnes", label: "Carnes", emoji: "🥩" },
  { id: "lacteos", label: "Lácteos", emoji: "🧀" },
  { id: "bebidas", label: "Bebidas", emoji: "🥤" },
  { id: "limpieza", label: "Limpieza", emoji: "🧹" },
];

export const products: Product[] = [
  // Frutas y Verduras
  {
    id: 1,
    name: "Tomates Frescos",
    category: "frutas-verduras",
    price: 3.5,
    unit: "kg",
    image: "https://images.unsplash.com/photo-1546094096-0df4bcaaa337?w=400&h=400&fit=crop&q=80",
    badge: "Popular",
  },
  {
    id: 2,
    name: "Plátanos de Seda",
    category: "frutas-verduras",
    price: 2.5,
    unit: "kg",
    image: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&h=400&fit=crop&q=80",
    badge: "Fresco",
  },
  {
    id: 3,
    name: "Papas Nativas",
    category: "frutas-verduras",
    price: 4.0,
    unit: "kg",
    image: "https://images.unsplash.com/photo-1590165482129-1b8b27698780?w=400&h=400&fit=crop&q=80",
  },
  {
    id: 4,
    name: "Cebollas Rojas",
    category: "frutas-verduras",
    price: 3.0,
    unit: "kg",
    image: "https://images.unsplash.com/photo-1508747703725-719777637510?w=400&h=400&fit=crop&q=80",
  },
  // Abarrotes
  {
    id: 5,
    name: "Arroz Extra 5kg",
    category: "abarrotes",
    price: 22.5,
    unit: "bolsa",
    image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop&q=80",
    badge: "Oferta",
  },
  {
    id: 6,
    name: "Azúcar Rubia 1kg",
    category: "abarrotes",
    price: 4.5,
    unit: "bolsa",
    image: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400&h=400&fit=crop&q=80",
  },
  {
    id: 7,
    name: "Aceite Vegetal 1L",
    category: "abarrotes",
    price: 9.9,
    unit: "botella",
    image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&h=400&fit=crop&q=80",
  },
  {
    id: 8,
    name: "Fideos Spaghetti",
    category: "abarrotes",
    price: 3.8,
    unit: "paquete",
    image: "https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=400&h=400&fit=crop&q=80",
  },
  // Carnes
  {
    id: 9,
    name: "Pollo Entero",
    category: "carnes",
    price: 12.0,
    unit: "kg",
    image: "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=400&h=400&fit=crop&q=80",
    badge: "Popular",
  },
  {
    id: 10,
    name: "Carne de Res",
    category: "carnes",
    price: 28.0,
    unit: "kg",
    image: "https://images.unsplash.com/photo-1588347818036-558601350947?w=400&h=400&fit=crop&q=80",
    badge: "Premium",
  },
  {
    id: 11,
    name: "Chorizo Artesanal",
    category: "carnes",
    price: 15.0,
    unit: "kg",
    image: "https://images.unsplash.com/photo-1558030006-450675393462?w=400&h=400&fit=crop&q=80",
  },
  {
    id: 12,
    name: "Jamón del País",
    category: "carnes",
    price: 18.0,
    unit: "kg",
    image: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=400&h=400&fit=crop&q=80",
  },
  // Lácteos
  {
    id: 13,
    name: "Leche Entera 1L",
    category: "lacteos",
    price: 5.5,
    unit: "caja",
    image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&h=400&fit=crop&q=80",
  },
  {
    id: 14,
    name: "Queso Fresco",
    category: "lacteos",
    price: 14.0,
    unit: "kg",
    image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400&h=400&fit=crop&q=80",
    badge: "Fresco",
  },
  {
    id: 15,
    name: "Yogurt Natural 1L",
    category: "lacteos",
    price: 7.5,
    unit: "litro",
    image: "https://images.unsplash.com/photo-1571212515416-fef01fc43637?w=400&h=400&fit=crop&q=80",
  },
  {
    id: 16,
    name: "Mantequilla 200g",
    category: "lacteos",
    price: 6.0,
    unit: "barra",
    image: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400&h=400&fit=crop&q=80",
  },
  // Bebidas
  {
    id: 17,
    name: "Agua Mineral 2.5L",
    category: "bebidas",
    price: 3.5,
    unit: "botella",
    image: "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&h=400&fit=crop&q=80",
  },
  {
    id: 18,
    name: "Gaseosa 1.5L",
    category: "bebidas",
    price: 8.0,
    unit: "botella",
    image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&h=400&fit=crop&q=80",
    badge: "Popular",
  },
  {
    id: 19,
    name: "Jugo de Naranja 1L",
    category: "bebidas",
    price: 6.5,
    unit: "caja",
    image: "https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&h=400&fit=crop&q=80",
  },
  {
    id: 20,
    name: "Cerveza Pack x6",
    category: "bebidas",
    price: 18.0,
    unit: "pack",
    image: "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400&h=400&fit=crop&q=80",
  },
  // Limpieza
  {
    id: 21,
    name: "Detergente 2kg",
    category: "limpieza",
    price: 15.0,
    unit: "bolsa",
    image: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400&h=400&fit=crop&q=80",
    badge: "Oferta",
  },
  {
    id: 22,
    name: "Lejía 1L",
    category: "limpieza",
    price: 4.5,
    unit: "botella",
    image: "https://images.unsplash.com/photo-1585751119414-ef2636f8aede?w=400&h=400&fit=crop&q=80",
  },
  {
    id: 23,
    name: "Jabón en Barra",
    category: "limpieza",
    price: 3.0,
    unit: "unidad",
    image: "https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=400&h=400&fit=crop&q=80",
  },
  {
    id: 24,
    name: "Papel Higiénico x4",
    category: "limpieza",
    price: 8.0,
    unit: "paquete",
    image: "https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=400&h=400&fit=crop&q=80",
  },
];
