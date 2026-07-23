import type { ApexOptions } from 'apexcharts';

export const CHART_ANIMATION: NonNullable<ApexOptions['chart']>['animations'] = {
  enabled: true,
  speed: 900,
  animateGradually: { enabled: true, delay: 120 },
  dynamicAnimation: { enabled: true, speed: 500 },
};

export const GRID: ApexOptions['grid'] = {
  show: true,
  borderColor: '#e2e8f0',
  strokeDashArray: 4,
};

export const AXIS_LABELS = { style: { colors: '#64748b', fontSize: '12px' } };

type ChartType = NonNullable<NonNullable<ApexOptions['chart']>['type']>;

export function chartBase(height: number, type: ChartType): ApexOptions['chart'] {
  return {
    height,
    width: '100%',
    type,
    parentHeightOffset: 0,
    toolbar: { show: false },
    fontFamily: 'inherit',
    animations: CHART_ANIMATION,
  };
}

export function countLabel(enabled = true): ApexOptions['dataLabels'] {
  return {
    enabled,
    style: { fontSize: '11px', fontWeight: 700, colors: ['#0A1428'] },
    background: { enabled: true, foreColor: '#0A1428', borderRadius: 4, padding: 4, opacity: 0.92 },
    formatter: (val: number) => (val > 0 ? String(Math.round(val)) : ''),
  };
}

export function currencyLabel(sparseEvery = 1): ApexOptions['dataLabels'] {
  return {
    enabled: true,
    offsetY: -8,
    style: { fontSize: '10px', fontWeight: 700, colors: ['#065f46'] },
    background: { enabled: true, foreColor: '#065f46', borderRadius: 4, padding: 4, opacity: 0.9 },
    formatter: (val: number, opts) => {
      const index = opts?.dataPointIndex ?? 0;
      if (sparseEvery > 1 && index % sparseEvery !== 0) return '';
      return val > 0 ? `GHS ${Number(val).toFixed(0)}` : '';
    },
  };
}

export function pieCountLabel(): ApexOptions['dataLabels'] {
  return {
    enabled: true,
    dropShadow: { enabled: false },
    style: { fontSize: '11px', fontWeight: 700 },
    formatter: (val: number, opts) => {
      const count = opts?.w.globals.series[opts.seriesIndex] ?? 0;
      return `${count}\n(${Math.round(val)}%)`;
    },
  };
}

export function donutAmountLabel(): ApexOptions['dataLabels'] {
  return {
    enabled: true,
    style: { fontSize: '10px', fontWeight: 700 },
    formatter: (val: number, opts) => {
      const amount = opts?.w.globals.series[opts.seriesIndex] ?? 0;
      return `GHS ${Number(amount).toFixed(0)}\n${Math.round(val)}%`;
    },
  };
}

export function polarCountLabel(): ApexOptions['dataLabels'] {
  return {
    enabled: true,
    style: { fontSize: '11px', fontWeight: 700 },
    formatter: (val: number, opts) => {
      const count = opts?.w.globals.series[opts.seriesIndex] ?? 0;
      return `${count} (${Math.round(val)}%)`;
    },
  };
}

export function treemapCountLabel(): ApexOptions['dataLabels'] {
  return {
    enabled: true,
    style: { fontSize: '12px', fontWeight: 700, colors: ['#fff'] },
    formatter: (_val: number, opts) => {
      const series = opts?.w.config.series?.[opts.seriesIndex];
      const point =
        series && typeof series === 'object' && 'data' in series
          ? (series.data as Array<{ x: string; y: number }>)[opts.dataPointIndex]
          : null;
      return point ? `${point.x}\n${point.y}` : '';
    },
  };
}
