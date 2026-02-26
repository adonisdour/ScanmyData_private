#!/usr/bin/env bash
# Create log-based metrics for app HTTP requests (count + distribution of response_bytes)
# Usage: ./scripts/create_log_metric.sh
# Requires: gcloud CLI authenticated with the target project

set -euo pipefail
PROJECT=${PROJECT:-scanmydata-96727}

# 1) Simple count metric (already provided previously)
COUNT_METRIC=${COUNT_METRIC:-app_http_requests_count}
COUNT_FILTER='textPayload:"event=http_request"'

echo "Creating count metric '$COUNT_METRIC' (filter: $COUNT_FILTER) in project $PROJECT..."
gcloud logging metrics create "$COUNT_METRIC" "$COUNT_FILTER" \
  --description="Count of app HTTP requests (after_request logs)" \
  --project="$PROJECT" || echo "Count metric may already exist or creation failed."

# 2) Distribution metric for response_bytes
# NOTE: gcloud's CLI supports --value-extractor and --bucket-options for distribution metrics.
# The command below uses a conservative set of explicit buckets (bytes):
DIST_METRIC=${DIST_METRIC:-app_response_bytes_distribution}
DIST_FILTER='textPayload:"event=http_request"'
VALUE_EXTRACTOR='EXTRACT(jsonPayload.response_bytes)'
BUCKETS='explicitBuckets=[0,1024,10240,65536,262144,1048576,5242880,10485760,52428800]'

echo "Creating distribution metric '$DIST_METRIC' (filter: $DIST_FILTER) in project $PROJECT..."

# Try to create distribution metric via gcloud. If your gcloud version does not accept --bucket-options on the CLI,
# create the metric from the Cloud Console UI (Logging → Logs-based metrics → Create metric) using the same filter
# and value extractor: EXTRACT(jsonPayload.response_bytes)

set +e
gcloud logging metrics create "$DIST_METRIC" "$DIST_FILTER" \
  --description="Distribution of response_bytes for app HTTP requests" \
  --value-extractor="$VALUE_EXTRACTOR" \
  --bucket-options="$BUCKETS" \
  --project="$PROJECT"
rc=$?
set -e
if [ $rc -ne 0 ]; then
  echo "\nCould not create distribution metric via gcloud CLI (your gcloud may not support --bucket-options)."
  echo "Please create a log-based distribution metric in the Cloud Console using:"
  echo "  Filter: $DIST_FILTER"
  echo "  Value extractor: $VALUE_EXTRACTOR"
  echo "  Buckets: $BUCKETS"
  exit 0
fi


# 3) Distribution metric for firebase.read bytes (size field)
FIREBASE_METRIC=${FIREBASE_METRIC:-firebase_read_bytes}
FIREBASE_FILTER='textPayload:"firebase.read"'
FIREBASE_VALUE='EXTRACT(REGEXP_EXTRACT(textPayload, "size=(\\d+)") )'

echo "\nCreating firebase read bytes metric '$FIREBASE_METRIC' (filter: $FIREBASE_FILTER) in project $PROJECT..."
set +e
gcloud logging metrics create "$FIREBASE_METRIC" "$FIREBASE_FILTER" \
  --description="Bytes downloaded per firebase.read operation" \
  --value-extractor="$FIREBASE_VALUE" \
  --project="$PROJECT"
rc=$?
set -e
if [ $rc -ne 0 ]; then
  echo "\nCould not create firebase read metric via gcloud CLI." \
       "Manually create it in Console with filter $FIREBASE_FILTER" \
       "and value extractor $FIREBASE_VALUE."
fi

echo "Metrics created (or already existed). To inspect: gcloud logging metrics list --project=$PROJECT"
