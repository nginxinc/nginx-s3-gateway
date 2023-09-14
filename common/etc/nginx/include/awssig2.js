/*
 *  Copyright 2023 F5, Inc.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

// JSDoc definitions
/**
 * @module awssig2
 * @alias AwsSig2
 */

import utils from "./utils.js";

const mod_hmac = require('crypto');

/**
 * Create HTTP Authorization header for authenticating with an AWS compatible
 * v2 API.
 *
 * @param r {NginxHTTPRequest} HTTP request object
 * @param uri {string} The URI-encoded version of the absolute path component URL to create a request
 * @param httpDate {string} RFC2616 timestamp used to sign the request
 * @param credentials {Credentials} Credential object with AWS credentials in it (AccessKeyId, SecretAccessKey, SessionToken)
 * @returns {string} HTTP Authorization header value
 */
function signatureV2(r, uri, httpDate, credentials) {
    const method = r.method;
    const hmac = mod_hmac.createHmac('sha1', credentials.secretAccessKey);
    const stringToSign = method + '\n\n\n' + httpDate + '\n' + uri;

    utils.debug_log(r, 'AWS v2 Auth Signing String: [' + stringToSign + ']');

    const signature = hmac.update(stringToSign).digest('base64');

    return `AWS ${credentials.accessKeyId}:${signature}`;
}

export default {
    signatureV2
}
