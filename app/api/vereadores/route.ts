import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await prisma.vereador.findMany({ orderBy: { nome: "asc" } });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = await req.json();
  const data = await prisma.vereador.create({ data: body });
  return NextResponse.json(data);
}
