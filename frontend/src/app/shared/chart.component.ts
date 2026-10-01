import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, effect, inject } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { Theme } from '../core/theme.service';
Chart.register(...registerables);
Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
Chart.defaults.plugins.legend.position = 'bottom';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.boxWidth = 8;
(Chart.defaults.elements.bar as any).borderRadius = 6;
// Merge into the existing defaults. Replacing `datasets.doughnut` wholesale deleted the controller's own settings
// (including its element type) and made every doughnut chart throw "undefined is not a registered element".
Chart.defaults.set('datasets.doughnut', { cutout: '66%' });
Chart.defaults.set('elements.arc', { borderWidth: 2, borderColor: '#fff' });

// Charts are built with the Earth palette; when the Sky theme is active every colour is swapped here in one pass.
const SKY: Record<string, string> = {
  '#5D4037': '#072AC8', '#A5D6A7': '#FFC600', '#8D6E63': '#1E96FC', '#3E2723': '#061F9E', '#C8E6C9': '#A2D6F9', '#A1887F': '#4F6FE0',
  '#2E7D32': '#E0A800', '#D7CCC8': '#A2D6F9', '#4E342E': '#3A4BA8', '#81C784': '#FFE066', '#BCAAA4': '#7FB8F0', 'RGBA(165,214,167,.35)': 'rgba(30,150,252,.22)',
};
// True when there is nothing to draw (no datasets, or every value is empty/zero).
function isEmpty(cfg: any) {
  const ds = cfg?.data?.datasets || [];
  return !ds.length || ds.every((d: any) => !(d.data || []).some((v: any) => v != null && Number(v) !== 0));
}
function themed(cfg: any, sky: boolean) {
  if (!sky) return cfg;
  return JSON.parse(JSON.stringify(cfg).replace(/#[0-9A-Fa-f]{6}|rgba\(165,214,167,\.35\)/g, (m) => SKY[m.toUpperCase()] ?? m));
}

@Component({ selector: 'app-chart', standalone: true, template: `<div class="chart-box"><canvas #c [style.display]="blank ? 'none' : 'block'"></canvas>@if (blank) { <div class="chart-empty">{{ emptyText }}</div> }</div>` })
export class ChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() config!: ChartConfiguration;
  @Input() emptyText = 'No data to chart yet.';
  get blank() { return isEmpty(this.config); }
  @ViewChild('c') canvas!: ElementRef<HTMLCanvasElement>;
  private theme = inject(Theme);
  private chart?: Chart;
  constructor() { effect(() => { this.theme.name(); if (this.canvas) this.render(); }); }
  ngAfterViewInit() { this.render(); }
  ngOnChanges() { if (this.canvas) this.render(); }
  private render() {
    const canvas = this.canvas?.nativeElement;
    if (!canvas) return;
    Chart.getChart(canvas)?.destroy(); // also clears a half-built chart left behind by an earlier failed render
    this.chart = undefined;
    if (!this.config || this.blank) return;
    const sky = this.theme.name() === 'sky';
    Chart.defaults.color = sky ? '#4A5B8C' : '#7A5F54';
    Chart.defaults.borderColor = sky ? '#E2EDF8' : '#EFE8E4';
    const cfg = themed(this.config, sky);
    try {
      this.chart = new Chart(canvas, { ...cfg, options: { responsive: true, maintainAspectRatio: false, ...cfg.options } } as any);
    } catch (e) {
      console.error('Chart could not be drawn', e);
      Chart.getChart(canvas)?.destroy();
    }
  }
  ngOnDestroy() { this.chart?.destroy(); }
}
