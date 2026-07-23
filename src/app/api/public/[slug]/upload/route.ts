import { NextRequest } from 'next/server';
import { apiOk, apiFail } from '@/lib/api/json';
import { requirePublicTenant } from '@/lib/public/require-public-tenant';
import { getSession } from '@/lib/tenant/session';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const resolved = await requirePublicTenant(slug);
  if ('error' in resolved) return resolved.error;

  const session = await getSession();
  if (!session || session.type !== 'guest' || session.companySlug !== slug) {
    return apiFail('Sign in to upload documents.', 401);
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return apiFail('No file uploaded.');

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) return apiFail('File must be 5MB or smaller.');

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (file.type && !allowed.includes(file.type)) {
      return apiFail('Only JPG, PNG, WebP, or PDF files are allowed.');
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', slug);
    await mkdir(uploadDir, { recursive: true });

    const ext = path.extname(file.name) || '.jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filePath = path.join(uploadDir, filename);

    await writeFile(filePath, buffer);

    return apiOk({
      url: `/uploads/${slug}/${filename}`,
    }, 'File uploaded successfully.');
  } catch (e) {
    console.error(e);
    return apiFail('File upload failed.', 500);
  }
}
