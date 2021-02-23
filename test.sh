#!/usr/bin/env bash

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

set -o errexit   # abort on nonzero exit status
set -o nounset   # abort on unbound variable
set -o pipefail  # don't hide errors within pipes

nginx_server_proto="http"
nginx_server_host="localhost"
nginx_server_port="8989"
minio_server="http://localhost:9090"
test_server="${nginx_server_proto}://${nginx_server_host}:${nginx_server_port}"
test_fail_exit_code=2
no_dep_exit_code=3
test_dir="$(pwd)/test"
test_compose_config="${test_dir}/docker-compose.yaml"
test_compose_project="ngt"

p() {
  printf "\033[34;1m▶\033[0m "
  echo "$1"
}

e() {
  >&2 echo "$1"
}

if [ $# -eq 0 ]; then
  nginx_type="oss"
  p "No argument specified - defaulting to NGINX OSS. Valid arguments: oss, plus"
elif [ "$1" = "plus" ]; then
  nginx_type="plus"
  p "Testing with NGINX Plus"
else
  nginx_type="oss"
  p "Testing with NGINX OSS"
fi

docker_cmd="$(command -v docker)"
if ! [ -x "${docker_cmd}" ]; then
  e "required dependency not found: docker not found in the path or not executable"
  exit ${no_dep_exit_code}
fi

docker_compose_cmd="$(command -v docker-compose)"
if ! [ -x "${docker_compose_cmd}" ]; then
  e "required dependency not found: docker-compose not found in the path or not executable"
  exit ${no_dep_exit_code}
fi

curl_cmd="$(command -v curl)"
if ! [ -x "${curl_cmd}" ]; then
  e "required dependency not found: curl not found in the path or not executable"
  exit ${no_dep_exit_code}
fi

wait_for_it_cmd="$(command -v wait-for-it)"
if [ -x "${wait_for_it_cmd}" ]; then
  wait_for_it_installed=1
else
  e "wait-for-it command not available, consider installing to prevent race conditions"
  wait_for_it_installed=0
fi

if [ "${nginx_type}" = "plus" ]; then
  if [ -z "${NGINX_GPGKEY+x}" ] && [ -z "$1" ]; then
    e "NGINX_GPGKEY environment variable containing NGINX+ GPG key was not found"
    exit ${no_dep_exit_code}
  fi

  if [ -z "${NGINX_GPGKEY+x}" ] && [ -n "$1" ]; then
    p "Using GPG key from script parameter"
    export NGINX_GPGKEY="$2"
  fi

  if [ ! -f "./plus/etc/ssl/nginx/nginx-repo.crt" ]; then
    e "NGINX Plus certificate file not found: $(pwd)/plus/etc/ssl/nginx/nginx-repo.crt"
    exit ${no_dep_exit_code}
  fi

    if [ ! -f "./plus/etc/ssl/nginx/nginx-repo.key" ]; then
    e "NGINX Plus key file not found: $(pwd)/plus/etc/ssl/nginx/nginx-repo.key"
    exit ${no_dep_exit_code}
  fi
fi

compose() {
  ${docker_compose_cmd} -f "${test_compose_config}" -p "${test_compose_project}" "$@"
}

integration_test() {
  printf "\033[34;1m▶\033[0m"
  printf "\e[1m Integration test suite for v%s signatures\e[22m\n" "$1"

  # See if Minio is already running, if it isn't then we don't need to build it
  if [ -z "$(docker ps -q -f name=${test_compose_project}_minio_1)" ]; then
    p "Building Docker Compose environment"
    AWS_SIGS_VERSION=$1 compose up --no-start

    p "Adding test data to container"
    echo "Copying contents of ${test_dir}/data to Docker container ${test_compose_project}_minio_1:/"
    ${docker_cmd} cp "${test_dir}/data" ${test_compose_project}_minio_1:/
    echo "Docker diff output:"
    ${docker_cmd} diff ${test_compose_project}_minio_1
  fi

  p "Starting Docker Compose Environment"
  AWS_SIGS_VERSION=$1 compose up -d

  if [ ${wait_for_it_installed} ]; then
    # Hit minio's health check end point to see if it has started up
    for (( i=1; i<=3; i++ ))
    do
      echo "Querying minio server to see if it is ready"
      minio_is_up="$(${curl_cmd} -s -o /dev/null -w '%{http_code}' ${minio_server}/minio/health/cluster)"
      if [ "${minio_is_up}" = "200" ]; then
        break
      else
        sleep 2
      fi
    done

    $wait_for_it_cmd -h ${nginx_server_host} -p ${nginx_server_port}
  fi

  p "Starting HTTP API tests (v$1 signatures)"
  bash "${test_dir}/integration/test_api.sh" "$test_server" "$test_dir"

  # We check to see if NGINX is in fact using the correct version of AWS
  # signatures as it was configured to do.
  sig_versions_found_count=$(compose logs nginx-s3-gateway | grep -c "AWS Signatures Version: v$1\|AWS v$1 Auth")

  if [ "${sig_versions_found_count}" -lt 3 ]; then
    e "NGINX was not detected as using the correct signatures version - examine logs"
    compose logs nginx-s3-gateway
    exit "$test_fail_exit_code"
  fi
}

finish() {
  result=$?

  if [ $result -ne 0 ]; then
    e "Error running tests - outputting container logs"
    compose logs
  fi

  p "Cleaning up Docker compose environment"
  compose stop
  compose rm -f

  exit ${result}
}
trap finish EXIT ERR SIGTERM SIGINT

p "Building NGINX S3 gateway Docker image"
if [ "${nginx_type}" = "plus" ]; then
  docker build -f Dockerfile.${nginx_type} -t nginx-s3-gateway --build-arg NGINX_GPGKEY .
else
  docker build -f Dockerfile.${nginx_type} -t nginx-s3-gateway .
fi

### UNIT TESTS

p "Running unit tests in Docker image"
${docker_cmd} run \
  --rm \
  -v "$(pwd)/test/unit:/var/tmp" \
  --workdir /var/tmp \
  -e "S3_DEBUG=true" \
  -e "S3_STYLE=virtual" \
  --entrypoint /usr/bin/njs \
  nginx-s3-gateway -t module -p '/etc/nginx' /var/tmp/s3gateway_test.js

### INTEGRATION TESTS

# Test API with AWS Signature V2
integration_test 2

# Stop NGINX container, so it can be restarted with a different AWS
# signatures version
compose stop nginx-s3-gateway

# Test API with AWS Signature V4
integration_test 4

p "All tests complete"
