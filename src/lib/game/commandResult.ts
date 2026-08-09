import type { FinanceFailureCode } from './finance';
import type { DecisionResolutionFailureCode } from './eventEffects';
import type { ManualTransferFailure, RecurringRouteFailure } from './interCityLogistics';
import type { RetailSupplyAssignmentFailure } from './retailSupply';

export type LogisticsFailureCode = ManualTransferFailure | RecurringRouteFailure;

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
	| {
			status: 'decision-rejected';
			code: DecisionResolutionFailureCode;
			context: Record<string, string | number>;
			financeFailure?: FinanceFailureCode;
	  }
	| { status: 'retail-supply-rejected'; reason: RetailSupplyAssignmentFailure }
	| { status: 'logistics-rejected'; reason: LogisticsFailureCode }
	| { status: 'unchanged' }
	| {
			status: 'confirmation-required';
			expectedRunId?: string | null;
			expectedRevision?: number | null;
	  }
	| { status: 'unavailable' }
	| { status: 'failed' };
