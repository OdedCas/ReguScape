import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  // TODO: Implement GovMap search integration
  return NextResponse.json({
    message: 'Search API - not implemented yet',
    query,
  });
}
