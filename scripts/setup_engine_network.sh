#!/usr/bin/env bash
# One-time setup of the story engines' private network and service account:
# SETUP.md "Story engines: private network and service account", steps 1 and 2.
#
#   bash scripts/setup_engine_network.sh
#
# Safe to run again: whatever already exists is left as it is (the subnet's
# Private Google Access is switched off every time). Ends with a check that
# the network has no router, so no NAT and no way out. Steps 3 and 4 (deploying
# the engines, the invoker role) come once the engine image exists.
set -euo pipefail

PROJECT="${PROJECT:-thewudlands}"
REGION="${REGION:-europe-west1}"
NETWORK=engine-net
SUBNET=engine-subnet
RANGE=10.10.0.0/24
FIREWALL=engine-deny-all-egress
TAG=engine
SA_NAME=engine-sa
SA_EMAIL="$SA_NAME@$PROJECT.iam.gserviceaccount.com"

g() { gcloud --project "$PROJECT" --quiet "$@"; }
exists() { g "$@" >/dev/null 2>&1; }
step() { printf '\n== %s\n' "$*"; }

step "Project $PROJECT, region $REGION"
g config get-value account

step "Compute Engine API (networks and firewall rules)"
g services enable compute.googleapis.com

step "Network $NETWORK"
if exists compute networks describe "$NETWORK"; then
  echo "already there"
else
  g compute networks create "$NETWORK" --subnet-mode=custom
fi

step "Subnet $SUBNET ($RANGE, $REGION), without Private Google Access"
if exists compute networks subnets describe "$SUBNET" --region "$REGION"; then
  echo "already there"
else
  g compute networks subnets create "$SUBNET" \
    --network="$NETWORK" --region="$REGION" --range="$RANGE" \
    --no-enable-private-ip-google-access
fi
g compute networks subnets update "$SUBNET" --region "$REGION" --no-enable-private-ip-google-access

step "Firewall rule $FIREWALL: deny all outgoing traffic from tag $TAG"
if exists compute firewall-rules describe "$FIREWALL"; then
  echo "already there"
else
  g compute firewall-rules create "$FIREWALL" \
    --network="$NETWORK" --direction=EGRESS --action=DENY --rules=all \
    --destination-ranges=0.0.0.0/0 --priority=100 --target-tags="$TAG"
fi

step "Service account $SA_EMAIL, without roles"
if exists iam service-accounts describe "$SA_EMAIL"; then
  echo "already there"
else
  g iam service-accounts create "$SA_NAME" --display-name="Story engine (no permissions)"
fi
roles=$(g projects get-iam-policy "$PROJECT" \
  --flatten="bindings[].members" --filter="bindings.members:serviceAccount:$SA_EMAIL" \
  --format="value(bindings.role)")
if [ -n "$roles" ]; then
  echo "WARNING: $SA_EMAIL has project roles it must not have:"
  echo "$roles"
  exit 1
fi
echo "no project roles"

step "Check: no router (and so no NAT) on $NETWORK"
routers=$(g compute routers list --filter="network:$NETWORK" --format="value(name)")
if [ -n "$routers" ]; then
  echo "WARNING: $NETWORK has routers, which can carry a NAT out: $routers"
  exit 1
fi
echo "none - the network has no way out"

step "Done. Next, once the engine image exists: SETUP.md steps 3 to 5."
