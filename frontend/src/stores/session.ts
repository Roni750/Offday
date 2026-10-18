import { useAuthStore } from './auth';
import { useMyRequestsStore } from './myRequests';
import { useRequestDrawerStore } from './requestDrawer';
import { useReviewStore } from './review';

/** Signs out and clears every store that holds per-user data. The caller navigates. */
export function endSession(): void {
  useAuthStore().logout();
  useMyRequestsStore().$reset();
  useReviewStore().$reset();
  useRequestDrawerStore().close();
}
