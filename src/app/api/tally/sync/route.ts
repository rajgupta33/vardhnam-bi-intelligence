import { NextResponse } from 'next/server';
import { runTallySync } from '@/lib/tally/sync';

export async function POST() {
  const result = await runTallySync();
  return NextResponse.json(result, { status: result.success ? 200 : 502 });
}
