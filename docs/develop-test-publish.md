# File Tools Microservice

## Build & Run Locally

Open a cmd at the /file-tools folder and run:

```bash
npm run rebuild-start
```

## Run tests

- Make sure /file-tools packages are installed (npm ci)
- Make sure the container is running on your local machine (npm run rebuild-start)
- Open another cmd at file-tools folder and run:

```bash
npm run test
```

## Publish to docker hub

- Make sure docker is running
- Open a **power shell** terminal at the file-tools/docker folder
- Run all this code at once:

```powershell
docker login; `
$VERSION = (Get-Content ../VERSION).Trim(); `
docker build -t edertone/file-tools:$VERSION .; `
docker push edertone/file-tools:$VERSION
```

- Now increase the value on the file-tools/VERSION file and commit it to Git indicating which version was published
