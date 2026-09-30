export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Palette: browns and greens from the brand swatch, extended with tints for many categories.
export const COLORS = ['#5D4037','#A5D6A7','#8D6E63','#3E2723','#66BB6A','#C8E6C9','#A1887F','#2E7D32','#D7CCC8','#4E342E','#81C784','#BCAAA4'];
export const fmt = (n: number) => 'RM ' + (n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const errMsg = (e: any) => e?.error?.error || 'Something went wrong. Try again.';
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
export function typeIcon(t: string): string {
  const s = (t || '').toLowerCase();
  const map: [RegExp, string][] = [[/elec|power/, 'zap'], [/water/, 'droplet'], [/internet|wifi|fibre/, 'wifi'], [/student|study|tuition/, 'cap'],
    [/loan|mortgage/, 'landmark'], [/rent|house|home/, 'home'], [/shopee|shop|paylater/, 'bag'], [/parent|family/, 'users'],
    [/phone|mobile/, 'phone'], [/car|road|petrol|toll/, 'car'], [/install/, 'credit-card'], [/saving/, 'wallet']];
  return map.find(([r]) => r.test(s))?.[1] || 'tag';
}
