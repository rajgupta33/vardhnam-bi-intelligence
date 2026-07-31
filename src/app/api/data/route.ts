import { NextResponse } from 'next/server';
import { loadProcessedData } from '@/lib/db/sqlite';

export async function GET() {
  const data = loadProcessedData();
  return NextResponse.json(data);
}
