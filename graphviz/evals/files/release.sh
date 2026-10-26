#!/usr/bin/env bash
# release.sh — build, verify and publish a release of the shop app.
#
# Overview (keep this in sync!):
#   We first make sure the working tree is clean and fetch dependencies. After that
#   the slow checks — lint, unit tests and the docker image build — are started in
#   the background so they overlap; we wait for all of them and bail out if any one
#   failed. Then the image gets tagged, pushed (the registry is flaky, so the push is
#   retried a few times with a backoff), and finally the changelog is published and
#   a git tag created. Whatever happens, cleanup removes the temp build dir.
set -euo pipefail

VERSION=${1:?usage: release.sh <version>}
REGISTRY=registry.example.com/shop
BUILD_DIR=$(mktemp -d)
LOG_DIR=$BUILD_DIR/logs
mkdir -p "$LOG_DIR"

cleanup() {
  echo "==> cleanup: removing $BUILD_DIR"
  rm -rf "$BUILD_DIR"
}
trap cleanup EXIT

die() { echo "!! $*" >&2; exit 1; }

echo "==> step 1/9: checking working tree"
# Refuse to release from a dirty tree — the tag must match what was built.
git diff --quiet && git diff --cached --quiet || die "working tree is dirty"

echo "==> step 2/9: fetching dependencies"
# npm ci is reproducible and fails on lockfile drift, which is what we want.
npm ci --silent

echo "==> step 3/9: starting lint, unit tests and image build in parallel"
# These three don't depend on each other, so run them at the same time.
# Each writes its own log; we look at the exit codes after the wait.
npm run lint >"$LOG_DIR/lint.log" 2>&1 &
LINT_PID=$!
npm test -- --ci >"$LOG_DIR/test.log" 2>&1 &
TEST_PID=$!
docker build -t "shop:$VERSION" . >"$LOG_DIR/build.log" 2>&1 &
BUILD_PID=$!

echo "==> step 4/9: waiting for parallel jobs"
FAILED=
wait $LINT_PID  || FAILED+=" lint"
wait $TEST_PID  || FAILED+=" tests"
wait $BUILD_PID || FAILED+=" build"
[ -z "$FAILED" ] || die "failed:$FAILED (logs in $LOG_DIR)"

echo "==> step 5/9: smoke-testing the image"
# Start the container, hit /health, stop it again.
CID=$(docker run -d -p 18080:8080 "shop:$VERSION")
for i in 1 2 3 4 5; do
  curl -fs localhost:18080/health >/dev/null && break
  sleep 2
  [ "$i" = 5 ] && { docker rm -f "$CID"; die "smoke test: /health never came up"; }
done
docker rm -f "$CID" >/dev/null

echo "==> step 6/9: tagging image"
docker tag "shop:$VERSION" "$REGISTRY:$VERSION"
docker tag "shop:$VERSION" "$REGISTRY:latest"

echo "==> step 7/9: pushing image (with retries)"
# The registry sometimes drops connections; retry up to 3 times, 5s/10s/20s backoff.
delay=5
for attempt in 1 2 3; do
  if docker push "$REGISTRY:$VERSION" && docker push "$REGISTRY:latest"; then
    break
  fi
  [ "$attempt" = 3 ] && die "push failed after 3 attempts"
  echo "   push attempt $attempt failed, retrying in ${delay}s"
  sleep "$delay"; delay=$(( delay * 2 ))
done

echo "==> step 8/9: publishing changelog"
# Only for non-prerelease versions; prereleases (x.y.z-rc.N) skip the public changelog.
if [[ $VERSION == *-* ]]; then
  echo "   prerelease, skipping changelog"
else
  npx changelog-publish --version "$VERSION" || die "changelog publish failed"
fi

echo "==> step 9/9: tagging git"
git tag -a "v$VERSION" -m "release $VERSION"
git push origin "v$VERSION"

echo "==> released $VERSION"
