# Development Guide

## Extending the Gateway

In the [examples/ directory](/examples), there are `Dockerfile` examples that 
show how to extend the base functionality of the NGINX S3 Gateway by adding
additional modules.

* [Enabling Brotli Compression in Docker](/examples/brotli-compression)
* [Enabling GZip Compression in Docker](/examples/gzip-compression)
* [Installing Modsecurity in Docker](/examples/modsecurity)

## Testing

Automated tests require `docker`, `docker-compose`, `curl` and `md5sum` to be
installed. To run all unit tests and integration tests, run the following command.
If you invoke the test script with a plus parameter, you will need to add your
NGINX repository keys to the `plus/etc/ssl/nginx` directory

```
$ ./test.sh <nginx type - 'oss', 'latest-njs-oss', 'plus', or 'latest-njs-plus'>
```
