#!/bin/sh

failed=0

required=("S3_BUCKET_NAME" "S3_SERVER" "S3_SERVER_PORT" "S3_SERVER_PROTO"
"S3_REGION" "S3_STYLE" "ALLOW_DIRECTORY_LIST" "AWS_SIGS_VERSION")

if [ ! -z ${AWS_CONTAINER_CREDENTIALS_RELATIVE_URI+x} ]; then
  echo "Running inside an ECS task, using container credentials"
elif curl --output /dev/null --silent --head --fail --connect-timeout 2 "http://169.254.169.254"; then
  echo "Running inside an EC2 instance, using IMDS for credentials"
else
  required+=("S3_ACCESS_KEY_ID" "S3_SECRET_KEY")
fi

for name in ${required[@]}; do
  if [ -z ${!name+x} ]; then
      >&2 echo "Required ${name} environment variable missing"
      failed=1
  fi
done

if [ "${S3_SERVER_PROTO}" != "http" ] && [ "${S3_SERVER_PROTO}" != "https" ]; then
    >&2 echo "S3_SERVER_PROTO contains an invalid value (${S3_SERVER_PROTO}). Valid values: http, https"
    failed=1
fi

if [ "${AWS_SIGS_VERSION}" != "2" ] && [ "${AWS_SIGS_VERSION}" != "4" ]; then
  >&2 echo "AWS_SIGS_VERSION contains an invalid value (${AWS_SIGS_VERSION}). Valid values: 2, 4"
  failed=1
fi
