#!/bin/bash
# Build & push the LeadFlow Pro container image via Cloud Build.
# Run from the repo root in Cloud Shell after grant-cloudbuild-iam.sh.
#
# N8N_BASE_URL is NOT here — it's a runtime env var on Cloud Run, set
# in the Variables & Secrets tab of the service.

PIPEDRIVE_PERSON_LINKEDIN_KEY='4ba0d4a6c72fe6c72227d8f00b33fe60e0bf23ae'
PIPEDRIVE_PERSON_HEADLINE_KEY='722b3a4e63e093f8481df7f83aef7e18ff102ccd'
PIPEDRIVE_ORG_APOLLO_ID_KEY='85eec8ce8d056579a7622e05492483fc6823f67f'
PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY='1c1e4a133d95721201735a3997dd324ecece6b48'

SHA=$(git rev-parse --short HEAD)

gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="_REGION=europe-west1,_REPO=leadflow,_SHA=${SHA},_PIPEDRIVE_PERSON_LINKEDIN_KEY=${PIPEDRIVE_PERSON_LINKEDIN_KEY},_PIPEDRIVE_PERSON_HEADLINE_KEY=${PIPEDRIVE_PERSON_HEADLINE_KEY},_PIPEDRIVE_ORG_APOLLO_ID_KEY=${PIPEDRIVE_ORG_APOLLO_ID_KEY},_PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY=${PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY}"
