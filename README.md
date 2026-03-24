# File Tools Microservice

This Dockerized microservice provides general-purpose tools for file manipulation via HTTP API endpoints on port 5001.

## Docker image configuration

The image exposes all the API endpoints on port `5001`.
When using cache features, a volume must be mounted to store the cached data across container restarts.

**Example `docker-compose.yml`**

```yaml
services:
    file-tools:
        image: edertone/file-tools:X.X.X
        ports: # Remove if you don't want external access to this container
            - '5001:5001'
        volumes:
            # Persist cache data on the host
            - ./my/local/cache-folder:/app/file-tools-cache
            # Get the relevant logs on the host
            - ./my/local/logs-folder:/app/logs
```

You can use the docker-compose.yml file at the root of this project to run a local file-tools service and dashboard:

<http://localhost:5001/dashboard>

## API Documentation

- [Image API Endpoints](./docs/api-image.md)

- [PDF API Endpoints](./docs/api-pdf.md)

- [Cache API Endpoints](./docs/api-cache.md)

## Development documentation

- [Development, testing and deployment documentation](./docs/develop-test-publish.md)
