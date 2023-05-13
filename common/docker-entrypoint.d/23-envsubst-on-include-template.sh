#!/bin/sh

set -e

ME=$(basename $0)

entrypoint_log() {
    if [ -z "${NGINX_ENTRYPOINT_QUIET_LOGS:-}" ]; then
        echo "$@"
    fi
}

auto_envsubst() {
  local include_dir="/etc/nginx/include"
  local suffix="${NGINX_ENVSUBST_TEMPLATE_SUFFIX:-.template}"
  local filter="${NGINX_ENVSUBST_FILTER:-}"

  local template defined_envs relative_path output_path subdir
  defined_envs=$(printf '${%s} ' $(awk "END { for (name in ENVIRON) { print ( name ~ /${filter}/ ) ? name : \"\" } }" < /dev/null ))
  if [ ! -w "$include_dir" ]; then
    entrypoint_log "$ME: ERROR: $include_dir is not writable"
    return 0
  fi
  find "$include_dir" -follow -type f -name "*$suffix" -print | while read -r template; do
    output_path="${template%$suffix}"
    entrypoint_log "$ME: Running envsubst on $template to $output_path"
    envsubst "$defined_envs" < "$template" > "$output_path"
  done
}

auto_envsubst

exit 0
