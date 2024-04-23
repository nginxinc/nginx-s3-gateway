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

# vim:sw=4:ts=4:et

set -e

parseBoolean() {
  case "$1" in
    TRUE | true | True | YES | Yes | 1)
      echo 1
      ;;
    *)
      echo 0
      ;;
  esac
}

# This line is an addition to the NGINX Docker image's entrypoint script.
if [ -z ${DNS_RESOLVERS+x} ]; then
    resolvers=""

    # This method of pulling individual nameservers from
    # /etc/resolv.conf taken from the entrypoint script in the
    # official docker image.
    # https://github.com/nginxinc/docker-nginx/blob/master/entrypoint/15-local-resolvers.envsh
    for ip in $(awk 'BEGIN{ORS=" "} $1=="nameserver" {print $2}' /etc/resolv.conf)
    do
        if echo "${ip}" | grep -q ':'; then
          resolvers="$resolvers [${ip}]"
        else
          resolvers="$resolvers $ip"
        fi
    done
    export DNS_RESOLVERS="${resolvers}"
fi

# Normalize the CORS_ENABLED environment variable to a numeric value
# so that it can be easily parsed in the nginx configuration.
export CORS_ENABLED="$(parseBoolean "${CORS_ENABLED}")"

# By enabling CORS, we also need to enable the OPTIONS method which
# is not normally used as part of the gateway. The following variable
# defines the set of acceptable headers.
if [ "${CORS_ENABLED}" == "1" ]; then
  export LIMIT_METHODS_TO="GET HEAD OPTIONS"
  export LIMIT_METHODS_TO_CSV="GET, HEAD, OPTIONS"
else
  export LIMIT_METHODS_TO="GET HEAD"
  export LIMIT_METHODS_TO_CSV="GET, HEAD"
fi

if [ -z "${CORS_ALLOWED_ORIGIN+x}" ]; then
  export CORS_ALLOWED_ORIGIN="*"
fi

if [ "${S3_STYLE}" == "path" ]; then
  export FINAL_S3_SERVER="${S3_SERVER}:${S3_SERVER_PORT}"
else
  export FINAL_S3_SERVER="${S3_BUCKET_NAME}.${S3_SERVER}:${S3_SERVER_PORT}"
fi

# Nothing is modified under this line

if [ -z "${NGINX_ENTRYPOINT_QUIET_LOGS:-}" ]; then
    exec 3>&1
else
    exec 3>/dev/null
fi

if [ "$1" = "nginx" -o "$1" = "nginx-debug" ]; then
    if /usr/bin/find "/docker-entrypoint.d/" -mindepth 1 -maxdepth 1 -type f -print -quit 2>/dev/null | read v; then
        echo >&3 "$0: /docker-entrypoint.d/ is not empty, will attempt to perform configuration"

        echo >&3 "$0: Looking for shell scripts in /docker-entrypoint.d/"
        find "/docker-entrypoint.d/" -follow -type f -print | sort -n | while read -r f; do
            case "$f" in
                *.sh)
                    if [ -x "$f" ]; then
                        echo >&3 "$0: Launching $f";
                        "$f"
                    else
                        # warn on shell scripts without exec bit
                        echo >&3 "$0: Ignoring $f, not executable";
                    fi
                    ;;
                *) echo >&3 "$0: Ignoring $f";;
            esac
        done

        echo >&3 "$0: Configuration complete; ready for start up"
    else
        echo >&3 "$0: No files found in /docker-entrypoint.d/, skipping configuration"
    fi
fi

exec "$@"
