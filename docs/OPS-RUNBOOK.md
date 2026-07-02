# Speclyn Operations Runbook

**Version:** 1.0.0
**Date:** 2026-06-26

Day-to-day operations guide for monitoring, scaling, troubleshooting, and managing the Speclyn platform on AWS.

---

## Table of Contents

1. [Quick Reference](#1-quick-reference)
2. [Daily Operations](#2-daily-operations)
3. [Monitoring](#3-monitoring)
4. [Scaling](#4-scaling)
5. [Incident Response](#5-incident-response)
6. [Common Issues & Fixes](#6-common-issues--fixes)
7. [Database Operations](#7-database-operations)
8. [Secret Rotation](#8-secret-rotation)
9. [Log Analysis](#9-log-analysis)
10. [Cost Management](#10-cost-management)
11. [Backup & Recovery](#11-backup--recovery)

---

## 1. Quick Reference

### Key URLs

| Resource | URL/Command |
|----------|-------------|
| API Health | `curl https://api.speclyn.com/api/v1/health` |
| CloudWatch Dashboard | AWS Console → CloudWatch → Dashboards → speclyn-platform |
| ECS Console | AWS Console → ECS → Clusters → speclyn |
| Step Functions | AWS Console → Step Functions → speclyn-test-pipeline |
| RDS Console | AWS Console → RDS → speclyn-postgres |
| Secrets Manager | AWS Console → Secrets Manager → speclyn/* |

### Useful CLI Commands

```bash
# Check all services
aws ecs describe-services --cluster speclyn \
  --services speclyn-api speclyn-test-generator speclyn-api-runner speclyn-reporter \
  --query 'services[].{name:serviceName,running:runningCount,desired:desiredCount,status:status}' \
  --output table

# Tail API logs
aws logs tail /speclyn/api --follow --since 5m

# List recent Step Functions executions
aws stepfunctions list-executions \
  --state-machine-arn <arn> \
  --status-filter RUNNING \
  --max-results 10

# Check Redis connectivity
aws elasticache describe-replication-groups \
  --replication-group-id speclyn-redis \
  --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint'

# Check RDS status
aws rds describe-db-instances \
  --db-instance-identifier speclyn-postgres \
  --query 'DBInstances[0].{Status:DBInstanceStatus,CPU:PerformanceInsightsEnabled,Storage:AllocatedStorage}'
```

---

## 2. Daily Operations

### Morning Check (2 minutes)

```bash
# 1. API health
curl -s https://api.speclyn.com/api/v1/health | jq .

# 2. ECS service health
aws ecs describe-services --cluster speclyn \
  --services speclyn-api speclyn-test-generator speclyn-reporter \
  --query 'services[].{svc:serviceName,run:runningCount,want:desiredCount}' \
  --output table

# 3. Check for alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix speclyn \
  --state-value ALARM \
  --output table
```

### Weekly Check

```bash
# 1. Review costs
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics BlendedCost \
  --filter '{"Tags":{"Key":"aws:cloudformation:stack-name","Values":["speclyn-compute","speclyn-data"]}}' \
  --output table

# 2. Check RDS storage
aws rds describe-db-instances \
  --db-instance-identifier speclyn-postgres \
  --query 'DBInstances[0].{Allocated:AllocatedStorage,Free:FreeStorageSpace}'

# 3. Check ECR image count
for repo in api worker-test-generator worker-api-runner worker-reporter; do
  count=$(aws ecr list-images --repository-name speclyn/${repo} --query 'imageIds | length(@)')
  echo "speclyn/${repo}: ${count} images"
done
```

---

## 3. Monitoring

### CloudWatch Dashboard

Open: AWS Console → CloudWatch → Dashboards → `speclyn-platform`

| Widget | What to Watch |
|--------|--------------|
| Pipeline Executions | Failed count should be near 0 |
| Pipeline Duration | p95 should be < 10 minutes |
| ECS CPU | Should stay below 70% average |
| ECS Memory | Should stay below 75% average |
| Worker Errors | Spikes indicate issues |
| Bedrock Latency | p95 > 30s indicates throttling |
| Token Usage | Track for cost estimation |
| Test Pass Rate | Trend line — drops indicate API changes |

### Key Metrics to Alert On

| Metric | Warning | Critical |
|--------|---------|----------|
| Pipeline failure rate | >20% (15min) | >50% (10min) |
| ECS CPU utilization | >70% | >85% |
| ECS Memory utilization | >75% | >90% |
| RDS CPU | >70% | >90% |
| RDS Free Storage | <5GB | <2GB |
| Redis Memory | >70% | >85% |
| Bedrock throttled | >5/min | >20/min |

### Setting Up Additional Alarms

```bash
# Example: RDS CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name speclyn-rds-high-cpu \
  --alarm-description "RDS CPU > 80%" \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=speclyn-postgres \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3 \
  --alarm-actions <sns-topic-arn>
```

---

## 4. Scaling

### Scale ECS Services

```bash
# Scale API for traffic
aws ecs update-service --cluster speclyn --service speclyn-api --desired-count 4

# Scale API runner for parallel test execution
aws ecs update-service --cluster speclyn --service speclyn-api-runner --desired-count 4

# Scale down (off-hours)
aws ecs update-service --cluster speclyn --service speclyn-api --desired-count 1
```

### Auto-Scaling (add to CDK)

Add to `compute-stack.ts` for automatic scaling:

```typescript
const scaling = apiService.autoScaleTaskCount({ minCapacity: 2, maxCapacity: 10 });
scaling.scaleOnCpuUtilization('cpu-scaling', { targetUtilizationPercent: 70 });
scaling.scaleOnMemoryUtilization('memory-scaling', { targetUtilizationPercent: 75 });
```

### Scale RDS

```bash
# Upgrade instance type (causes brief downtime)
aws rds modify-db-instance \
  --db-instance-identifier speclyn-postgres \
  --db-instance-class db.t4g.large \
  --apply-immediately

# Enable Multi-AZ (no downtime)
aws rds modify-db-instance \
  --db-instance-identifier speclyn-postgres \
  --multi-az \
  --apply-immediately
```

### Scale Redis

```bash
# Upgrade node type
aws elasticache modify-replication-group \
  --replication-group-id speclyn-redis \
  --cache-node-type cache.t4g.small \
  --apply-immediately
```

---

## 5. Incident Response

### Service Down

```bash
# 1. Check which services are affected
aws ecs describe-services --cluster speclyn --services speclyn-api \
  --query 'services[0].{running:runningCount,events:events[0:3]}'

# 2. Check stopped task reason
TASK=$(aws ecs list-tasks --cluster speclyn --service-name speclyn-api --desired-status STOPPED --query 'taskArns[0]' --output text)
aws ecs describe-tasks --cluster speclyn --tasks $TASK --query 'tasks[0].stoppedReason'

# 3. Check logs
aws logs tail /speclyn/api --since 10m

# 4. Force restart
aws ecs update-service --cluster speclyn --service speclyn-api --force-new-deployment
```

### Database Down

```bash
# 1. Check RDS status
aws rds describe-db-instances --db-instance-identifier speclyn-postgres \
  --query 'DBInstances[0].DBInstanceStatus'

# 2. Check events
aws rds describe-events --source-identifier speclyn-postgres --source-type db-instance --duration 60

# 3. If storage full
aws rds modify-db-instance --db-instance-identifier speclyn-postgres \
  --allocated-storage 50 --apply-immediately
```

### Pipeline Stuck

```bash
# 1. List running executions
aws stepfunctions list-executions \
  --state-machine-arn <arn> --status-filter RUNNING

# 2. Stop a stuck execution
aws stepfunctions stop-execution --execution-arn <execution-arn> --cause "Manual stop - stuck"

# 3. Check which step failed
aws stepfunctions get-execution-history --execution-arn <execution-arn> --reverse-order --max-results 5
```

---

## 6. Common Issues & Fixes

| Issue | Symptom | Fix |
|-------|---------|-----|
| ECS task OOM | Task exits code 137 | Increase memory in task definition |
| Bedrock throttled | 429 errors in logs | Reduce concurrency or request quota increase |
| Redis full | ConnectionError in logs | Upgrade node type or flush unused keys |
| RDS connections exhausted | "too many connections" | Increase max_connections or add connection pooling |
| ECR image pull fails | CannotPullContainerError | Check ECR endpoint, verify image exists |
| Secrets not loading | "REPLACE_ME" in logs | Update speclyn/app secret with real values |
| ALB 502 | Browser shows Bad Gateway | Check API health, verify target group health |
| S3 access denied | PutObject fails | Check worker role has s3:PutObject on speclyn-* |

---

## 7. Database Operations

### Connect to RDS (via bastion/SSM)

```bash
# Port forward via SSM
aws ssm start-session \
  --target <bastion-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<rds-endpoint>"],"portNumber":["5432"],"localPortNumber":["5433"]}'

# Connect
psql "postgresql://speclyn:<password>@localhost:5433/speclyn"
```

### Run Migrations

```bash
DATABASE_URL="postgresql://speclyn:<password>@localhost:5433/speclyn" pnpm db:migrate
```

### Manual Backup

```bash
aws rds create-db-snapshot \
  --db-instance-identifier speclyn-postgres \
  --db-snapshot-identifier speclyn-manual-$(date +%Y%m%d)
```

### Restore from Backup

```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier speclyn-postgres-restored \
  --db-snapshot-identifier <snapshot-id> \
  --db-instance-class db.t4g.medium
```

---

## 8. Secret Rotation

### Rotate Database Password

```bash
# 1. Generate new password
NEW_PASS=$(openssl rand -base64 24 | tr -d '/+=')

# 2. Update in Secrets Manager
aws secretsmanager update-secret \
  --secret-id speclyn/database \
  --secret-string "{\"username\":\"speclyn\",\"password\":\"${NEW_PASS}\",\"dbname\":\"speclyn\"}"

# 3. Update RDS password
aws rds modify-db-instance \
  --db-instance-identifier speclyn-postgres \
  --master-user-password "${NEW_PASS}" \
  --apply-immediately

# 4. Restart all ECS services (they pull secrets on startup)
for svc in api test-generator api-runner reporter scheduler; do
  aws ecs update-service --cluster speclyn --service speclyn-${svc} --force-new-deployment
done
```

### Rotate App Secrets

```bash
# 1. Update secret value
aws secretsmanager put-secret-value \
  --secret-id speclyn/app \
  --secret-string '{ ... new values ... }'

# 2. Restart services
aws ecs update-service --cluster speclyn --service speclyn-api --force-new-deployment
```

### Rotate AWS Access Keys

```bash
# 1. Create new key
aws iam create-access-key --user-name speclyn-deployer

# 2. Update local config
aws configure

# 3. Test access
aws sts get-caller-identity

# 4. Delete old key
aws iam delete-access-key --user-name speclyn-deployer --access-key-id <OLD_KEY_ID>
```

---

## 9. Log Analysis

### Search for Errors

```bash
# All errors across workers in last hour
aws logs filter-log-events \
  --log-group-name /speclyn/worker-test-generator \
  --start-time $(date -v-1H +%s000) \
  --filter-pattern "ERROR"

# Bedrock failures
aws logs filter-log-events \
  --log-group-name /speclyn/worker-test-generator \
  --filter-pattern "Bedrock" \
  --start-time $(date -v-1H +%s000)
```

### Search EventBridge Events

```bash
# View recent events
aws logs filter-log-events \
  --log-group-name /speclyn/events \
  --start-time $(date -v-1H +%s000) \
  --filter-pattern "RunCompleted"
```

### Export Logs to S3

```bash
aws logs create-export-task \
  --log-group-name /speclyn/api \
  --from $(date -v-7d +%s000) \
  --to $(date +%s000) \
  --destination speclyn-test-artifacts \
  --destination-prefix logs/api/
```

---

## 10. Cost Management

### View Current Spend

```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-30d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --output table
```

### Cost Reduction Strategies

| Action | Savings | Command |
|--------|---------|---------|
| Scale workers to 0 at night | ~40% compute | `aws ecs update-service --service speclyn-<name> --desired-count 0` |
| Use Fargate Spot (already 80%) | ~70% per task | Already configured |
| Single NAT gateway | ~50% NAT cost | Already configured |
| Reduce log retention | ~50% logs | Set to 1 week in CDK |
| Reserved RDS instance (1yr) | ~40% RDS | AWS Console → RDS → Reserved |

### Set Up Budget Alert

```bash
aws budgets create-budget \
  --account-id <ACCOUNT_ID> \
  --budget '{
    "BudgetName": "speclyn-monthly",
    "BudgetLimit": {"Amount": "400", "Unit": "USD"},
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[{
    "Notification": {"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80},
    "Subscribers": [{"SubscriptionType":"EMAIL","Address":"your@email.com"}]
  }]'
```

---

## 11. Backup & Recovery

### Automated Backups

| Resource | Backup | Retention |
|----------|--------|-----------|
| RDS | Automated snapshots | 7 days |
| EventBridge | Event archive | 30 days |
| CloudWatch Logs | Log retention | 14 days |
| S3 | Versioning enabled | Indefinite |
| Secrets Manager | Version history | Built-in |

### Manual Backup Before Major Changes

```bash
# 1. Database snapshot
aws rds create-db-snapshot \
  --db-instance-identifier speclyn-postgres \
  --db-snapshot-identifier speclyn-pre-upgrade-$(date +%Y%m%d)

# 2. Export secrets
aws secretsmanager get-secret-value --secret-id speclyn/app > /tmp/speclyn-app-secret-backup.json
aws secretsmanager get-secret-value --secret-id speclyn/database > /tmp/speclyn-db-secret-backup.json
# Store these securely, delete from /tmp

# 3. CDK state
cd infra/cdk && npx cdk synth > /tmp/speclyn-cdk-snapshot.yaml
```

### Disaster Recovery

```bash
# 1. Restore RDS from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier speclyn-postgres-dr \
  --db-snapshot-identifier <latest-snapshot>

# 2. Update secrets with new RDS endpoint
# 3. Force deploy all services
# 4. Verify health
```
