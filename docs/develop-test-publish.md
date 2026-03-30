# File Tools Microservice

## Build & Run Locally

Open a cmd at the root folder and run:

```bash
docker compose up -d --build
```

Launch the dashboard at:

<http://localhost:5001/dashboard>

## Run tests

- Make sure test packages are installed (npm ci)
- Make sure the container is running on your local machine
- Open a cmd at file-tools root folder and run:

```bash
npm run test
```

## Publish to docker hub

- Commit files to github and create a version tag
- Make sure docker is running
- Open a **power shell** terminal at the file-tools/docker folder
- Run all this code at once:

```powershell
docker login; `
$VERSION = your-tag-version; `
docker build -t edertone/file-tools:$VERSION .; `
docker push edertone/file-tools:$VERSION
```
