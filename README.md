# File Tools Microservice

This Dockerized microservice provides general-purpose tools for file manipulation via HTTP API endpoints on port 5001.

## Dashboard

This service has a web portal to test all the endpoints:

<http://localhost:5001/dashboard>

## API Documentation

- [Image API Endpoints](./docs/api-image.md)

- [PDF API Endpoints](./docs/api-pdf.md)

- [Cache API Endpoints](./docs/api-cache.md)

## Development documentation

- [Development, testing and deployment documentation](./docs/develop-test-publish.md)

## Docker image configuration

The image exposes all the API endpoints on port `5001`.
When using cache features, a volume must be mounted to store the cached data across container restarts.

**Example `docker-compose.yml`**

```yaml
services:
    file-tools:
        image: edertone/file-tools:X.X.X
        ports: # Remove this if you don't want external access to the container
            - '5001:5001'
        volumes:
            - ./my/local/cache-folder:/app/file-tools-cache # Persist cache data on the host
            - ./my/local/logs-folder:/app/logs # Get the relevant logs on the host
```

You can use the docker-compose.yml file at the root of this project to run a local file-tools service
