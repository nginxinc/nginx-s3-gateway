#!/usr/bin/env sh

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

if [ -z "${NGINX_GPGKEY+x}" ]; then
    >&2 echo "NGINX_GPGKEY environment variable containing NGINX+ GPG key was not found"
    env
    exit 1
fi

if [ ! -f "/etc/ssl/nginx/nginx-repo.crt" ]; then
  >&2 echo "NGINX Plus repository certificate file not found at path: /etc/ssl/nginx/nginx-repo.crt"
  exit 1
fi

if [ ! -f "/etc/ssl/nginx/nginx-repo.key" ]; then
  >&2 echo "NGINX Plus repository key file not found at path: /etc/ssl/nginx/nginx-repo.key"
  exit 1
fi

apt-get -qq install --no-install-recommends --no-install-suggests -y apt-transport-https gnupg1 ca-certificates

version_codename="$(grep '^VERSION_CODENAME=' /etc/os-release | awk -v FS='=' '{print $2}')"

found=''
for server in \
    ha.pool.sks-keyservers.net \
    hkp://keyserver.ubuntu.com:80 \
    hkp://p80.pool.sks-keyservers.net:80 \
    pgp.mit.edu \
; do
    echo "Fetching GPG key $NGINX_GPGKEY from $server"
    apt-key adv --keyserver "$server" --keyserver-options timeout=10 --recv-keys "$NGINX_GPGKEY" && found=yes && break
done
    test -z "$found" && echo >&2 "error: failed to fetch GPG key $NGINX_GPGKEY" && exit 1
    apt-get remove --purge --auto-remove -y gnupg1 && rm -rf /var/lib/apt/lists/*
    echo "Acquire::https::plus-pkgs.nginx.com::Verify-Peer \"true\";" >> /etc/apt/apt.conf.d/90nginx
    echo "Acquire::https::plus-pkgs.nginx.com::Verify-Host \"true\";" >> /etc/apt/apt.conf.d/90nginx
    echo "Acquire::https::plus-pkgs.nginx.com::SslCert     \"/etc/ssl/nginx/nginx-repo.crt\";" >> /etc/apt/apt.conf.d/90nginx
    echo "Acquire::https::plus-pkgs.nginx.com::SslKey      \"/etc/ssl/nginx/nginx-repo.key\";" >> /etc/apt/apt.conf.d/90nginx
    echo "deb https://plus-pkgs.nginx.com/debian ${version_codename} nginx-plus" >> /etc/apt/sources.list.d/nginx-plus.list
