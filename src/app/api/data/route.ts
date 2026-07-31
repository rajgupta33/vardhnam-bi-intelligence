import { NextResponse } from 'next/server';
import { loadProcessedData } from '@/lib/db/store';

export async function GET() {
  const data = await loadProcessedData();
  return NextResponse.json(data);
}
