# Testing

## Unit Tests
We are working on an npm-based runner but for now we use the existing flow.  Run `./test.sh` as described in the main README.

## Integration Tests
1. Start the Minio and Gateway containers with `docker compose up --abort-on-container-exit`
2. `npm test`