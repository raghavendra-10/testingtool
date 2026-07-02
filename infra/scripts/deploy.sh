#!/bin/bash
set -euo pipefail

# ─── Speclyn AWS Deployment Script ──────────────────────────────────────────
# Usage: ./infra/scripts/deploy.sh [service|all]
# Examples:
#   ./infra/scripts/deploy.sh all          # Build and push all services
#   ./infra/scripts/deploy.sh api          # Build and push API only
#   ./infra/scripts/deploy.sh worker-test-generator   # Build specific worker

REGION="${AWS_REGION:-us-west-2}"
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

SERVICES=(
  "api"
  "web"
  "worker-test-generator"
  "worker-api-runner"
  "worker-browser-runner"
  "worker-browser-test-generator"
  "worker-reporter"
  "worker-scheduler"
  "worker-repo-analyzer"
  "worker-doc-parser"
  "worker-code-analyzer"
)

# Worker path mapping
declare -A WORKER_PATHS=(
  ["worker-test-generator"]="workers/test-generator/src/index.ts"
  ["worker-api-runner"]="workers/api-runner/src/index.ts"
  ["worker-browser-runner"]="workers/browser-runner/src/index.ts"
  ["worker-browser-test-generator"]="workers/browser-test-generator/src/index.ts"
  ["worker-reporter"]="workers/reporter/src/index.ts"
  ["worker-scheduler"]="workers/scheduler/src/index.ts"
  ["worker-repo-analyzer"]="workers/repo-analyzer/src/index.ts"
  ["worker-doc-parser"]="workers/doc-parser/src/index.ts"
  ["worker-code-analyzer"]="workers/code-analyzer/src/index.ts"
)

TARGET="${1:-all}"

# Login to ECR
echo "Logging into ECR..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_BASE"

build_and_push() {
  local service="$1"
  local repo="speclyn/${service}"
  local ecr_uri="${ECR_BASE}/${repo}"
  local tag="latest"
  local git_sha=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

  echo ""
  echo "━━━ Building ${service} ━━━"

  if [[ "$service" == "api" ]]; then
    docker build --target api -t "${ecr_uri}:${tag}" -t "${ecr_uri}:${git_sha}" .
  elif [[ "$service" == "web" ]]; then
    docker build --target web -t "${ecr_uri}:${tag}" -t "${ecr_uri}:${git_sha}" .
  else
    local worker_path="${WORKER_PATHS[$service]}"
    docker build --target worker \
      --build-arg "WORKER_PATH=${worker_path}" \
      -t "${ecr_uri}:${tag}" -t "${ecr_uri}:${git_sha}" .
  fi

  echo "Pushing ${service}..."
  docker push "${ecr_uri}:${tag}"
  docker push "${ecr_uri}:${git_sha}"
  echo "Done: ${ecr_uri}:${tag}"
}

if [[ "$TARGET" == "all" ]]; then
  for svc in "${SERVICES[@]}"; do
    build_and_push "$svc"
  done
else
  build_and_push "$TARGET"
fi

echo ""
echo "━━━ Deployment complete ━━━"
echo ""
echo "To update running ECS services:"
echo "  aws ecs update-service --cluster speclyn --service speclyn-<name> --force-new-deployment"
echo ""
echo "To deploy CDK infrastructure:"
echo "  cd infra/cdk && npm run deploy"
