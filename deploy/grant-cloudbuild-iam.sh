#!/bin/bash
# Grants the Compute Engine default service account the IAM roles
# Cloud Build needs to upload source, write logs, push to Artifact
# Registry, and run builds. Required once per GCP project on accounts
# created after April 2024.
#
# Usage (from Cloud Shell in the cloned repo):
#   bash deploy/grant-cloudbuild-iam.sh

set -e

P=$(gcloud config get-value project)
N=$(gcloud projects describe "$P" --format='value(projectNumber)')
SA="${N}-compute@developer.gserviceaccount.com"

echo "Project:         $P"
echo "Service account: $SA"
echo

for R in storage.admin logging.logWriter artifactregistry.writer cloudbuild.builds.builder; do
  echo "Granting roles/$R ..."
  gcloud projects add-iam-policy-binding "$P" \
    --member="serviceAccount:$SA" \
    --role="roles/$R" \
    --condition=None \
    --quiet >/dev/null
done

echo
echo "Done. Re-run your gcloud builds submit command."