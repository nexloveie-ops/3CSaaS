# Deploy LZ3C to GCP (Cloud Run)

## Recommended: one Cloud Run service

One URL serves the SPA and proxies `/api` to NestJS inside the same container (nginx on `$PORT`, API on internal `:3000`).

| Service | Image | Port | Notes |
|---------|-------|------|-------|
| `lz3c` (or your name) | `infra/Dockerfile.combined` | 8080 | Web + API; no `_API_UPSTREAM` |

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_DEPLOY_REGION=$REGION,_SERVICE_NAME=lz3c
```

If deploy fails with **“failed to start and listen on PORT=8080”**, ensure the image uses the combined entrypoint (nginx listens on `$PORT` immediately; API may start later). Redeploy after commit `124dbb0` or later.

After the first deploy, set the public URL on the same service (replace with your Cloud Run URL):

```bash
export APP_URL=https://lz3c-xxxxx-$REGION.a.run.app

gcloud run services update lz3c --region $REGION \
  --set-env-vars "CORS_ORIGIN=$APP_URL,WEB_APP_URL=$APP_URL"
```

**Cloud Build trigger:** configuration file `cloudbuild.yaml` at repo root, substitutions `_DEPLOY_REGION`, `_SERVICE_NAME=lz3c`. You do **not** need a second trigger or `infra/cloudbuild-web.yaml`.

### Deploy with Dockerfile only (no `cloudbuild.yaml`)

You can build and deploy from the repo root **`Dockerfile`** (same content as `infra/Dockerfile.combined` — Web + API in one image). Cloud Build’s default Docker builder does **not** support Dockerfile `INCLUDE`; use a full Dockerfile or `-f infra/Dockerfile.combined`.

**Option A — Cloud Run builds from source (simplest)**

```bash
export PROJECT_ID=your-gcp-project
export REGION=europe-west1
gcloud config set project $PROJECT_ID

gcloud run deploy lz3c \
  --source . \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 300 \
  --memory 1Gi \
  --set-secrets MONGODB_URI=lz3c-mongodb-uri:latest,JWT_SECRET=lz3c-jwt-secret:latest \
  --set-env-vars MONGODB_DB_NAME=lz3c,NODE_ENV=production,USE_CHROMIUM=1
```

Cloud Build will use the root `Dockerfile` automatically. After deploy, set `CORS_ORIGIN` and `WEB_APP_URL` to the service URL (see above).

**Option B — Local Docker + push image**

```bash
export REGION=europe-west1
export PROJECT_ID=your-gcp-project
export IMAGE=$REGION-docker.pkg.dev/$PROJECT_ID/lz3c/lz3c:latest

docker build -t $IMAGE .
docker push $IMAGE

gcloud run deploy lz3c \
  --image $IMAGE \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-secrets MONGODB_URI=lz3c-mongodb-uri:latest,JWT_SECRET=lz3c-jwt-secret:latest \
  --set-env-vars MONGODB_DB_NAME=lz3c,NODE_ENV=production,USE_CHROMIUM=1
```

**Option C — Cloud Build trigger type “Dockerfile”**

| Field | Value |
|-------|--------|
| Dockerfile location | `Dockerfile` (repo root) or `infra/Dockerfile.combined` |
| Build context | `.` (repository root) |
| Image destination | `$REGION-docker.pkg.dev/$PROJECT_ID/lz3c/lz3c:$COMMIT_SHA` |

A Dockerfile-only trigger **only builds and pushes** the image. You still need either:

- a second step / trigger to `gcloud run deploy --image ...`, or  
- Cloud Run **continuous deployment** linked to that image, or  
- run `gcloud run deploy` manually after each build.

**API-only** (no static web): use `infra/Dockerfile`, not the root `Dockerfile`.

---

## Alternative: two Cloud Run services

| Service | Image | Port | Notes |
|---------|-------|------|-------|
| `lz3c-api` | `infra/Dockerfile` | 8080 | NestJS API, MongoDB Atlas |
| `lz3c-web` | `infra/Dockerfile.web` | 8080 | React SPA + nginx, proxies `/api` |

## Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud`)
- GCP project with billing enabled
- MongoDB Atlas cluster (allow Cloud Run egress IPs or `0.0.0.0/0` for dev)
- Optional: Stripe, Twilio secrets

## 1. One-time GCP setup

```bash
export PROJECT_ID=your-gcp-project
export REGION=europe-west1

gcloud config set project $PROJECT_ID

gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com

gcloud artifacts repositories create lz3c \
  --repository-format=docker \
  --location=$REGION \
  --description="LZ3C containers"
```

## 2. Secrets (Secret Manager)

