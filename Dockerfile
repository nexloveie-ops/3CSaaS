# syntax=docker/dockerfile:1
# Single Cloud Run service (Web + API). Build context: repository root.
# API-only image: infra/Dockerfile
include "infra/Dockerfile.combined"
