# NGINX S3 Gateway

This project provides an example of configuring NGINX to act as an authenticating 
and caching gateway for read-only requests (GET/HEAD) to the S3 API.

## Potential Use Cases

 * Providing an authentication gateway using an alternative authentication
   system to S3
 * Caching frequently accessed S3 objects for lower latency delivery and 
   protection against S3 outages
 * For internal/micro services that can't authenticate against the S3 API
   (e.g. don't have libraries available) the gateway can provide a means
   to accessing S3 objects without authentication 
 * Compressing objects ([gzip](examples/gzip-compression), [brotli](examples/brotli-compression)) from gateway to end user
 * Protecting S3 bucket from arbitrary public access and traversal
 * Rate limiting S3 objects
 * Protecting S3 bucket with a [WAF](examples/modsecurity)
 * Serving static assets from a S3 bucket alongside a dynamic application 
   endpoints all in a single RESTful directory structure

## Usage

Few users will find this project as-is to be sufficient for their use cases. As
such, it is best to borrow from the patterns in this project and build your
own configuration. For example, if you want enable SSL/TLS and compression
in your NGINX S3 gateway configuration, you will need to look at other 
resources because this project does not enable those features of NGINX.   

### Building the Docker Image

#### NGINX OSS

In order to build the NGINX OSS container image, do a `docker build` as follows:
```
docker build -f Dockerfile.oss -t nginx-oss-s3-gateway  .
```

#### NGINX Plus

In order to build the NGINX Plus Docker image, copy your NGINX Plus repository 
keys (`nginx-repo.crt` and `nginx-repo.key`) into the `plus/etc/ssl/nginx` 
directory and set the environment variable `NGINX_GPGKEY` with the contents of
your NGINX GPG key. Then build the container image as follows:

```
export NGINX_GPGKEY=<INSERT GPGKEY HERE>
docker build -f Dockerfile.plus -t nginx-plus-s3-gateway --build-arg NGINX_GPGKEY .
``` 

### Configuration

Environment variables are used to configure this project.  

* `AWS_SIGS_VERSION` - AWS Signatures API version - either 2 or 4 (4 is default)
* `DNS_RESOLVERS` - (optional) DNS resolvers (separated by single spaces) to configure NGINX with 
* `S3_ACCESS_KEY_ID` - Access key 
* `S3_BUCKET_NAME` - Name of S3 bucket to proxy requests to
* `S3_DEBUG` - Flag (true/false) enabling AWS signatures debug output (default: false)
* `S3_REGION` - Region associated with API
* `S3_SECRET_KEY` - Secret access key
* `S3_SERVER_PORT` - SSL/TLS port to connect to
* `S3_SERVER_PROTO` - Protocol to used connect to S3 server - `http` or `https` 
* `S3_SERVER` - S3 host to connect to 

The above environment variables can be set in a file that is passed to docker
with the `--env-file` flag. The file would look something like 
[this example](settings.example).

The container can be run by (replacing `oss` with `plus` when invoking the NGINX
Plus container):
```
docker run --env-file ./settings -p80:80 --name nginx-oss-s3-gateway nginx-s3-gateway  
``` 

## Directory Structure and File Descriptions
 
```
etc/             contains files used in both NGINX Plus and OSS configurations
oss/             contains files used solely in NGINX OSS configurations
plus/            contains files used solely in NGINX Plus configurations
test/            contains automated tests for validang that the examples work
Dockerfile.oss   Dockerfile that configures NGINX OSS to act as a S3 gateway
Dockerfile.plus  Dockerfile that builds a NGINX Plus instance that is configured
                 equivelently to NGINX OSS - instance is configured to act as a 
                 S3 gateway with NGINX Plus additional features enabled
settings.example Docker env file example
test.sh          test launcher
```

## Testing

Automated tests require `docker`, `docker-compose`, `curl` and `md5sum` to be
installed. To run all unit tests and integration tests, run the following command.
If you invoke the test script with the plus parameter, you will need to add your
NGINX repository keys to the `plus/etc/ssl/nginx` directory. You will also need
to pass an additional parameter or set the environment variable `NGINX_GPGKEY`
with your NGINX Plus GPG key. 

```
$ ./test.sh <nginx type - 'oss' or 'plus'>
``` 

## License

All code include is licensed under the [Apache 2.0 license](LICENSE.txt).
