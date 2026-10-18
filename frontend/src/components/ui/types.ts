/** Props shared by generic UI components. */

export interface SegmentedOption<V extends string> {
  value: V;
  label: string;
  count?: number | null;
}

export interface SearchOption {
  value: string;
  label: string;
  hint?: string;
}

export interface TableColumn {
  key: string;
  label: string;
  /** CSS grid track, e.g. `minmax(150px,1.3fr)` or `70px`. */
  width: string;
  align?: 'left' | 'right';
}
