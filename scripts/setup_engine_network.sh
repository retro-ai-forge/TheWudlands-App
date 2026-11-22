#!/usr/bin/env bash
# One-time setup of the story engines' private network and service account:
# SETUP.md "Story engines: private network and service account", steps 1 and 2.
#
#   bash scripts/setup_engine_network.sh
#
# Safe to run again: whatever already exists is left as it is (the subnet's
# Private Google Access is switched off and any route to the internet removed
# every time). Ends with a check that the network has no router (so no NAT),
# no route to the internet and its DNS policy. Steps 3 and 4 (deploying the
# engines, the invoker role) come once the engine image exists.
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
DNS_POLICY=engine-no-dns
# The "name server" every lookup from the network is sent to: an address that
# exists nowhere and has no route, so no question ever leaves the network.
NO_NAME_SERVER=10.255.255.254

# The names of $NETWORK's routes to the whole internet (0.0.0.0/0).
internet_routes() {
  g compute routes list --format='csv[no-heading](name,network.basename(),destRange)' \
    | awk -F, -v net="$NETWORK" '$2 == net && $3 == "0.0.0.0/0" {print $1}'
}

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

step "No route to the internet in $NETWORK"
# Every new network gets Google's default route 0.0.0.0/0 to the internet
# gateway. Without a NAT or public addresses nothing can use it, but the
# engines need no route out at all: removing it is a third lock, so even a NAT
# added by mistake would lead nowhere. Only $NETWORK's routes are touched.
for route in $(internet_routes); do
  g compute routes delete "$route"
done
echo "none"

step "DNS policy $DNS_POLICY: no name lookups from $NETWORK"
# A lookup of <data>.attacker.example carries data out even when no connection
# is possible. Every lookup from the network goes to $NO_NAME_SERVER instead of
# Google's resolver, so none reaches a name server outside. Logged: the engines
# never look up a name, so any entry in the log is a story trying to get out.
g services enable dns.googleapis.com
if exists dns policies describe "$DNS_POLICY"; then
  g dns policies update "$DNS_POLICY" --networks="$NETWORK" \
    --alternative-name-servers="$NO_NAME_SERVER" --enable-logging --format=none
  echo "already there (kept as above)"
else
  g dns policies create "$DNS_POLICY" --description="Story engines: no name lookups" \
    --networks="$NETWORK" --alternative-name-servers="$NO_NAME_SERVER" --enable-logging
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
echo "none"

step "Check: no route to the internet on $NETWORK"
routes="$(internet_routes)"
if [ -n "$routes" ]; then
  echo "WARNING: $NETWORK still has a route to the internet: $routes"
  exit 1
fi
echo "none"

step "Check: DNS policy $DNS_POLICY on $NETWORK"
policy="$(g dns policies describe "$DNS_POLICY" \
  --format='value(networks[].networkUrl.basename(),alternativeNameServerConfig.targetNameServers[].ipv4Address,enableLogging)')"
if [[ "$policy" != *"$NETWORK"*"$NO_NAME_SERVER"* ]]; then
  echo "WARNING: the DNS policy isn't as expected: $policy"
  exit 1
fi
echo "$policy - the network has no way out"

step "Done. Next, once the engine image exists: SETUP.md steps 3 to 5."
