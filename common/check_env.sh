#!/bin/sh

failed=0

if [ ! -z ${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI+x} ]; then
  echo "Running inside an ECS task, using container credentials"
elif curl --output /dev/null --silent --head --fail --connect-timeout 2 "http://169.254.169.254"; then
  echo "Running inside an EC2 instance, using IMDS for credentials"
else
  if [ -z ${S3_ACCESS_KEY_ID+x} ]; then
      >&2 echo "Required S3_ACCESS_KEY_ID environment variable missing"
      failed=1
  fi

  if [ -z ${S3_SECRET_KEY+x} ]; then
      >&2 echo "Required S3_SECRET_KEY environment variable missing"
      failed=1
  fi
fi

if [ -z ${S3_BUCKET_NAME+x} ]; then
    >&2 echo "Required S3_BUCKET_NAME environment variable missing"
    failed=1
fi

if [ -z ${S3_SERVER+x} ]; then
    >&2 echo "Required S3_SERVER environment variable missing"
    failed=1
fi

if [ -z ${S3_SERVER_PORT+x} ]; then
    >&2 echo "Required S3_SERVER_PORT environment variable missing"
    failed=1
fi

if [ -z ${S3_SERVER_PROTO+x} ]; then
    >&2 echo "Required S3_SERVER_PROTO environment variable missing"
    failed=1
fi

if [ "${S3_SERVER_PROTO}" != "http" ] && [ "${S3_SERVER_PROTO}" != "https" ]; then
    >&2 echo "S3_SERVER_PROTO contains an invalid value (${S3_SERVER_PROTO}). Valid values: http, https"
    failed=1
fi

if [ -z ${S3_REGION+x} ]; then
    >&2 echo "Required S3_REGION environment variable missing"
    failed=1
fi

if [ -z ${S3_STYLE+x} ]; then
    >&2 echo "Required S3_STYLE environment variable missing"
    failed=1
fi

if [ -z ${ALLOW_DIRECTORY_LIST+x} ]; then
    >&2 echo "Required ALLOW_DIRECTORY_LIST environment variable missing"
    failed=1
fi

if [ -z ${AWS_SIGS_VERSION+x} ]; then
    >&2 echo "Required AWS_SIGS_VERSION environment variable missing"
    failed=1
fi

if [ "${AWS_SIGS_VERSION}" != "2" ] && [ "${AWS_SIGS_VERSION}" != "4" ]; then
  >&2 echo "AWS_SIGS_VERSION contains an invalid value (${AWS_SIGS_VERSION}). Valid values: 2, 4"
  failed=1
fi

if [ $failed -gt 0 ]; then
  exit 1
fi