```bash
# MongoDB connection string (Atlas)
echo -n 'mongodb+srv://...' | gcloud secrets create lz3c-mongodb-uri --data-file=-

# JWT signing key (long random string)
echo -n 'your-production-jwt-secret' | gcloud secrets create lz3c-jwt-secret --data-file=-

# Grant Cloud Run access
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
for SEC in lz3c-mongodb-uri lz3c-jwt-secret; do
  gcloud secrets add-iam-policy-binding $SEC \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

Add more secrets as needed (`STRIPE_SECRET_KEY`, `TWILIO_AUTH_TOKEN`, etc.) and reference them in `gcloud run deploy --set-secrets`.

## 3. Deploy API

```bash
gcloud builds submit --config infra/cloudbuild.yaml \
  --substitutions=_DEPLOY_REGION=$REGION,_SERVICE_NAME=lz3c-api
```

Or manually:

```bash
docker build -f infra/Dockerfile -t $REGION-docker.pkg.dev/$PROJECT_ID/lz3c/lz3c-api:latest .
docker push $REGION-docker.pkg.dev/$PROJECT_ID/lz3c/lz3c-api:latest

gcloud run deploy lz3c-api \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/lz3c/lz3c-api:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-secrets MONGODB_URI=lz3c-mongodb-uri:latest,JWT_SECRET=lz3c-jwt-secret:latest \
  --set-env-vars "MONGODB_DB_NAME=lz3c,NODE_ENV=production,CORS_ORIGIN=https://YOUR-WEB-URL"
```

Note the API URL, e.g. `https://lz3c-api-xxxxx-$REGION.a.run.app`.

## 4. Deploy Web

Set `API_UPSTREAM` to the API service URL with `/api/` suffix:

```bash
export API_URL=https://lz3c-api-xxxxx-$REGION.a.run.app

gcloud builds submit --config infra/cloudbuild-web.yaml \
  --substitutions=_DEPLOY_REGION=$REGION,_SERVICE_NAME=lz3c-web,_API_UPSTREAM=${API_URL}/api/
```

After deploy, open the `lz3c-web` Cloud Run URL in the browser.

## 5. Local Docker (full stack)

```bash
cp .env.example .env.local   # fill MONGODB_URI, JWT_SECRET
npm run docker:up
```

- API: http://localhost:3000/api/health  
- Web: http://localhost:8080 (nginx proxies `/api` → API)

## 6. Invoice PDFs (GCS)

Create a bucket (e.g. `lz3c-invoices-prod`) and grant the Cloud Run service account **Storage Object Admin** on it.

```bash
gcloud run services update lz3c-api \
  --region $REGION \
  --set-env-vars GCS_BUCKET=lz3c-invoices-prod,GCS_PROJECT_ID=$PROJECT_ID,USE_CHROMIUM=1
```

Without `GCS_BUCKET`, PDFs are stored under `LOCAL_STORAGE_PATH` inside the container (ephemeral on Cloud Run — use GCS in production).

## Troubleshooting Cloud Build

### `step 0 "Build" failed` with almost no logs

| Cause | Fix |
|-------|-----|
| Trigger uses **Dockerfile at repo root** but file was only under `infra/` | Use **`cloudbuild.yaml` at repo root** or root **`Dockerfile`** (both are in this repo now) |
| Trigger type is **Dockerfile** without `-f infra/Dockerfile` | Edit trigger → **Cloud Build config file** → `cloudbuild.yaml` (or `infra/cloudbuild.yaml`) |
| **No logs** in console | Grant **Logs Writer** to Cloud Build / compute service account (see GCP warning) |
| **Artifact Registry** repo missing | `gcloud artifacts repositories create lz3c --repository-format=docker --location=$REGION` |
| **Secrets** missing at deploy step | Create `lz3c-mongodb-uri`, `lz3c-jwt-secret` in Secret Manager before deploy |

After changing the trigger, run **Retry** on the build. Expand **Step #0** log stream (not only the summary line).

### Trigger settings (recommended)

- **Configuration**: Cloud Build configuration file (YAML)
- **Location**: `cloudbuild.yaml` (repository root) or `infra/cloudbuild.yaml`
- **Single service**: `cloudbuild.yaml`, `_SERVICE_NAME=lz3c`
- **API only**: `infra/cloudbuild.yaml`, `_SERVICE_NAME=lz3c-api`
- **Service account**: needs Artifact Registry Writer + Cloud Run Admin + Secret Accessor

## 7. Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | Atlas connection string |
| `MONGODB_DB_NAME` | Yes | Database name (`lz3c`) |
| `JWT_SECRET` | Yes | Production signing secret |
| `CORS_ORIGIN` | Yes | Web origin(s), comma-separated |
| `PORT` | Cloud Run sets 8080 | Listen port |
| `NODE_ENV` | `production` | Skips `.env.local` file load |
| `STRIPE_*` | Optional | Billing |
| `TWILIO_*` | Optional | Repair SMS |
| `SUPER_ADMIN_EMAILS` | Optional | Super admin on register |

## 7. Health checks

- API: `GET /api/health` — returns MongoDB ping status (used by Docker & Cloud Run).
- Web: nginx serves SPA; `/api/*` proxied to backend.

## 9. CI

GitHub Actions workflow `.github/workflows/ci.yml` builds TypeScript and verifies Docker images on each push/PR.
