const datasets = new Map();
const MAX_DATASETS = 10;

export function saveDataset(ds) {
  datasets.set(ds.id, ds);
  while (datasets.size > MAX_DATASETS) datasets.delete(datasets.keys().next().value);
  return ds;
}

export const getDataset = (id) => datasets.get(id);
