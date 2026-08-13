set dotenv-load := true

project_root := justfile_directory()

# Build the API, dashboard, and on-demand browser worker image.
build:
    SCRAPER_HOST_ROOT="{{project_root}}" docker compose --profile workers build

# Start the complete control plane. Browser workers start on demand from the UI/API.
start:
    SCRAPER_HOST_ROOT="{{project_root}}" docker compose up -d --remove-orphans --wait control-api dashboard
    @echo "Evidence Control: http://127.0.0.1:3100"
    @echo "API documentation: http://127.0.0.1:8080/docs"