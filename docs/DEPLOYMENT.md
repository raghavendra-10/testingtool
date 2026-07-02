# Speclyn Deployment Guide

**Version:** 1.0.0
**Date:** 2026-06-26

This guide covers deploying Speclyn to AWS from scratch — from a bare AWS account to a live, production-ready platform.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [AWS Account Setup](#2-aws-account-setup)
3. [Local Environment Setup](#3-local-environment-setup)
4. [Deploy Infrastructure (CDK)](#4-deploy-infrastructure-cdk)
5. [Configure Secrets](#5-configure-secrets)
6. [Run Database Migrations](#6-run-database-migrations)
7. [Build and Push Docker Images](#7-build-and-push-docker-images)
8. [Verify Deployment](#8-verify-deployment)
9. [Custom Domain Setup](#9-custom-domain-setup)
10. [Frontend Deployment](#10-frontend-deployment)
11. [CI/CD Pipeline](#11-cicd-pipeline)
12. [Updating the Platform](#12-updating-the-platform)
13. [Rollback](#13-rollback)
14. [Teardown](#14-teardown)
15. [Cost Estimation](#15-cost-estimation)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Prerequisites

### Tools Required

| Tool | Version | Install |
|------|---------|---------|
| Node.js | >= 22 | `brew install node` or nvm |
| pnpm | >= 10 | `corepack enable && corepack prepare pnpm@10.28.1 --activate` |
| AWS CLI | >= 2.x | `brew install awscli` |
| Docker | >= 24.x | Docker Desktop |
| Git | >= 2.x | `brew install git` |

### Accounts Required

| Service | Purpose | URL |
|---------|---------|-----|
| AWS | Infrastructure | https://aws.amazon.com |
| Clerk | Authentication | https://clerk.com |
| Resend (optional) | Email notifications | https://resend.com |
| GitHub (optional) | Repository integration | GitHub App setup |
| Bitbucket (optional) | Repository integration | Bitbucket OAuth consumer |

### AWS Services Used

The deployment creates resources in these AWS services:
- **VPC** — Networking (subnets, NAT gateway, VPC endpoints)
- **RDS** — PostgreSQL 16 database
- **ElastiCache** — Redis 7.1 cluster
- **ECS Fargate** — Container compute (API + 9 workers)
- **ECR** — Docker image registry (11 repositories)
- **ALB** — Application Load Balancer for API
- **S3** — Test file and evidence storage
- **Bedrock** — Claude AI model access
- **Secrets Manager** — Credential storage
- **Step Functions** — Test pipeline orchestration
- **EventBridge** — Event bus for cross-service events
- **CloudWatch** — Logging, metrics, dashboards, alarms
- **SNS** — Alert notifications
- **IAM** — Roles and policies

---

## 2. AWS Account Setup

### 2.1 Create an IAM User for Deployment

Do NOT use root account credentials.

1. Go to **AWS Console → IAM → Users → Create User**
2. Username: `speclyn-deployer`
3. Attach policies:
   - `AdministratorAccess` (for initial deployment — scope down later)
4. Create access keys → Download CSV
5. **Never share these keys. Never commit them to code.**

### 2.2 Configure AWS CLI

```bash
aws configure
# AWS Access Key ID: <from step above>
# AWS Secret Access Key: <from step above>
# Default region: us-west-2
# Default output format: json
```

### 2.3 Verify Access

```bash
aws sts get-caller-identity
# Should show your account ID and user ARN
```

### 2.4 Enable Bedrock Model Access

1. Go to **AWS Console → Amazon Bedrock → Model Access**
2. Region: `us-west-2`
3. Request access to: `Anthropic → Claude 3.5 Sonnet v2`
4. Wait for approval (usually instant)

### 2.5 Create S3 Bucket

```bash
aws s3 mb s3://speclyn-test-artifacts --region us-west-2

# Enable versioning (recommended)
aws s3api put-bucket-versioning \
  --bucket speclyn-test-artifacts \
  --versioning-configuration Status=Enabled

# Block public access
aws s3api put-public-access-block \
  --bucket speclyn-test-artifacts \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

---

## 3. Local Environment Setup

### 3.1 Clone and Install

```bash
git clone <your-repo-url> speclyn
cd speclyn
pnpm install
```

### 3.2 Install CDK Dependencies

```bash
cd infra/cdk
npm install
cd ../..
```

### 3.3 Verify Local Build

```bash
pnpm typecheck   # Should pass with zero errors
```

---

## 4. Deploy Infrastructure (CDK)

### 4.1 Bootstrap CDK

First-time only — creates the CDK staging bucket in your AWS account.

```bash
cd infra/cdk
npm run bootstrap
```

Expected output:
```
 ✅  Environment aws://<ACCOUNT_ID>/us-west-2 bootstrapped.
```

### 4.2 Preview Changes

```bash
npm run diff
```

This shows what resources will be created without actually creating them.

### 4.3 Deploy All Stacks

```bash
npm run deploy
```

This deploys 7 stacks in dependency order:

```
1. speclyn-network    (~3 min)   VPC, subnets, NAT gateway, VPC endpoints
2. speclyn-secrets    (~1 min)   Secrets Manager secrets
3. speclyn-data       (~15 min)  RDS PostgreSQL + ElastiCache Redis
4. speclyn-events     (~2 min)   EventBridge bus, rules, archive
5. speclyn-compute    (~10 min)  ECS cluster, ECR repos, Fargate services, ALB
6. speclyn-pipeline   (~2 min)   Step Functions state machine
7. speclyn-observability (~2 min) CloudWatch dashboard, alarms, SNS
```

**Total time: ~35 minutes** on first deploy.

CDK will prompt for security-related changes (IAM roles, security groups). Type `y` to approve.

### 4.4 Save CDK Outputs

After deployment, CDK prints outputs. Save these — you'll need them:

```
speclyn-network.VpcId = vpc-0abcdef1234567890
speclyn-secrets.DbSecretArn = arn:aws:secretsmanager:us-west-2:123456789:secret:speclyn/database-AbCdEf
speclyn-secrets.AppSecretArn = arn:aws:secretsmanager:us-west-2:123456789:secret:speclyn/app-GhIjKl
speclyn-data.RdsEndpoint = speclyn-postgres.cluster-abc123.us-west-2.rds.amazonaws.com
speclyn-data.RedisEndpoint = speclyn-redis.abc123.0001.usw2.cache.amazonaws.com
speclyn-compute.AlbDns = speclyn-api-alb-123456789.us-west-2.elb.amazonaws.com
speclyn-compute.ClusterArn = arn:aws:ecs:us-west-2:123456789:cluster/speclyn
speclyn-compute.Ecr-api = 123456789.dkr.ecr.us-west-2.amazonaws.com/speclyn/api
speclyn-pipeline.StateMachineArn = arn:aws:states:us-west-2:123456789:stateMachine:speclyn-test-pipeline
speclyn-observability.DashboardUrl = https://us-west-2.console.aws.amazon.com/cloudwatch/...
speclyn-observability.AlertTopicArn = arn:aws:sns:us-west-2:123456789:speclyn-alerts
```

---

## 5. Configure Secrets

### 5.1 Get Database Password

The DB password was auto-generated by Secrets Manager.

```bash
aws secretsmanager get-secret-value \
  --secret-id speclyn/database \
  --query SecretString \
  --output text | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['password'])"
```

### 5.2 Update App Secrets

Replace placeholder values with real credentials:

```bash
aws secretsmanager put-secret-value \
  --secret-id speclyn/app \
  --secret-string '{
    "CLERK_SECRET_KEY": "sk_live_your_clerk_secret_key",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY": "pk_live_your_clerk_publishable_key",
    "ENCRYPTION_KEY": "'$(openssl rand -hex 32)'",
    "GITHUB_APP_ID": "",
    "GITHUB_PRIVATE_KEY": "",
    "BITBUCKET_CLIENT_ID": "",
    "BITBUCKET_CLIENT_SECRET": "",
    "RESEND_API_KEY": ""
  }'
```

**Where to get these values:**

| Secret | Source |
|--------|--------|
| CLERK_SECRET_KEY | https://dashboard.clerk.com → API Keys |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Same Clerk dashboard |
| ENCRYPTION_KEY | `openssl rand -hex 32` (generate once, save securely) |
| GITHUB_APP_ID | GitHub → Settings → Developer Settings → GitHub Apps |
| GITHUB_PRIVATE_KEY | Download from GitHub App settings |
| BITBUCKET_CLIENT_ID | Bitbucket → Workspace Settings → OAuth Consumers |
| BITBUCKET_CLIENT_SECRET | Same Bitbucket page |
| RESEND_API_KEY | https://resend.com/api-keys |

### 5.3 Subscribe to Alerts (optional)

```bash
# Get email alerts for platform issues
aws sns subscribe \
  --topic-arn <AlertTopicArn from CDK output> \
  --protocol email \
  --notification-endpoint your@email.com

# Confirm the subscription email that arrives
```

---

## 6. Run Database Migrations

### 6.1 Construct the DATABASE_URL

```
postgresql://speclyn:<DB_PASSWORD>@<RDS_ENDPOINT>:5432/speclyn
```

Replace `<DB_PASSWORD>` and `<RDS_ENDPOINT>` from Step 5.1 and CDK outputs.

### 6.2 Run Migrations

```bash
# From the speclyn root directory
DATABASE_URL="postgresql://speclyn:<password>@<rds-endpoint>:5432/speclyn" \
  pnpm db:migrate
```

### 6.3 Verify Tables

```bash
DATABASE_URL="postgresql://speclyn:<password>@<rds-endpoint>:5432/speclyn" \
  pnpm db:studio
```

This opens Drizzle Studio — verify all tables are created.

**Note:** RDS is in a private subnet. To connect from your local machine, you need either:
- **SSM Session Manager** port forwarding
- **EC2 bastion host** in the public subnet
- **VPN** connection

Quick option — use SSM:
```bash
# Start a port-forwarding session (requires SSM plugin)
aws ssm start-session \
  --target <bastion-instance-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{"host":["<rds-endpoint>"],"portNumber":["5432"],"localPortNumber":["5433"]}'

# Then use localhost:5433
DATABASE_URL="postgresql://speclyn:<password>@localhost:5433/speclyn" pnpm db:migrate
```

---

## 7. Build and Push Docker Images

### 7.1 Login to ECR

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-west-2

aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com
```

### 7.2 Build and Push All Services

```bash
./infra/scripts/deploy.sh all
```

This builds and pushes 11 Docker images:
- `speclyn/api`
- `speclyn/web`
- `speclyn/worker-test-generator`
- `speclyn/worker-api-runner`
- `speclyn/worker-browser-runner`
- `speclyn/worker-browser-test-generator`
- `speclyn/worker-reporter`
- `speclyn/worker-scheduler`
- `speclyn/worker-repo-analyzer`
- `speclyn/worker-doc-parser`
- `speclyn/worker-code-analyzer`

Each image is tagged with `latest` and the git commit SHA.

### 7.3 Build a Single Service (faster)

```bash
./infra/scripts/deploy.sh api
./infra/scripts/deploy.sh worker-reporter
```

### 7.4 Force ECS to Pull New Images

After pushing, ECS needs to restart services:

```bash
# Update all services
for svc in api test-generator api-runner browser-runner browser-test-gen reporter scheduler repo-analyzer doc-parser code-analyzer; do
  aws ecs update-service --cluster speclyn --service speclyn-${svc} --force-new-deployment
done
```

Or update a single service:
```bash
aws ecs update-service --cluster speclyn --service speclyn-api --force-new-deployment
```

---

## 8. Verify Deployment

### 8.1 Check API Health

```bash
ALB_DNS="<AlbDns from CDK output>"
curl http://${ALB_DNS}/api/v1/health
# Expected: {"success":true,"data":{"status":"ok"}}
```

### 8.2 Check ECS Services

```bash
aws ecs list-services --cluster speclyn --output table
```

All services should show `ACTIVE` with `runningCount >= 1`:

```bash
aws ecs describe-services \
  --cluster speclyn \
  --services speclyn-api speclyn-test-generator speclyn-api-runner speclyn-reporter \
  --query 'services[].{name:serviceName,status:status,running:runningCount,desired:desiredCount}' \
  --output table
```

### 8.3 Check CloudWatch Dashboard

Open the dashboard URL from CDK output:
```
https://us-west-2.console.aws.amazon.com/cloudwatch/home?region=us-west-2#dashboards:name=speclyn-platform
```

### 8.4 Check Logs

```bash
# API logs
aws logs tail /speclyn/api --follow

# Worker logs
aws logs tail /speclyn/worker-test-generator --follow
aws logs tail /speclyn/worker-reporter --follow
```

### 8.5 Check Step Functions

```bash
aws stepfunctions list-executions \
  --state-machine-arn <StateMachineArn from CDK output> \
  --max-results 5 \
  --output table
```

---

## 9. Custom Domain Setup

### 9.1 Get an ACM Certificate

```bash
# Request certificate
aws acm request-certificate \
  --domain-name api.speclyn.com \
  --validation-method DNS \
  --region us-west-2

# Note the CertificateArn from output
```

### 9.2 Add DNS Validation Record

Go to your DNS provider and add the CNAME record from:
```bash
aws acm describe-certificate \
  --certificate-arn <CertificateArn> \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

### 9.3 Add HTTPS Listener to ALB

After certificate validates, update the CDK compute stack to add an HTTPS listener, or do it via Console:

1. **EC2 → Load Balancers → speclyn-api-alb → Listeners**
2. Add Listener: HTTPS:443, forward to speclyn-api-tg, select ACM certificate
3. Modify HTTP:80 listener to redirect to HTTPS

### 9.4 Add DNS Record

Point your domain to the ALB:
```
api.speclyn.com → CNAME → speclyn-api-alb-123456789.us-west-2.elb.amazonaws.com
```

### 9.5 Update CORS

In the app secrets or CDK, set:
```
ALLOWED_ORIGINS=https://app.speclyn.com
```

---

## 10. Frontend Deployment

The Next.js frontend can be deployed to:

### Option A: Vercel (recommended for Next.js)

```bash
cd apps/web
npx vercel --prod
```

Set environment variables in Vercel:
- `NEXT_PUBLIC_API_URL` = `https://api.speclyn.com`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = your Clerk key

### Option B: ECS Fargate (same cluster)

Already defined in CDK — the `speclyn/web` ECR repo and task exist.
Push the web image and the service will run it.

### Option C: AWS Amplify

```bash
aws amplify create-app --name speclyn-web --repository <github-repo-url>
```

---

## 11. CI/CD Pipeline

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]

env:
  AWS_REGION: us-west-2

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions-role
          aws-region: ${{ env.AWS_REGION }}

      - uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        run: ./infra/scripts/deploy.sh all

      - name: Update ECS services
        run: |
          for svc in api test-generator api-runner reporter; do
            aws ecs update-service --cluster speclyn --service speclyn-${svc} --force-new-deployment
          done
```

---

## 12. Updating the Platform

### Code Changes

```bash
# 1. Make changes locally
# 2. Test locally
pnpm typecheck

# 3. Build and push affected service
./infra/scripts/deploy.sh api              # or specific worker
./infra/scripts/deploy.sh worker-reporter

# 4. Force ECS update
aws ecs update-service --cluster speclyn --service speclyn-api --force-new-deployment
```

### Infrastructure Changes

```bash
cd infra/cdk

# Preview changes
npm run diff

# Deploy changes
npm run deploy
```

### Database Schema Changes

```bash
# 1. Update schema in packages/db/src/schema/
# 2. Generate migration
pnpm db:generate

# 3. Apply to production
DATABASE_URL="postgresql://..." pnpm db:migrate
```

---

## 13. Rollback

### Rollback ECS Service

```bash
# ECS keeps previous task definitions
# Find the previous revision
aws ecs list-task-definitions --family-prefix speclyn-api --sort DESC --max-items 5

# Update to specific revision
aws ecs update-service \
  --cluster speclyn \
  --service speclyn-api \
  --task-definition speclyn-api:<previous-revision>
```

### Rollback Docker Image

```bash
# ECR keeps last 10 images (lifecycle policy)
# Find previous image tag
aws ecr list-images --repository-name speclyn/api --filter tagStatus=TAGGED

# Re-tag the old image as latest
MANIFEST=$(aws ecr batch-get-image --repository-name speclyn/api --image-ids imageTag=<old-sha> --query images[0].imageManifest --output text)
aws ecr put-image --repository-name speclyn/api --image-tag latest --image-manifest "$MANIFEST"

# Force ECS update
aws ecs update-service --cluster speclyn --service speclyn-api --force-new-deployment
```

### Rollback Infrastructure

```bash
# CDK doesn't have built-in rollback, but:
# 1. Revert the CDK code change in git
git revert HEAD
# 2. Re-deploy
cd infra/cdk && npm run deploy
```

---

## 14. Teardown

To completely remove all AWS resources:

```bash
cd infra/cdk

# Disable deletion protection on RDS first
aws rds modify-db-instance \
  --db-instance-identifier speclyn-postgres \
  --no-deletion-protection

# Destroy all stacks (reverse order)
npm run destroy
```

**Warning:** This deletes everything including the database. Export data first if needed.

Manual cleanup:
```bash
# Delete S3 bucket (must be empty first)
aws s3 rb s3://speclyn-test-artifacts --force

# Delete ECR repositories (must delete images first)
for repo in api web worker-test-generator worker-api-runner worker-browser-runner worker-browser-test-generator worker-reporter worker-scheduler worker-repo-analyzer worker-doc-parser worker-code-analyzer; do
  aws ecr delete-repository --repository-name speclyn/${repo} --force
done
```

---

## 15. Cost Estimation

### Monthly Cost (minimal production setup)

| Service | Config | Est. Monthly |
|---------|--------|-------------|
| RDS PostgreSQL | t4g.medium, 20GB GP3, single-AZ | ~$55 |
| ElastiCache Redis | t4g.micro, single node | ~$12 |
| ECS Fargate | 9 workers (80% Spot) + 2 API tasks | ~$80-120 |
| NAT Gateway | 1 gateway + data transfer | ~$35 |
| ALB | 1 load balancer + LCUs | ~$20 |
| S3 | Test files + evidence (~10GB) | ~$2 |
| Bedrock (Claude) | Pay per token (varies by usage) | ~$10-100 |
| Secrets Manager | 2 secrets | ~$1 |
| CloudWatch | Logs + dashboard + alarms | ~$5-15 |
| ECR | 11 repos (~5GB total) | ~$1 |
| **Total** | | **~$220-360/month** |

### Cost Optimization Tips

1. **Use Fargate Spot** — already configured at 80%, saves ~70% on compute
2. **Single-AZ RDS** — saves ~50% vs Multi-AZ (acceptable for non-critical)
3. **t4g instances** — ARM-based, 20% cheaper than Intel
4. **VPC endpoints** — avoid NAT gateway data charges for AWS service calls
5. **ECR lifecycle** — keeps only 10 images per repo
6. **CloudWatch log retention** — set to 2 weeks (not indefinite)
7. **Scale to zero** — set worker `desiredCount: 0` when not in use

### Scale Up When Needed

```bash
# Increase API tasks
aws ecs update-service --cluster speclyn --service speclyn-api --desired-count 4

# Increase worker parallelism
aws ecs update-service --cluster speclyn --service speclyn-api-runner --desired-count 4

# Upgrade RDS
aws rds modify-db-instance --db-instance-identifier speclyn-postgres --db-instance-class db.t4g.large
```

---

## 16. Troubleshooting

### ECS Task Won't Start

```bash
# Check stopped task reason
aws ecs list-tasks --cluster speclyn --service-name speclyn-api --desired-status STOPPED
aws ecs describe-tasks --cluster speclyn --tasks <task-arn> --query 'tasks[0].stoppedReason'
```

Common causes:
- **Image not found** — verify ECR image exists with `latest` tag
- **Secrets not accessible** — check IAM execution role has Secrets Manager read
- **Port conflict** — verify container port matches task definition

### Cannot Connect to RDS

- RDS is in **isolated subnets** — only accessible from within the VPC
- Use SSM port forwarding or a bastion host
- Check security group allows inbound from worker security group

### Bedrock Model Access Denied

```
Error: You don't have access to the model
```

Fix: AWS Console → Bedrock → Model Access → Request access to Claude 3.5 Sonnet v2

### Redis Connection Timeout

- ElastiCache is in **isolated subnets**
- Check security group allows inbound 6379 from worker SG
- Verify `REDIS_URL` uses the ElastiCache endpoint, not `localhost`

### Step Functions Execution Failed

```bash
# View execution history
aws stepfunctions get-execution-history \
  --execution-arn <execution-arn> \
  --reverse-order \
  --max-results 10
```

### High CloudWatch Costs

```bash
# Check log volume
aws cloudwatch get-metric-statistics \
  --namespace AWS/Logs \
  --metric-name IncomingBytes \
  --start-time $(date -v-7d +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Sum
```

Reduce by: lowering log level, reducing retention, filtering verbose logs.

### Health Check Failing

```bash
# Test from within the VPC (exec into a running task)
aws ecs execute-command \
  --cluster speclyn \
  --task <task-arn> \
  --container speclyn-api \
  --interactive \
  --command "/bin/sh"

# Inside container:
curl http://localhost:3001/api/v1/health
```
