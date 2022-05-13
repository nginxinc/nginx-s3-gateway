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
 * Protecting a S3 bucket with a [WAF](examples/modsecurity)
 * Serving static assets from a S3 bucket alongside a dynamic application 
   endpoints all in a single RESTful directory structure

## Usage

Few users will find this project as-is to be sufficient for their use cases. As
such, it is best to borrow from the patterns in this project and build your
own configuration. For example, if you want enable SSL/TLS and compression
in your NGINX S3 gateway configuration, you will need to look at other 
documentation because this project does not enable those features of NGINX.

## Examples

In this project, we provide a few configuration examples that extend the 
base functionality of the NGINX S3 Gateway.

 * [Enabling Brotli Compression in Docker](examples/brotli-compression)
 * [Enabling GZip Compression in Docker](examples/gzip-compression)
 * [Installing Modsecurity in Docker](examples/modsecurity)
 * [Stand-alone Configuration on Ubuntu](examples/ubuntu_install)

### Building the Docker Image

#### NGINX OSS

In order to build the NGINX OSS container image, do a `docker build` as follows:
```
docker build -f Dockerfile.oss -t nginx-oss-s3-gateway  .
```

#### NGINX Plus

In order to build the NGINX Plus Docker image, copy your NGINX Plus repository 
keys (`nginx-repo.crt` and `nginx-repo.key`) into the `plus/etc/ssl/nginx` 
directory. Then build the container image.

If you are using a version of Docker that supports Buildkit, then you can
build the image as follows in order to prevent your private keys from
being stored in the container image.

```
DOCKER_BUILDKIT=1 docker build \
    -f Dockerfile.buildkit.plus \
    -t nginx-plus-s3-gateway \
    --secret id=nginx-crt,src=plus/etc/ssl/nginx/nginx-repo.crt \
    --secret id=nginx-key,src=plus/etc/ssl/nginx/nginx-repo.key \
    --squash .
```

Otherwise, if you don't have Buildkit available, then build as follows. If you
want to remove the private keys from the image, then you may need to do a
post-build squash operation using a utility like 
[docker-squash](https://pypi.org/project/docker-squash/).

```
docker build -f Dockerfile.plus -t nginx-plus-s3-gateway .
``` 

### Configuration

Environment variables are used to configure this project.  

* `ALLOW_DIRECTORY_LIST` - Enable directory listing - either true or false
* `AWS_SIGS_VERSION` - AWS Signatures API version - either 2 or 4
* `DNS_RESOLVERS` - (optional) DNS resolvers (separated by single spaces) to configure NGINX with 
* `S3_ACCESS_KEY_ID` - Access key 
* `S3_BUCKET_NAME` - Name of S3 bucket to proxy requests to
* `S3_DEBUG` - Flag (true/false) enabling AWS signatures debug output (default: false)
* `S3_REGION` - Region associated with API
* `S3_SECRET_KEY` - Secret access key
* `S3_SERVER_PORT` - SSL/TLS port to connect to
* `S3_SERVER_PROTO` - Protocol to used connect to S3 server - `http` or `https` 
* `S3_SERVER` - S3 host to connect to
* `S3_STYLE` - The S3 host/path method - `virtual`, `path` or `default`. `virtual` is
  the method that that uses DNS-style bucket+hostname:port.
  This is the `default` value. `path` is a method that appends the bucket name 
  as the first directory in the URI's path. This method is used by many S3 
  compatible services. See this 
  [AWS blog article](https://aws.amazon.com/blogs/aws/amazon-s3-path-deprecation-plan-the-rest-of-the-story/)
  for further information. 
* `PROXY_CACHE_VALID_OK` - Sets caching time for response code 200 and 302
* `PROXY_CACHE_VALID_NOTFOUND` - Sets caching time for response code 404
* `PROXY_CACHE_VALID_FORBIDDEN` - Sets caching time for response code 403

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
common/          contains files used by both NGINX OSS and Plus configurations
examples/        contains additional `Dockerfile` examples that extend the base 
                 configuration
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

## Directory Listing

Listing of S3 directories ([folders](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-folders.html)) is supported when the `ALLOW_DIRECTORY_LIST` environment variable is set
to `1`. Directory listing output can be customized by changing the [XSL stylesheet](https://www.w3schools.com/xml/xsl_intro.asp): [`common/etc/nginx/include/listing.xsl`](./common/etc/nginx/include/listing.xsl).
If you are not using AWS S3 as your backend, you may see some inconsistency in the
behavior with how directory listing works with HEAD requests. Additionally, due
to limitations in proxy response processing, invalid S3 folder requests will result
in log messages like:
```
 libxml2 error: "Extra content at the end of the document"
```

Another limitation is that when using v2 signatures with HEAD requests, the 
gateway will not return 200 for valid folders. 

## Testing

Automated tests require `docker`, `docker-compose`, `curl` and `md5sum` to be
installed. To run all unit tests and integration tests, run the following command.
If you invoke the test script with the plus parameter, you will need to add your
NGINX repository keys to the `plus/etc/ssl/nginx` directory 

```
$ ./test.sh <nginx type - 'oss' or 'plus'>
``` 

## License

All code include is licensed under the [Apache 2.0 license](LICENSE.txt).
