'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import type { Props as ApexChartProps } from 'react-apexcharts';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

type RemountingChartProps = {
  remountKey: string;
  options: ApexOptions;
  series: ApexChartProps['series'];
  type: NonNullable<ApexChartProps['type']>;
  height?: number | string;
};

export default function RemountingChart({ remountKey, options, series, type, height }: RemountingChartProps) {
  return (
    <div key={remountKey} className="w-100">
      <ApexChart options={options} series={series} type={type} height={height} width="100%" />
    </div>
  );
}

export function PeriodToggle({
  value,
  onChange,
}: {
  value: 'week' | 'month';
  onChange: (next: 'week' | 'month') => void;
}) {
  return (
    <div className="premium-period-toggle btn-group btn-group-sm" role="group" aria-label="Chart period">
      <button
        type="button"
        className={`btn btn-sm ${value === 'week' ? 'btn-primary' : 'btn-outline-secondary'}`}
        onClick={() => onChange('week')}
      >
        Last 7 Days
      </button>
      <button
        type="button"
        className={`btn btn-sm ${value === 'month' ? 'btn-primary' : 'btn-outline-secondary'}`}
        onClick={() => onChange('month')}
      >
        Last 30 Days
      </button>
    </div>
  );
}
