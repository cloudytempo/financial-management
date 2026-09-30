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
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
export function typeIcon(t: string): string {
  const s = (t || '').toLowerCase();
  const map: [RegExp, string][] = [[/elec|power/, 'zap'], [/water/, 'droplet'], [/internet|wifi|fibre/, 'wifi'], [/student|study|tuition/, 'cap'],
    [/loan|mortgage/, 'landmark'], [/rent|house|home/, 'home'], [/shopee|shop|paylater/, 'bag'], [/parent|family/, 'users'],
    [/insur|takaful/, 'receipt'], [/netflix|spotify|subscri|youtube|disney/, 'repeat'], [/salary|income|bonus|freelance|allowance|commission/, 'banknote'], [/phone|mobile/, 'phone'], [/car|road|petrol|toll/, 'car'], [/install/, 'credit-card'], [/saving/, 'wallet']];
  return map.find(([r]) => r.test(s))?.[1] || 'tag';
}
