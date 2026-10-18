import { http } from './http';
import type { Overview } from './types';

export async function getOverview(year: number): Promise<Overview> {
  const { data } = await http.get<Overview>('/stats/overview', { params: { year } });
  return data;
}
