import { NextResponse } from 'next/server';

export function apiOk<T>(data: T, message = '') {
  return NextResponse.json({ success: true, data, message });
}

export function apiFail(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}
