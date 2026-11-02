export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Palette: browns and greens from the brand swatch, extended with tints for many categories.
export const COLORS = ['#5D4037','#A5D6A7','#8D6E63','#3E2723','#66BB6A','#C8E6C9','#A1887F','#2E7D32','#D7CCC8','#4E342E','#81C784','#BCAAA4'];
export const EVENT_TYPES = [
  { name: 'Personal', color: '#7E57C2' }, { name: 'Work', color: '#1E88E5' }, { name: 'Family', color: '#43A047' },
  { name: 'Appointment', color: '#F9A825' }, { name: 'Birthday', color: '#EC407A' }, { name: 'Payment', color: '#E53935' },
  { name: 'Travel', color: '#00ACC1' }, { name: 'Other', color: '#8D6E63' }];
export const eventColor = (t: string) => EVENT_TYPES.find((x) => x.name === t)?.color || '#8D6E63';
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fmt = (n: number) => 'RM ' + (n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const errMsg = (e: any) => e?.error?.error || 'Something went wrong. Try again.';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
// Downscales to fit the server's 150 KB cap; WebP keeps QR edges sharp at small sizes.
export async function shrinkImage(file: File, maxBytes = 140 * 1024): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    for (const max of [480, 320, 220]) {
      const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.85));
      if (blob && IMAGE_TYPES.includes(blob.type) && blob.size <= maxBytes) return blob;
    }
  } finally { bmp.close(); }
  throw new Error('image too large');
}
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
export function typeIcon(t: string): string {
  const s = (t || '').toLowerCase();
  const map: [RegExp, string][] = [[/elec|power/, 'zap'], [/water/, 'droplet'], [/internet|wifi|fibre/, 'wifi'], [/student|study|tuition/, 'cap'],
    [/loan|mortgage/, 'landmark'], [/rent|house|home/, 'home'], [/shopee|shop|paylater/, 'bag'], [/parent|family/, 'users'],
    [/insur|takaful/, 'receipt'], [/netflix|spotify|subscri|youtube|disney/, 'repeat'], [/salary|income|bonus|freelance|allowance|commission/, 'banknote'], [/phone|mobile/, 'phone'], [/car|road|petrol|toll/, 'car'], [/install/, 'credit-card'], [/saving/, 'wallet']];
  return map.find(([r]) => r.test(s))?.[1] || 'tag';
}
