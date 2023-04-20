#!/usr/bin/env bash

git submodule update --init common/etc/nginx/include/awssig
git submodule absorbgitdirs
git -C common/etc/nginx/include/awssig config core.sparseCheckout true
echo 'core/*' >>.git/modules/common/etc/nginx/include/awssig/info/sparse-checkout
git submodule update --force --checkout common/etc/nginx/include/awssig
