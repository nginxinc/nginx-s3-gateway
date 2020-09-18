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

test_server=$1
test_dir=$2
test_fail_exit_code=2
no_dep_exit_code=3
checksum_length=32

e() {
  >&2 echo "$1"
}

if [ -z "${test_server}" ]; then
  e "missing first parameter: test server location (eg http://localhost:80)"
fi

if [ -z "${test_dir}" ]; then
  e "missing second parameter: path to test data directory"
fi

curl_cmd="$(command -v curl)"
if ! [ -x "${curl_cmd}" ]; then
  e "required dependency not found: curl not found in the path or not executable"
  exit ${no_dep_exit_code}
fi

checksum_cmd="$(command -v md5sum)"
if ! [ -x "${curl_cmd}" ]; then
  e "required dependency not found: md5sum not found in the path or not executable"
  exit ${no_dep_exit_code}
fi

assertHttpRequestEquals() {
  method="$1"
  path="$2"
  uri="${test_server}/${path}"

  printf "  \033[36;1m▲\033[0m "
  echo "Testing object: ${method} ${path}"

  if [ "${method}" = "HEAD" ]; then
    expected_response_code="$3"
    actual_response_code="$(${curl_cmd} -s -o /dev/null -w '%{http_code}' --head "${uri}")"

    if [ "${expected_response_code}" != "${actual_response_code}" ]; then
      e "Response code didn't match expectation. Request [${method} ${uri}] Expected [${expected_response_code}] Actual [${actual_response_code}]"
      exit ${test_fail_exit_code}
    fi
  elif [ "${method}" = "GET" ]; then
    body_data_path="${test_dir}/$3"
    checksum_output="$(${checksum_cmd} "${body_data_path}")"
    expected_checksum="${checksum_output:0:${checksum_length}}"

    curl_checksum_output="$(${curl_cmd} -s -X "${method}" "${uri}" | ${checksum_cmd})"
    s3_file_checksum="${curl_checksum_output:0:${checksum_length}}"

    if [ "${expected_checksum}" != "${s3_file_checksum}" ]; then
      e "Checksum doesn't match expectation. Request [${method} ${uri}] Expected [${expected_checksum}] Actual [${s3_file_checksum}]"
      exit ${test_fail_exit_code}
    fi
  else
    e "Method unsupported: [${method}]"
  fi
}

# Ordinary filenames

assertHttpRequestEquals "HEAD" "a.txt" "200"
assertHttpRequestEquals "HEAD" "a.txt?some=param&that=should&be=stripped#aaah" "200"
assertHttpRequestEquals "HEAD" "b/c/d.txt" "200"
assertHttpRequestEquals "HEAD" "b/c/../e.txt" "200"
assertHttpRequestEquals "HEAD" "b/e.txt" "200"
assertHttpRequestEquals "HEAD" "b//e.txt" "200"
assertHttpRequestEquals "HEAD" "b/ブツブツ.txt" "200"

# Weird filenames
assertHttpRequestEquals "HEAD" "b/c/=" "200"
assertHttpRequestEquals "HEAD" "b/c/@" "200"

# Expected 404s
assertHttpRequestEquals "HEAD" "not found" "404"
assertHttpRequestEquals "HEAD" "b/" "404"
assertHttpRequestEquals "HEAD" "b/c" "404"
assertHttpRequestEquals "HEAD" "/b/c/" "404"
assertHttpRequestEquals "HEAD" "b//c" "404"
assertHttpRequestEquals "HEAD" "/" "404"
assertHttpRequestEquals "HEAD" "/soap" "404"

# Verify GET is working
assertHttpRequestEquals "GET" "a.txt" "data/bucket-1/a.txt"
assertHttpRequestEquals "GET" "a.txt?some=param&that=should&be=stripped#aaah" "data/bucket-1/a.txt"
assertHttpRequestEquals "GET" "b/c/d.txt" "data/bucket-1/b/c/d.txt"
assertHttpRequestEquals "GET" "b/c/=" "data/bucket-1/b/c/="
assertHttpRequestEquals "GET" "b/e.txt" "data/bucket-1/b/e.txt"
assertHttpRequestEquals "GET" "b/ブツブツ.txt" "data/bucket-1/b/ブツブツ.txt"
