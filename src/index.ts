export { assess } from './assess.js';
export type { ShieldAssessment, ShieldSignals, ShieldRisk, AssessOptions } from './types/assessment.js';

export { ContentProtector } from './core/index.js';
export * from './types/index.js';
export * from './strategies/index.js';
export * from './utils/index.js';
export { attachShieldToSpan } from './otel.js';
export type { SpanEmitter } from './otel.js';
