// The data: one query plan, as a tree. Flowinger does not lay a graph out — it draws what it is given —
// so the interesting part of this example is `layout.ts`, which turns this into positions.

export interface PlanItem {
  id: string;
  label: string;
  detail: string;
}

export interface PlanLink {
  source: string;
  target: string;
}

export const items: PlanItem[] = [
  { id: 'limit', label: 'Limit', detail: '100 rows' },
  { id: 'sort', label: 'Sort', detail: 'total DESC' },
  { id: 'agg', label: 'HashAggregate', detail: 'by customer_id' },
  { id: 'join', label: 'Hash Join', detail: 'o.customer_id = c.id' },
  { id: 'scan-o', label: 'Seq Scan', detail: 'orders' },
  { id: 'filter', label: 'Filter', detail: "region = 'EU'" },
  { id: 'scan-c', label: 'Index Scan', detail: 'customers' },
  { id: 'project', label: 'Project', detail: 'id, name, region' },
  { id: 'scan-p', label: 'Seq Scan', detail: 'promotions' },
];

/** Parent → child. Every node has one parent, so this is a tree. */
export const treeLinks: PlanLink[] = [
  { source: 'limit', target: 'sort' },
  { source: 'sort', target: 'agg' },
  { source: 'agg', target: 'join' },
  { source: 'join', target: 'scan-o' },
  { source: 'join', target: 'filter' },
  { source: 'filter', target: 'scan-c' },
  { source: 'agg', target: 'project' },
  { source: 'project', target: 'scan-p' },
];

/** One more link: `scan-c` is also read by `project`, so a node now has two parents — a DAG, not a tree. */
export const sharedLink: PlanLink = { source: 'project', target: 'scan-c' };
