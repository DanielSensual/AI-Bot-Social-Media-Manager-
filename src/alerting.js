/**
 * Centralized Error Alerting — powered by @ghostai/shared
 * Re-exports the unified alert module with both x-bot and lead-hunter APIs.
 */
export {
    alert,
    alertPostFailure,
    alertTokenExpiry,
    alertHealthCheckFailure,
    alertSuccess,
    alertHotLead,
    alertReply,
    recordFailure,
    clearFailure,
} from '@ghostai/shared/alerts';

// Default export for backward compat with `import alerting from './alerting.js'`
export { default } from '@ghostai/shared/alerts';
