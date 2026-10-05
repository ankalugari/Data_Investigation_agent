// OpenAI-style tool schemas, used by Groq function calling.
const fn = (name, description, properties, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

export const toolDefinitions = [
  fn(
    'run_query',
    'Run a read-only SQL SELECT against the dataset (table name: data). Use for aggregates, group-bys, filters and time series. Returns up to 50 rows.',
    { sql: { type: 'string', description: 'A single SELECT statement, e.g. SELECT region, SUM(revenue) AS rev FROM data GROUP BY region' } },
    ['sql'],
  ),
  fn(
    'describe_column',
    'Summary statistics for one column: quartiles and spread for numbers, top values for categories, range for dates.',
    { column: { type: 'string' } },
    ['column'],
  ),
  fn(
    'detect_anomalies',
    'Find unusual values. With date_column, aggregates the metric per day/week/month and flags unusual periods; without it, flags outlier rows.',
    {
      column: { type: 'string', description: 'Numeric metric column' },
      method: { type: 'string', enum: ['iqr', 'zscore'] },
      date_column: { type: 'string', description: 'Optional date column to bucket by' },
      bucket: { type: 'string', enum: ['day', 'week', 'month'] },
      aggregation: { type: 'string', enum: ['sum', 'avg', 'count'] },
    },
    ['column'],
  ),
  fn(
    'compare_periods',
    'Compare a metric between two date ranges and break the change down by one or two categorical columns, ranked by contribution to the total change. Best tool for finding root causes of a rise or drop.',
    {
      metric: { type: 'string', description: 'Numeric column' },
      date_column: { type: 'string' },
      period_a_start: { type: 'string', description: 'YYYY-MM-DD (baseline period)' },
      period_a_end: { type: 'string', description: 'YYYY-MM-DD' },
      period_b_start: { type: 'string', description: 'YYYY-MM-DD (period under investigation)' },
      period_b_end: { type: 'string', description: 'YYYY-MM-DD' },
      breakdown_by: { type: 'array', items: { type: 'string' }, description: 'One or two categorical columns' },
      aggregation: { type: 'string', enum: ['sum', 'avg', 'count'] },
    },
    ['metric', 'date_column', 'period_a_start', 'period_a_end', 'period_b_start', 'period_b_end'],
  ),
  fn(
    'correlate',
    'Pearson correlation between a numeric target column and other numeric columns.',
    { target: { type: 'string' }, columns: { type: 'array', items: { type: 'string' } } },
    ['target'],
  ),
  fn(
    'make_chart',
    'Draw a chart for the final report. The SQL result is plotted: first column is the x axis, remaining numeric columns are series. Max 60 points.',
    {
      chart_type: { type: 'string', enum: ['line', 'bar'] },
      title: { type: 'string' },
      sql: { type: 'string' },
    },
    ['chart_type', 'title', 'sql'],
  ),
  fn(
    'search_knowledge',
    'Search uploaded business documents (data dictionary, incident notes, launch calendars) and past investigations for context that explains the data.',
    { query: { type: 'string' } },
    ['query'],
  ),
];
