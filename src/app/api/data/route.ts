import { NextResponse } from 'next/server';
import { loadProcessedData, describeDbError } from '@/lib/db/store';

export async function GET() {
  try {
    const data = await loadProcessedData();
    return NextResponse.json(data);
  } catch (err) {
    // Without this the browser receives an empty 500 and the cause — bad
    // configuration, an unreachable database, a missing table — is invisible.
    const error = describeDbError(err);
    console.error('[api/data] failed:', error);
    return NextResponse.json({ error }, { status: 500 });
  }
}
