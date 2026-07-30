import type { FinanceFailureCode } from './finance';

/**
 * Result of a route-layer commit attempt. Shared between the route controller
 * and the UI components that consume its mutations so neither layer owns the
 * type exclusively.
 */
export type GameRouteCommitResult =
	| { status: 'sandbox-committed'; changed: boolean }
	| { status: 'committed' }
	| { status: 'busy' }
	| { status: 'rejected' }
	| {
			status: 'domain-rejected';
			code: FinanceFailureCode;
			context: Record<string, string | number>;
	  }
	| { status: 'unchanged' }
	| {
			status: 'confirmation-required';
			expectedRunId?: string | null;
			expectedRevision?: number | null;
	  }
	| { status: 'unavailable' }
	| { status: 'failed' };
