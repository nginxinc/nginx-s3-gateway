#!/bin/sh
#
#  Copyright 2020 F5 Networks
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#

# This script checks to see that required environment variables were correctly
# passed into the Docker container.

set -e

failed=0

if [ -z ${S3_ACCESS_KEY_ID+x} ]; then
    >&2 echo "Required S3_ACCESS_KEY_ID environment variable missing"
    failed=1
fi

if [ -z ${S3_SECRET_KEY+x} ]; then
    >&2 echo "Required S3_SECRET_KEY environment variable missing"
    failed=1
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

echo "S3 Backend Environment"
echo "Access Key ID: ${S3_ACCESS_KEY_ID}"
echo "Origin: ${S3_SERVER_PROTO}://${S3_BUCKET_NAME}.${S3_SERVER}:${S3_SERVER_PORT}"
echo "Region: ${S3_REGION}"
echo "Addressing Style: ${S3_STYLE}"
echo "AWS Signatures Version: v${AWS_SIGS_VERSION}"
echo "DNS Resolvers: ${DNS_RESOLVERS}"
