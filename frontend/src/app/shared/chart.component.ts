import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
Chart.register(...registerables);
Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
Chart.defaults.color = '#7A5F54';
Chart.defaults.borderColor = '#EFE8E4';
Chart.defaults.plugins.legend.position = 'bottom';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.boxWidth = 8;
(Chart.defaults.elements.bar as any).borderRadius = 6;
(Chart.defaults.datasets as any).doughnut = { cutout: '66%', borderWidth: 2, borderColor: '#fff' };
Chart.defaults.font.family = "'Plus Jakarta Sans Variable', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = '#7A6862';
Chart.defaults.borderColor = '#F0EAE6';
Chart.defaults.plugins.legend.position = 'bottom';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.boxWidth = 8;
(Chart.defaults.elements.bar as any).borderRadius = 6;
Chart.defaults.elements.bar.borderSkipped = false;
(Chart.defaults.elements.arc as any).borderWidth = 2;
(Chart.defaults.elements.arc as any).borderColor = '#fff';
Chart.defaults.elements.line.borderWidth = 2.5;
Chart.defaults.elements.point.radius = 2;

@Component({ selector: 'app-chart', standalone: true, template: `<div class="chart-box"><canvas #c></canvas></div>` })
export class ChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() config!: ChartConfiguration;
  @ViewChild('c') canvas!: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;
  ngAfterViewInit() { this.render(); }
  ngOnChanges() { if (this.canvas) this.render(); }
  private render() {
    this.chart?.destroy();
    if (!this.config) return;
    this.chart = new Chart(this.canvas.nativeElement, {
      ...this.config, options: { responsive: true, maintainAspectRatio: false, ...(this.config.options as any) },
    } as any);
  }
  ngOnDestroy() { this.chart?.destroy(); }
}
