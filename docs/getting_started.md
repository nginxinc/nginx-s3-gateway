# Getting Started Guide

## Contents

[Configuration](#configuration)  
[Running as a Systemd Service](#running-as-a-systemd-service)  
[Running in Containers](#running-in-containers)  
[Running Using AWS Instance Profile Credentials](#running-using-aws-instance-profile-credentials)  
[Troubleshooting](#troubleshooting)  

## Configuration

The following environment variables are used to configure the gateway when
running as a Container or as a Systemd service.

* `ALLOW_DIRECTORY_LIST` - Flag (true/false) enabling directory listing (default: false)
* `PROVIDE_INDEX_PAGE` - Flag (true/false) which returns the index page if there is one when requesting a directory. Cannot be enabled with `ALLOW_DIRECTORY_LIST`. (default: false)
* `APPEND_SLASH_FOR_POSSIBLE_DIRECTORY` - Flag (true/false) enabling the return a 302 with a `/` appended to the path. This is independent of the behavior selected in `ALLOW_DIRECTORY_LIST` or `PROVIDE_INDEX_PAGE`. (default: false)
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
* `JS_TRUSTED_CERT_PATH` - (optional) Enables the `js_fetch_trusted_certificate` directive when retrieving AWS credentials and sets the path (on the container) to the specified path 
* `CORS_ALLOW_ALL` - Flag (true/false) - Whether to add CORS headers on GET/POST request and to allow OPTIONS requests. If enabled, this will add CORS headers for "fully open" cross domain requests, meaning all domains are allowed, similar to the settings show in [this example](https://enable-cors.org/server_nginx.html). (default: false)

If you are using [AWS instance profile credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2.html),
you will need to omit the `S3_ACCESS_KEY_ID` and `S3_SECRET_KEY` variables from
the configuration.

When running with Docker, the above environment variables can be set in a file 
with the `--env-file` flag. When running as a Systemd service, the environment
variables are specified in the `/etc/nginx/environment` file. An example of
the format of the file can be found in the [settings.example](/settings.example)
file.
  
There are few optional environment variables that can be used.

* `HOSTNAME` - (optional) The value will be used for Role Session Name. The default value is nginx-s3-gateway.
* `STS_ENDPOINT` - (optional) Overrides the STS endpoint to be used in applicable setups. This is not required when running on EKS. See the EKS portion of the guide below for more details.
* `AWS_STS_REGIONAL_ENDPOINTS` - (optional) Allows for a regional STS endpoint to be
  selected. When the regional model is selected then the STS endpoint generated will
  be coded to the current AWS region. This environment variable will be ignored if
  `STS_ENDPOINT` is set. Valid options are: `global` (default) or `regional`.


### Configuring Directory Listing

Listing of S3 directories ([folders](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-folders.html)) is supported when the
`ALLOW_DIRECTORY_LIST` environment variable is set to `1`. Directory listing 
output can be customized by changing the
[XSL stylesheet](https://www.w3schools.com/xml/xsl_intro.asp): [`common/etc/nginx/include/listing.xsl`](/common/etc/nginx/include/listing.xsl).
If you are not using AWS S3 as your backend, you may see some inconsistency in 
the behavior with how directory listing works with HEAD requests. Additionally,
due to limitations in proxy response processing, invalid S3 folder requests will 
result in log messages like:
```
 libxml2 error: "Extra content at the end of the document"
```

Another limitation is that when using v2 signatures with HEAD requests, the
gateway will not return 200 for valid folders.

### Static Site Hosting

When `PROVIDE_INDEX_PAGE` environment variable is set to 1, the gateway will
transform `/some/path/` to `/some/path/index.html` when retrieving from S3.  
Default of "index.html" can be edited in `s3gateway.js`. 
It will also redirect `/some/path` to `/some/path/` when S3 returns 404 on 
`/some/path` if `APPEND_SLASH_FOR_POSSIBLE_DIRECTORY` is set. `path` has to 
look like a possible directory, it must not start with a `.` and not have an 
extension.  

## Running as a Systemd Service

A [install script](/standalone_ubuntu_oss_install.sh) for the gateway shows
how to install NGINX from a package repository, checkout the gateway source, 
and configure it using the supplied environment variables.

To run the script copy it to your destination system, load the environment
variables mentioned in the [configuration section](#configuration) into memory,
and then execute the script. The script takes one optional parameter that 
specifies the name of the branch to download files from.

## Running in Containers

### Running the Public Open Source NGINX Container Image

The latest builds of the gateway (that use open source NGINX) are available on 
the project's Github [package repository](https://github.com/nginxinc/nginx-s3-gateway/pkgs/container/nginx-s3-gateway%2Fnginx-oss-s3-gateway).

To run with the public open source image, replace the `settings` file specified
below with a file containing your settings, and run the following command:
```
docker run --env-file ./settings --publish 80:80 --name nginx-s3-gateway \
    ghcr.io/nginxinc/nginx-s3-gateway/nginx-oss-s3-gateway:latest
```

If you would like to run with the latest njs version, run:
```
docker run --env-file ./settings --publish 80:80 --name nginx-s3-gateway \
    ghcr.io/nginxinc/nginx-s3-gateway/nginx-oss-s3-gateway:latest-njs-oss 
```

Alternatively, if you would like to pin your version to a specific point in
time release, find the version with an embedded date and run:
```
docker run --env-file ./settings --publish 80:80 --name nginx-s3-gateway \
    ghcr.io/nginxinc/nginx-s3-gateway/nginx-oss-s3-gateway:latest-njs-oss-20220310
```

### Building the Public Open Source NGINX Container Image

In order to build the NGINX OSS container image, do a `docker build` as follows
from the project root directory:

```
docker build --file Dockerfile.oss --tag nginx-s3-gateway:oss --tag nginx-s3-gateway .
```

Alternatively, if you would like to use the latest version of
[njs](https://nginx.org/en/docs/njs/), you can build an image from the latest 
njs source by building this image after building the parent image above:
```
docker build --file Dockerfile.oss --tag nginx-s3-gateway --tag nginx-s3-gateway:latest-njs-oss .
```

After building, you can run the image by issuing the following command and 
replacing the path to the `settings` file with a file containing your specific
environment variables.
```
docker run --env-file ./settings --publish 80:80 --name nginx-s3-gateway \
    nginx-s3-gateway:oss
```

### Building the NGINX Plus Container Image

In order to build the NGINX Plus container image, copy your NGINX Plus 
repository keys (`nginx-repo.crt` and `nginx-repo.key`) into the 
`plus/etc/ssl/nginx` directory before building.

If you are using a version of Docker that supports Buildkit, then you can
build the image as follows in order to prevent your private keys from
being stored in the container image.

To build, run the following from the project root directory:

```
DOCKER_BUILDKIT=1 docker build \
    --file Dockerfile.buildkit.plus \
    --tag nginx-plus-s3-gateway --tag nginx-plus-s3-gateway:plus \
    --secret id=nginx-crt,src=plus/etc/ssl/nginx/nginx-repo.crt \
    --secret id=nginx-key,src=plus/etc/ssl/nginx/nginx-repo.key \
    --squash .
```

Otherwise, if you don't have Buildkit available, then build as follows. If you
want to remove the private keys from the image, then you may need to do a
post-build squash operation using a utility like
[docker-squash](https://pypi.org/project/docker-squash/).

```
docker build --file Dockerfile.plus --tag nginx-plus-s3-gateway --tag nginx-plus-s3-gateway:plus .
``` 

Alternatively, if you would like to use the latest version of
[njs](https://nginx.org/en/docs/njs/) with NGINX Plus, you can build an image
from the latest njs source by building this image after building the parent 
image above:
```
docker build --file Dockerfile.oss --tag nginx-s3-gateway --tag nginx-s3-gateway:latest-njs-plus .
```

After building, you can run the image by issuing the following command and
replacing the path to the `settings` file with a file containing your specific
environment variables.
```
docker run --env-file ./settings --publish 80:80 --name nginx-s3-gateway \
    nginx-s3-gateway:plus
```

## Running Using AWS Instance Profile Credentials

[AWS instance profiles](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html#ec2-instance-profile)
allow you to assign a role to a compute so that other AWS services can trust
the instance without having to store authentication keys in the compute 
instance. This is useful for the gateway because it allows us to run the
gateway without storing an unchanging `S3_ACCESS_KEY_ID` and `S3_SECRET_KEY` 
in a file on disk or in an easily read environment variable.

Instance profiles work by providing credentials to the instance via the
[AWS Metadata API](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html).
When the API is queried, it provides the keys allowed to the instance. Those
keys regularly expire, so services using them must refresh frequently.

### Running in EC2 with an IAM Policy

Following the [AWS documentation](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html#permission-to-pass-iam-roles)
we can create a IAM role and launch an instance associated with it. On that
instance, if we run the gateway as a Systemd service there are no additional
steps. We just run the install script without specifying the
`S3_ACCESS_KEY_ID` and `S3_SECRET_KEY` environment variables.

However, if we want to run the gateway as a container instance on that 
EC2 instance, then we will need to run the following command using the AWS
CLI tool to allow the metadata endpoint to be accessed from within a container.

```
aws ec2 modify-instance-metadata-options --instance-id <instance id> \
    --http-put-response-hop-limit 3 --http-endpoint enabled
```

After that has been run we can start the container normally and omit the
`S3_ACCESS_KEY_ID` and `S3_SECRET_KEY` environment variables.

### Running in ECS with an IAM Policy

The commands below all reference the [`deployments/ecs/cloudformation/s3gateway.cf`](/deployments/ecs/cloudformation/s3gateway.yaml) file. This file will need to be
modified.

- Update the following 4 parameters in the `Parameters` section of the CloudFormation file for your specific AWS account:
  - `NewBucketName` - any S3 bucket name. Remember that S3 bucket names must be globally unique
  - `VpcId` - Any VPC ID on your AWS account
  - `Subnet1` - Any subnet ID that's in the VPC used above
  - `Subnet2` - Any subnet ID that's in the VPC used above
- Run the following command to deploy the stack (this assumes you have the AWS CLI & credentials setup correctly on your host machine and you are running in the project root directory):

  ```sh
  aws cloudformation create-stack \
    --stack-name nginx-s3-gateway \
    --capabilities CAPABILITY_NAMED_IAM \
    --template-body file://deployments/ecs/cloudformation/s3gateway.yaml
  ```

- Wait for the CloudFormation Stack deployment to complete
  (can take about 3-5 minutes)
  - You can query the stack status with this command:
    ```sh
    aws cloudformation describe-stacks \
      --stack-name nginx-s3-gateway \
      --query "Stacks[0].StackStatus"
    ```
- Wait until the query above shows `"CREATE_COMPLETE"`
- Run the following command to get the URL used to access the service:
  ```sh
  aws cloudformation describe-stacks \
    --stack-name nginx-s3-gateway \
    --query "Stacks[0].Outputs[0].OutputValue"
  ```
  - Upload a file to the bucket first to prevent getting a `404` when visiting 
    the URL in your browser
  ```sh
  # i.e.
  aws s3 cp README.md s3://<bucket_name>
  ```
- View the container logs in CloudWatch from the AWS web console
- Run the following command to delete the stack and all resources:
  ```sh
  aws cloudformation delete-stack \
    --stack-name nginx-s3-gateway
  ```

## Running on EKS with IAM roles for service accounts

If you are planning to use the container image on an EKS cluster, you can use a [service account]((https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)) which can assume a role using [AWS Security Token Service](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html).

- Create a new [AWS IAM OIDC Provider](https://docs.aws.amazon.com/eks/latest/userguide/enable-iam-roles-for-service-accounts.html). If you are using AWS EKS Cluster, then the IAM OIDC Provider should already be created as the part of cluster creation. So validate it before you create the new IAM OIDC Provider.
- Configuring a [Kubernetes service account to assume an IAM role](https://docs.aws.amazon.com/eks/latest/userguide/associate-service-account-role.html)
- [Annotate the Service Account](https://docs.aws.amazon.com/eks/latest/userguide/cross-account-access.html) using IAM Role create in the above step.
- [Configure your pods, Deployments, etc to use the Service Account](https://docs.aws.amazon.com/eks/latest/userguide/pod-configuration.html)
- As soon as the pods/deployments are updated, you will see the couple of Env Variables listed below in the pods.
  - `AWS_ROLE_ARN` - Contains IAM Role ARN
  - `AWS_WEB_IDENTITY_TOKEN_FILE`  - Contains the token which will be used to create temporary credentials using AWS Security Token Service.

The following is a minimal set of resources to deploy:
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: nginx-s3-gateway
  annotations:
    eks.amazonaws.com/role-arn: "<role-arn>"
    # See https://docs.aws.amazon.com/eks/latest/userguide/configure-sts-endpoint.html
    eks.amazonaws.com/sts-regional-endpoints: "true"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-s3-gateway
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx-s3-gateway
  template:
    metadata:
      labels:
        app: nginx-s3-gateway
    spec:
      serviceAccountName: nginx-s3-gateway
      containers:
        - name: nginx-s3-gateway
          image: "ghcr.io/nginxinc/nginx-s3-gateway/nginx-oss-s3-gateway:latest-20220916"
          imagePullPolicy: IfNotPresent
          env:
            - name: S3_BUCKET_NAME
              value: "<bucket>"
            - name: S3_SERVER
              value: "s3.<aws region>.amazonaws.com"
            - name: S3_SERVER_PROTO
              value: "https"
            - name: S3_SERVER_PORT
              value: "443"
            - name: S3_STYLE
              value: "virtual"
            - name: S3_REGION
              value: "<aws region>"
            - name: AWS_SIGS_VERSION
              value: "4"
            - name: ALLOW_DIRECTORY_LIST
              value: "false"
            - name: PROVIDE_INDEX_PAGE
              value: "false"
          ports:
            - name: http
              containerPort: 80
              protocol: TCP
          livenessProbe:
            httpGet:
              path: /health
              port: http
          readinessProbe:
            httpGet:
              path: /health
              port: http
```

## Troubleshooting

### Disable default `404` error message
The default behavior of the container is to return a `404` error message for any non-`200` response code. This is implemented as a security feature to sanitize any error response from the S3 bucket being proxied. For container debugging purposes, this sanitization can be turned off by commenting out the following lines within [`default.conf.template`](https://github.com/nginxinc/nginx-s3-gateway/blob/master/common/etc/nginx/templates/default.conf.template). 
```bash
proxy_intercept_errors on;
error_page 400 401 402 403 404 405 406 407 408 409 410 411 412 413 414 415 416 417 418 420 422 423 424 426 428 429 431 444 449 450 451 500 501 502 503 504 505 506 507 508 509 510 511 =404 @error404;
```

### Error `403 Access Denied` for AWS Accounts with MFA Enabled
The REST authentication method used in this container does not work with AWS IAM roles that have MFA enabled for authentication. Please use AWS IAM role credentials that do not have MFA enabled. 
