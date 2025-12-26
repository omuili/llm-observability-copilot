set -e


PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project)}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="llm-observability-copilot"
REPOSITORY="llm-copilot-repo"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }


setup() {
    log_info "Setting up Google Cloud resources..."
    
    echo ""
    log_info "Project: ${PROJECT_ID}"
    log_info "Region: ${REGION}"
    echo ""

   
    log_info "Enabling required APIs..."
    gcloud services enable \
        cloudbuild.googleapis.com \
        run.googleapis.com \
        artifactregistry.googleapis.com \
        secretmanager.googleapis.com \
        aiplatform.googleapis.com \
        firestore.googleapis.com \
        --project="${PROJECT_ID}"
    log_success "APIs enabled"

    log_info "Creating Artifact Registry repository..."
    gcloud artifacts repositories create "${REPOSITORY}" \
        --repository-format=docker \
        --location="${REGION}" \
        --description="LLM Observability Copilot Docker images" \
        --project="${PROJECT_ID}" 2>/dev/null || log_warning "Repository already exists"
    log_success "Artifact Registry ready"

    log_info "Configuring Docker authentication..."
    gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
    log_success "Docker authentication configured"

    if [ -n "${DD_API_KEY}" ]; then
        log_info "Creating Datadog API Key secret..."
        echo -n "${DD_API_KEY}" | gcloud secrets create dd-api-key \
            --data-file=- \
            --project="${PROJECT_ID}" 2>/dev/null || \
        echo -n "${DD_API_KEY}" | gcloud secrets versions add dd-api-key \
            --data-file=- \
            --project="${PROJECT_ID}"
        log_success "DD_API_KEY secret created/updated"
    else
        log_warning "DD_API_KEY not set - skipping secret creation"
    fi

    if [ -n "${DD_APP_KEY}" ]; then
        log_info "Creating Datadog App Key secret..."
        echo -n "${DD_APP_KEY}" | gcloud secrets create dd-app-key \
            --data-file=- \
            --project="${PROJECT_ID}" 2>/dev/null || \
        echo -n "${DD_APP_KEY}" | gcloud secrets versions add dd-app-key \
            --data-file=- \
            --project="${PROJECT_ID}"
        log_success "DD_APP_KEY secret created/updated"
    else
        log_warning "DD_APP_KEY not set - skipping secret creation"
    fi

    log_info "Granting Cloud Run access to secrets..."
    PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
    
    gcloud secrets add-iam-policy-binding dd-api-key \
        --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor" \
        --project="${PROJECT_ID}" 2>/dev/null || true
    
    gcloud secrets add-iam-policy-binding dd-app-key \
        --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor" \
        --project="${PROJECT_ID}" 2>/dev/null || true
    
    log_success "Secret access configured"

    echo ""
    log_success "Setup complete! Run './deploy.sh all' to build and deploy."
}


build() {
    log_info "Building Docker image..."
    
   
    VERSION=$(date +%Y%m%d-%H%M%S)
    
    log_info "Building: ${IMAGE_NAME}:${VERSION}"
    
  
    docker build \
        --platform linux/amd64 \
        -t "${IMAGE_NAME}:${VERSION}" \
        -t "${IMAGE_NAME}:latest" \
        .
    
    log_success "Image built successfully"
    
    log_info "Pushing to Artifact Registry..."
    docker push "${IMAGE_NAME}:${VERSION}"
    docker push "${IMAGE_NAME}:latest"
    
    log_success "Image pushed: ${IMAGE_NAME}:${VERSION}"
    
   
    export IMAGE_TAG="${VERSION}"
}


deploy() {
    log_info "Deploying to Cloud Run..."
    
    IMAGE_TAG="${IMAGE_TAG:-latest}"
    
    gcloud run deploy "${SERVICE_NAME}" \
        --image="${IMAGE_NAME}:${IMAGE_TAG}" \
        --region="${REGION}" \
        --platform=managed \
        --allow-unauthenticated \
        --memory=1Gi \
        --cpu=1 \
        --min-instances=0 \
        --max-instances=10 \
        --set-env-vars="DD_SERVICE=${SERVICE_NAME},DD_ENV=production,DD_VERSION=${IMAGE_TAG},DD_SITE=datadoghq.com" \
        --set-secrets="DD_API_KEY=dd-api-key:latest,DD_APP_KEY=dd-app-key:latest" \
        --project="${PROJECT_ID}"
    
    SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
        --region="${REGION}" \
        --project="${PROJECT_ID}" \
        --format='value(status.url)')
    
    echo ""
    log_success "Deployment complete!"
    echo ""
    echo -e "${GREEN}🚀 Service URL: ${SERVICE_URL}${NC}"
    echo ""
}

local_run() {
    log_info "Starting local development environment..."
    
    if [ -z "${DD_API_KEY}" ]; then
        log_warning "DD_API_KEY not set - Datadog integration will be disabled"
    fi
    
    docker-compose up --build
}


all() {
    build
    deploy
}


case "${1}" in
    setup)
        setup
        ;;
    build)
        build
        ;;
    deploy)
        deploy
        ;;
    all)
        all
        ;;
    local)
        local_run
        ;;
    *)
        echo "LLM Observability Copilot - Deployment Script"
        echo ""
        echo "Usage: $0 {setup|build|deploy|all|local}"
        echo ""
        echo "Commands:"
        echo "  setup   - One-time setup (APIs, Artifact Registry, secrets)"
        echo "  build   - Build and push Docker image"
        echo "  deploy  - Deploy to Cloud Run"
        echo "  all     - Full deployment (build + deploy)"
        echo "  local   - Run locally with Docker Compose"
        echo ""
        echo "Environment variables:"
        echo "  GOOGLE_CLOUD_PROJECT - GCP project ID"
        echo "  REGION              - GCP region (default: us-central1)"
        echo "  DD_API_KEY          - Datadog API key"
        echo "  DD_APP_KEY          - Datadog App key"
        exit 1
        ;;
esac

