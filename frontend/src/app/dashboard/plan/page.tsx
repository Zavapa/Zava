import { redirect } from 'next/navigation';

// Legacy single-plan URL — plans are now many-per-wallet under /dashboard/plans.
export default function LegacyPlanRedirect() {
  redirect('/dashboard/plans');
}
