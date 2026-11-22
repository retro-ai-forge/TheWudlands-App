#!/usr/bin/env bash
# Builds the story engine image and deploys engine-test and engine-live:
# SETUP.md "Story engines: private network and service account", steps 3 to 5.
# Needs steps 1 and 2 first (rav run gcp_engine_network).
#
#   bash scripts/deploy_engines.sh            # build, push, deploy both, check
#   bash scripts/deploy_engines.sh --check    # only the checks (step 5)
#
# Ends with the outbound check: a Cloud Run job with the engines' image and
# network settings tries to reach the internet and must not get through.
set -euo pipefail

PROJECT="${PROJECT:-thewudlands}"
REGION="${REGION:-europe-west1}"
REPO="${REPO:-serverless-wudlands-repo}"
MAIN_SA="${MAIN_SA:-cloud-run-firestore-sa@$PROJECT.iam.gserviceaccount.com}"
ENGINE_SA="engine-sa@$PROJECT.iam.gserviceaccount.com"
NETWORK_FLAGS=(--network engine-net --subnet engine-subnet --network-tags engine --vpc-egress all-traffic)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE_DIR="$ROOT/twinejs-integrated"
TAG="$(git -C "$ENGINE_DIR" rev-parse --short HEAD)"
IMAGE_BASE="$REGION-docker.pkg.dev/$PROJECT/$REPO/wudlands-engine"
IMAGE="$IMAGE_BASE:$TAG"

g() { gcloud --project "$PROJECT" --quiet "$@"; }
step() { printf '\n== %s\n' "$*"; }

check_only=false
[ "${1:-}" = "--check" ] && check_only=true

step "Project $PROJECT, region $REGION, account $(g config get-value account 2>/dev/null)"

if ! $check_only; then
  if [ -n "$(git -C "$ENGINE_DIR" status --porcelain -- engine src/util/publish.ts src/util/wudlands-runtime.ts public/story-formats)" ]; then
    echo "WARNING: uncommitted engine changes in twinejs-integrated - the image tag $TAG won't match them"
  fi

  step "Engine tests"
  (cd "$ENGINE_DIR/engine" && npm test 2>&1 | grep -E '^# (tests|pass|fail)')

  step "Build $IMAGE"
  docker build --platform=linux/amd64 -f "$ENGINE_DIR/engine/Dockerfile" -t "$IMAGE" -t "$IMAGE_BASE:latest" "$ENGINE_DIR"

  step "Push"
  g auth print-access-token | docker login -u oauth2accesstoken --password-stdin "https://$REGION-docker.pkg.dev" >/dev/null
  docker push "$IMAGE"
  docker push "$IMAGE_BASE:latest"

  # --no-cpu-throttling: the next fresh worker starts between calls (measured
  # 2026-11-22: with CPU only during requests a step took 1.3-1.9 s, near the
  # 2 s limit). Billed while the instance is up; it still scales to zero.
  step "Deploy engine-test (unreviewed stories: single-use workers, one instance at most)"
  g run deploy engine-test --image "$IMAGE" --region "$REGION" \
    --service-account "$ENGINE_SA" \
    --no-allow-unauthenticated --min-instances 0 --max-instances 1 \
    --cpu 1 --memory 1Gi --set-env-vars WORKER_MODE=single-use \
    --no-cpu-throttling \
    "${NETWORK_FLAGS[@]}"

  step "Deploy engine-live (live stories: shared workers; min 0 until players play on it)"
  g run deploy engine-live --image "$IMAGE" --region "$REGION" \
    --service-account "$ENGINE_SA" \
    --no-allow-unauthenticated --min-instances 0 --max-instances 20 \
    --cpu 2 --memory 1Gi --set-env-vars WORKER_MODE=shared \
    "${NETWORK_FLAGS[@]}"

  step "Only the main service ($MAIN_SA) may call the engines"
  for svc in engine-test engine-live; do
    g run services add-iam-policy-binding "$svc" --region "$REGION" \
      --member "serviceAccount:$MAIN_SA" --role roles/run.invoker >/dev/null
    echo "$svc: run.invoker for $MAIN_SA"
  done
fi

step "Check: both engines answer (with your own login, as the project's owner)"
token="$(g auth print-identity-token)"
for svc in engine-test engine-live; do
  url="$(g run services describe "$svc" --region "$REGION" --format='value(status.url)')"
  printf '%-12s %s  ' "$svc" "$url"
  if ! curl -fsS -H "Authorization: Bearer $token" "$url/health"; then
    echo
    echo "FAILED: $svc doesn't answer /health - see its log (Cloud Run > $svc > Logs)"
    exit 1
  fi
  echo
  printf '%-12s without a token: HTTP %s (must be 403)\n' "$svc" "$(curl -s -o /dev/null -w '%{http_code}' "$url/health")"
done

step "Check: settings of the deployed engines"
for svc in engine-test engine-live; do
  g run services describe "$svc" --region "$REGION" \
    --format="value(spec.template.spec.serviceAccountName,spec.template.metadata.annotations['run.googleapis.com/vpc-access-egress'],spec.template.metadata.annotations['run.googleapis.com/network-interfaces'])" \
    | sed "s/^/$svc: /"
done

step "Check: nothing gets out of the engines' network (Cloud Run job engine-egress-check)"
deployed_image="$(g run services describe engine-test --region "$REGION" --format='value(spec.template.spec.containers[0].image)')"
g run jobs deploy engine-egress-check --image "$deployed_image" --region "$REGION" \
  --service-account "$ENGINE_SA" \
  --command node --args src/egress-check.js \
  --max-retries 0 --task-timeout 120s \
  "${NETWORK_FLAGS[@]}" >/dev/null
if g run jobs execute engine-egress-check --region "$REGION" --wait >/dev/null; then
  echo "OK: the job found no way out (its log: Cloud Run > Jobs > engine-egress-check)"
else
  echo "FAILED: the job got through to the internet or didn't run - read its log (Cloud Run > Jobs > engine-egress-check)"
  exit 1
fi

step "Done"
