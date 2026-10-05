import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const COLORS = ['#2d3fd0', '#b3500b', '#1e7b4f', '#7a3fb0'];
const fmt = (v) => (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : v);

export default function ChartCard({ spec }) {
  const Chart = spec.type === 'bar' ? BarChart : LineChart;
  return (
    <figure className="rounded-lg border border-line bg-white p-4">
      <figcaption className="mb-3 text-sm font-semibold">{spec.title}</figcaption>
      <div className="h-56" role="img" aria-label={`${spec.type} chart: ${spec.title}`}>
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={spec.data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e6eaf0" vertical={false} />
            <XAxis dataKey={spec.x} tick={{ fontSize: 11, fill: '#5a6578' }} tickLine={false} axisLine={{ stroke: '#d5dbe5' }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: '#5a6578' }} tickLine={false} axisLine={false} width={52} tickFormatter={fmt} />
            <Tooltip formatter={fmt} contentStyle={{ borderRadius: 8, border: '1px solid #d5dbe5', fontSize: 12 }} />
            {spec.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {spec.series.map((key, i) =>
              spec.type === 'bar' ? (
                <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
              ) : (
                <Line key={key} dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={spec.data.length <= 30} type="monotone" />
              ),
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
