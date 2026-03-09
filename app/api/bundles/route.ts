import { NextResponse } from "next/server";
import { BundlesDB } from "@/lib/jsondb";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("active") === "true";
  return NextResponse.json(activeOnly ? await BundlesDB.getActive() : await BundlesDB.getAll());
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name || !body.price || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "name, price, and items required" }, { status: 400 });
  }
  const bundle = await BundlesDB.add({
    name: body.name,
    description: body.description,
    price: Number(body.price),
    image: body.image,
    items: body.items.map((i: { productId: number; quantity: number }) => ({
      productId: Number(i.productId),
      quantity: Number(i.quantity) || 1,
    })),
  });
  return NextResponse.json(bundle, { status: 201 });
}
