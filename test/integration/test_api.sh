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
signature_version=$3
allow_directory_list=$4
index_page=$5
append_slash=$6
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

  if [[ $path == /* ]]; then
    uri="${test_server}${path}"
  else
    uri="${test_server}/${path}"
  fi

  if [ "${index_page}" == "1" ]; then
    # Follow 302 redirect if testing static hosting
    # Add the -v flag to the curl command below to debug why curl is failing
    extra_arg="-L"
  else
    extra_arg=""
  fi

  printf "  \033[36;1m▲\033[0m "
  echo "Testing object: ${method} ${path}"

  if [ "${method}" = "HEAD" ]; then
    expected_response_code="$3"
    actual_response_code="$(${curl_cmd} -s -o /dev/null -w '%{http_code}' --head "${uri}" ${extra_arg})"

    if [ "${expected_response_code}" != "${actual_response_code}" ]; then
      e "Response code didn't match expectation. Request [${method} ${uri}] Expected [${expected_response_code}] Actual [${actual_response_code}]"
      e "curl command: ${curl_cmd} -s -o /dev/null -w '%{http_code}' --head '${uri}' ${extra_arg}"
      exit ${test_fail_exit_code}
    fi
  elif [ "${method}" = "GET" ]; then
    body_data_path="${test_dir}/$3"

    if [ -f "$body_data_path" ]; then
      checksum_output="$(${checksum_cmd} "${body_data_path}")"
      expected_checksum="${checksum_output:0:${checksum_length}}"

      curl_checksum_output="$(${curl_cmd} -s -X "${method}" "${uri}" ${extra_arg} | ${checksum_cmd})"
      s3_file_checksum="${curl_checksum_output:0:${checksum_length}}"

      if [ "${expected_checksum}" != "${s3_file_checksum}" ]; then
        e "Checksum doesn't match expectation. Request [${method} ${uri}] Expected [${expected_checksum}] Actual [${s3_file_checksum}]"
        e "curl command: ${curl_cmd} -s -X '${method}' '${uri}' ${extra_arg} | ${checksum_cmd}"
        exit ${test_fail_exit_code}
      fi
    else
      expected_response_code="$3"
      actual_response_code="$(${curl_cmd} -s -o /dev/null -w '%{http_code}' "${uri}" ${extra_arg})"

      if [ "${expected_response_code}" != "${actual_response_code}" ]; then
        e "Response code didn't match expectation. Request [${method} ${uri}] Expected [${expected_response_code}] Actual [${actual_response_code}]"
        e "curl command: ${curl_cmd} -s -o /dev/null -w '%{http_code}' '${uri}' ${extra_arg}"
        exit ${test_fail_exit_code}
      fi
    fi
  else
    e "Method unsupported: [${method}]"
  fi
}

# Check to see if HTTP server is available
set +o errexit
# Allow curl command to fail with a non-zero exit code for this block because
# we want to use it to test to see if the server is actually up.
for (( i=1; i<=3; i++ )); do
  # Add the -v flag to the curl command below to debug why curl is failing
  response="$(${curl_cmd} -s -o /dev/null -w '%{http_code}' --head "${test_server}")"
  if [ "${response}" != "000" ]; then
    break
  fi
  wait_time="$((i * 2))"
  e "Failed to access ${test_server} - trying again in ${wait_time} seconds, try ${i}/3"
  sleep ${wait_time}
done
set -o errexit

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
assertHttpRequestEquals "HEAD" "a/c/あ" "200"
assertHttpRequestEquals "HEAD" "b/クズ箱/ゴミ.txt" "200"
assertHttpRequestEquals "HEAD" "системы/system.txt" "200"
assertHttpRequestEquals "HEAD" "%D1%81%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D1%8B/%25bad%25file%25name%25" "200"

# Expected 400s
# curl will not send this to server now
# assertHttpRequestEquals "HEAD" "request with unencoded spaces" "400"

# Expected 404s
if [ "${append_slash}" == "1" ] && [ "${index_page}" == "0" ]; then
  assertHttpRequestEquals "HEAD" "not%20found" "302"
  assertHttpRequestEquals "HEAD" "b/c" "302"
else
  assertHttpRequestEquals "HEAD" "not%20found" "404"
  assertHttpRequestEquals "HEAD" "b/c" "404"
fi

# Directory HEAD 404s
# Unfortunately, the logic here can't be properly encoded into the test.
# With minio, we can't return anything *but* a 404 for HEAD requests to a directory.
# With AWS S3, HEAD requests to a directory will return 200 *only* when we are
# running with v4 signatures.
# Now, both of these cases have the exception of HEAD returning 200 on the root
# directory.
if [ "${allow_directory_list}" == "1" ] || [ "${index_page}" == "1" ]; then
  assertHttpRequestEquals "HEAD" "/" "200"
else
  assertHttpRequestEquals "HEAD" "/" "404"
fi
assertHttpRequestEquals "HEAD" "b/" "404"
assertHttpRequestEquals "HEAD" "/b/c/" "404"
assertHttpRequestEquals "HEAD" "/soap" "404"
if [ "${append_slash}" == "1" ] && [ "${index_page}" == "0" ]; then
assertHttpRequestEquals "HEAD" "b//c" "302"
else
assertHttpRequestEquals "HEAD" "b//c" "404"
fi

if [ "${index_page}" == "1" ]; then
assertHttpRequestEquals "HEAD" "/statichost/" "200"
assertHttpRequestEquals "HEAD" "/nonexistdir/noindexdir/" "404"
assertHttpRequestEquals "HEAD" "/nonexistdir/noindexdir" "404"
assertHttpRequestEquals "HEAD" "/statichost/noindexdir/multipledir/" "200"
assertHttpRequestEquals "HEAD" "/nonexistdir/" "404"
assertHttpRequestEquals "HEAD" "/nonexistdir" "404"
  if [ ${append_slash} == "1" ]; then
  assertHttpRequestEquals "HEAD" "/statichost" "200"
  assertHttpRequestEquals "HEAD" "/statichost/noindexdir/multipledir" "200"
  else
  assertHttpRequestEquals "HEAD" "/statichost" "404"
  assertHttpRequestEquals "HEAD" "/statichost/noindexdir/multipledir" "404"
  fi
fi

# Verify GET is working
assertHttpRequestEquals "GET" "a.txt" "data/bucket-1/a.txt"
assertHttpRequestEquals "GET" "a.txt?some=param&that=should&be=stripped#aaah" "data/bucket-1/a.txt"
assertHttpRequestEquals "GET" "b/c/d.txt" "data/bucket-1/b/c/d.txt"
assertHttpRequestEquals "GET" "b/c/=" "data/bucket-1/b/c/="
assertHttpRequestEquals "GET" "b/e.txt" "data/bucket-1/b/e.txt"
assertHttpRequestEquals "GET" "a/c/あ" "data/bucket-1/a/c/あ"
assertHttpRequestEquals "GET" "b/ブツブツ.txt" "data/bucket-1/b/ブツブツ.txt"
assertHttpRequestEquals "GET" "b/クズ箱/ゴミ.txt" "data/bucket-1/b/クズ箱/ゴミ.txt"
assertHttpRequestEquals "GET" "системы/system.txt" "data/bucket-1/системы/system.txt"
assertHttpRequestEquals "GET" "%D1%81%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D1%8B/%25bad%25file%25name%25" "data/bucket-1/системы/%bad%file%name%"

if [ "${index_page}" == "1" ]; then
assertHttpRequestEquals "GET" "/statichost/" "data/bucket-1/statichost/index.html"
assertHttpRequestEquals "GET" "/statichost/noindexdir/multipledir/" "data/bucket-1/statichost/noindexdir/multipledir/index.html"
  if [ "${append_slash}" == "1" ]; then
  assertHttpRequestEquals "GET" "/statichost" "data/bucket-1/statichost/index.html"
  assertHttpRequestEquals "GET" "/statichost/noindexdir/multipledir" "data/bucket-1/statichost/noindexdir/multipledir/index.html"
  fi
fi

if [ "${allow_directory_list}" == "1" ]; then
  assertHttpRequestEquals "GET" "/" "200"
  assertHttpRequestEquals "GET" "b/" "200"
  assertHttpRequestEquals "GET" "/b/c/" "200"
  assertHttpRequestEquals "GET" "b/クズ箱/" "200"
  assertHttpRequestEquals "GET" "системы/" "200"
  if [ "$append_slash" == "1" ]; then
    assertHttpRequestEquals "GET" "b" "302"
  else
    assertHttpRequestEquals "GET" "b" "404"
  fi
elif [ "${index_page}" == "1" ]; then
  assertHttpRequestEquals "GET" "/" "data/bucket-1/index.html"
else
  assertHttpRequestEquals "GET" "/" "404"
fi
