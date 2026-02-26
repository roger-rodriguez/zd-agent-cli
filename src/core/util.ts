import fs from 'fs';
import path from 'path';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clean(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

export function slugify(value: string): string {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'unknown';
}

export function readJson(filePath: string, fallback: any = {}): any {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function writeJson(filePath: string, data: any): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function parseTicketIdFromUrl(pageUrl = ''): string | null {
  const m = String(pageUrl).match(/\/agent\/tickets\/(\d+)/i);
  return m ? m[1] : null;
}
