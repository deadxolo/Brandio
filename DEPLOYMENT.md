# Deployment Guide

## Docker Deployment

### Local Docker Build & Run

```bash
# Build the image
docker build -t social-media-manager .

# Generate encryption key for OAuth tokens (required)
export TOKEN_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Run the container
docker run -d \
  -p 8080:8080 \
  -p 3001:3001 \
  -p 3002:3002 \
  -p 3003:3003 \
  -e GEMINI_API_KEY=your_gemini_api_key \
  -e META_APP_ID=your_meta_app_id \
  -e META_APP_SECRET=your_meta_app_secret \
  -e TOKEN_ENCRYPTION_KEY=$TOKEN_KEY \
  --name social-media-manager \
  social-media-manager
```

### Docker Compose

```bash
# Create .env file with your API keys
cp .env.example .env
# Edit .env and add your API keys

# Start with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Google Cloud Run Deployment

### Prerequisites

1. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
2. Authenticate: `gcloud auth login`
3. Set project: `gcloud config set project YOUR_PROJECT_ID`
4. Enable required APIs:
   ```bash
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable run.googleapis.com
   gcloud services enable containerregistry.googleapis.com
   ```

### Deploy to Cloud Run

#### Option 1: Using Cloud Build (Recommended)

```bash
# Deploy using cloudbuild.yaml
gcloud builds submit --config cloudbuild.yaml

# Or with custom region
gcloud builds submit --config cloudbuild.yaml --substitutions=_REGION=us-east1
```

#### Option 2: Manual Deployment

```bash
# Build and push image
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/social-media-manager

# Deploy to Cloud Run
gcloud run deploy social-media-manager \
  --image gcr.io/YOUR_PROJECT_ID/social-media-manager \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --port 8080 \
  --set-env-vars "NODE_ENV=production"
```

### Setting Environment Variables on Cloud Run

```bash
# Set secrets/environment variables
# Note: TOKEN_ENCRYPTION_KEY is required for OAuth token encryption
gcloud run services update social-media-manager \
  --region us-central1 \
  --set-env-vars "GEMINI_API_KEY=your_key,META_APP_ID=your_id,META_APP_SECRET=your_secret,TOKEN_ENCRYPTION_KEY=your_32_byte_hex_key"

# Or use Secret Manager (recommended for production)
gcloud run services update social-media-manager \
  --region us-central1 \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest,META_APP_SECRET=meta-app-secret:latest"
```

## Service Ports

| Service | Default Port | Environment Variable |
|---------|-------------|---------------------|
| Manager (Dashboard) | 8080 (Cloud Run) / 3000 | `PORT` or `MANAGER_PORT` |
| Background Engine | 3001 | `BG_ENGINE_PORT` |
| Post Generator | 3002 | `POST_GEN_PORT` |
| Auto Poster | 3003 | `AUTO_POSTER_PORT` |

## Health Check

The manager service exposes a health check endpoint:

```
GET /api/health
```

Response:
```json
{
  "status": "healthy",
  "service": "manager",
  "timestamp": "2024-01-26T12:00:00.000Z"
}
```

## Persistent Storage (Cloud Run)

Cloud Run is stateless. For production, consider:

1. **Cloud SQL** - For the database
2. **Cloud Storage** - For uploaded images and backgrounds
3. **Firestore** - Alternative NoSQL database

Example Cloud Storage integration would require updating the upload handlers to use `@google-cloud/storage`.

## Troubleshooting

### Container won't start
- Check logs: `docker logs social-media-manager`
- Verify environment variables are set
- Ensure port 8080 is not in use

### Cloud Run deployment fails
- Check Cloud Build logs in GCP Console
- Verify all required APIs are enabled
- Check IAM permissions

### Services can't communicate
- In Docker, all services run in the same container and communicate via localhost
- Ensure HOST environment variable is set to `0.0.0.0`
