import { NextResponse } from 'next/server';
export async function GET(request) {
  const name = new URL(request.url).searchParams.get('name') ?? 'world';
  return NextResponse.json({ message: `Hello, ${name}` });
}
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body?.name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  return NextResponse.json({ created: body.name }, { status: 201 });
}
