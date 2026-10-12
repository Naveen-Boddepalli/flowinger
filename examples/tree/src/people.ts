// The data: an organisation as a flat list, each person naming their manager. A tree is whatever has one
// root and one parent per node — which is what both the layout (d3-hierarchy) and `useCollapsibleTree`
// (which follows edges from source to target) expect.
export interface Person {
  id: string;
  name: string;
  role: string;
  /** The manager's `id`; null for the one person at the top. */
  manager: string | null;
}

export const people: Person[] = [
  { id: 'ceo', name: 'Maya Chen', role: 'Chief Executive', manager: null },

  { id: 'cto', name: 'Omar Haddad', role: 'Chief Technology Officer', manager: 'ceo' },
  { id: 'platform', name: 'Priya Nair', role: 'Head of Platform', manager: 'cto' },
  { id: 'sre', name: 'Tomás Silva', role: 'Site Reliability', manager: 'platform' },
  { id: 'infra', name: 'Lena Fischer', role: 'Infrastructure', manager: 'platform' },
  { id: 'data', name: 'Kofi Mensah', role: 'Data Engineering', manager: 'platform' },
  { id: 'product', name: 'Jonas Weber', role: 'Head of Product Engineering', manager: 'cto' },
  { id: 'web', name: 'Inês Costa', role: 'Web', manager: 'product' },
  { id: 'mobile', name: 'Yuki Tanaka', role: 'Mobile', manager: 'product' },
  { id: 'qa', name: 'Sam Okafor', role: 'Quality', manager: 'product' },

  { id: 'cfo', name: 'Elena Rossi', role: 'Chief Financial Officer', manager: 'ceo' },
  { id: 'controller', name: 'Ravi Patel', role: 'Controller', manager: 'cfo' },
  { id: 'payables', name: 'Mia Johansson', role: 'Payables', manager: 'controller' },
  { id: 'receivables', name: 'Noor Aziz', role: 'Receivables', manager: 'controller' },
  { id: 'fpa', name: 'Chen Wei', role: 'Planning & Analysis', manager: 'cfo' },

  { id: 'coo', name: 'Dana Whitfield', role: 'Chief Operating Officer', manager: 'ceo' },
  { id: 'ops', name: 'Hugo Martin', role: 'Head of Operations', manager: 'coo' },
  { id: 'support', name: 'Amara Obi', role: 'Support', manager: 'ops' },
  { id: 'logistics', name: 'Pavel Novak', role: 'Logistics', manager: 'ops' },
  { id: 'people', name: 'Sofia Lindqvist', role: 'Head of People', manager: 'coo' },
  { id: 'recruiting', name: 'Ben Carter', role: 'Recruiting', manager: 'people' },
  { id: 'learning', name: 'Aiko Mori', role: 'Learning', manager: 'people' },
];
