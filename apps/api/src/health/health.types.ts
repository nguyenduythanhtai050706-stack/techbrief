export type DependencyStatus = 'up' | 'down';
export type HealthStatus = 'ok' | 'degraded';

export interface HealthReport {
  status: HealthStatus;
  postgres: DependencyStatus;
  redis: DependencyStatus;
}

export interface HealthCheckResult {
  statusCode: 200 | 503;
  body: HealthReport;
}
