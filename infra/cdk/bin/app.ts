#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SpeclynNetworkStack } from '../lib/network-stack';
import { SpeclynDataStack } from '../lib/data-stack';
import { SpeclynSecretsStack } from '../lib/secrets-stack';
import { SpeclynComputeStack } from '../lib/compute-stack';
import { SpeclynPipelineStack } from '../lib/pipeline-stack';
import { SpeclynObservabilityStack } from '../lib/observability-stack';
import { SpeclynEventStack } from '../lib/event-stack';

const app = new cdk.App();

const env = {
  account: process.env['CDK_DEFAULT_ACCOUNT'] ?? process.env['AWS_ACCOUNT_ID'],
  region: process.env['CDK_DEFAULT_REGION'] ?? process.env['AWS_REGION'] ?? 'us-west-2',
};

// ── Layer 1: Networking ─────────────────────────────────────────────────────
const network = new SpeclynNetworkStack(app, 'speclyn-network', { env });

// ── Layer 2: Secrets ────────────────────────────────────────────────────────
const secrets = new SpeclynSecretsStack(app, 'speclyn-secrets', { env });

// ── Layer 3: Data (RDS + ElastiCache) ───────────────────────────────────────
const data = new SpeclynDataStack(app, 'speclyn-data', {
  env,
  vpc: network.vpc,
  dbSecret: secrets.dbSecret,
});

// ── Layer 4: Events (EventBridge) ───────────────────────────────────────────
const events = new SpeclynEventStack(app, 'speclyn-events', { env });

// ── Layer 5: Compute (ECS Fargate) ──────────────────────────────────────────
const compute = new SpeclynComputeStack(app, 'speclyn-compute', {
  env,
  vpc: network.vpc,
  dbSecret: secrets.dbSecret,
  appSecret: secrets.appSecret,
  rdsEndpoint: data.rdsEndpoint,
  rdsPort: data.rdsPort,
  redisEndpoint: data.redisEndpoint,
  redisPort: data.redisPort,
  eventBus: events.eventBus,
});

// ── Layer 6: Pipeline (Step Functions) ──────────────────────────────────────
const pipeline = new SpeclynPipelineStack(app, 'speclyn-pipeline', {
  env,
  cluster: compute.cluster,
  testGeneratorTask: compute.testGeneratorTask,
  apiRunnerTask: compute.apiRunnerTask,
  reporterTask: compute.reporterTask,
  eventBus: events.eventBus,
});

// ── Layer 7: Observability (CloudWatch + X-Ray) ─────────────────────────────
const observability = new SpeclynObservabilityStack(app, 'speclyn-observability', {
  env,
  cluster: compute.cluster,
  stateMachine: pipeline.stateMachine,
  eventBus: events.eventBus,
});

app.synth();
