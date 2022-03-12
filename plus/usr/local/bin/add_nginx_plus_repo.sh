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

if [ ! -f "/etc/ssl/nginx/nginx-repo.crt" ]; then
  >&2 echo "NGINX Plus repository certificate file not found at path: /etc/ssl/nginx/nginx-repo.crt"
  exit 1
fi

if [ ! -f "/etc/ssl/nginx/nginx-repo.key" ]; then
  >&2 echo "NGINX Plus repository key file not found at path: /etc/ssl/nginx/nginx-repo.key"
  exit 1
fi

version_codename="$(grep '^VERSION_CODENAME=' /etc/os-release | awk -v FS='=' '{print $2}')"

echo "Acquire::https::pkgs.nginx.com::Verify-Peer \"true\";" >> /etc/apt/apt.conf.d/90nginx
echo "Acquire::https::pkgs.nginx.com::Verify-Host \"true\";" >> /etc/apt/apt.conf.d/90nginx
echo "Acquire::https::pkgs.nginx.com::SslCert     \"/etc/ssl/nginx/nginx-repo.crt\";" >> /etc/apt/apt.conf.d/90nginx
echo "Acquire::https::pkgs.nginx.com::SslKey      \"/etc/ssl/nginx/nginx-repo.key\";" >> /etc/apt/apt.conf.d/90nginx
echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] https://pkgs.nginx.com/plus/debian ${version_codename} nginx-plus" >> /etc/apt/sources.list.d/nginx-plus.list
