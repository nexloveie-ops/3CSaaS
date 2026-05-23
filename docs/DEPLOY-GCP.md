# Deploy LZ3C to GCP (Cloud Run)

Production layout:

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
  --substitutions=_REGION=$REGION,_SERVICE=lz3c-api
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
  --substitutions=_REGION=$REGION,_SERVICE=lz3c-web,_API_UPSTREAM=${API_URL}/api/
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
