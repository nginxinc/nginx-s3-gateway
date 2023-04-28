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

import utils from "./utils.js";

const mod_hmac = require('crypto');

/**
 * Constant checksum for an empty HTTP body.
 * @type {string}
 */
const EMPTY_PAYLOAD_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/**
 * Constant defining the headers being signed.
 * @type {string}
 */
const DEFAULT_SIGNED_HEADERS = 'host;x-amz-content-sha256;x-amz-date';


/**
 * Create HTTP Authorization header for authenticating with an AWS compatible
 * v4 API.
 *
 * @param r {Request} HTTP request object
 * @param timestamp {Date} timestamp associated with request (must fall within a skew)
 * @param region {string} API region associated with request
 * @param service {string} service code (for example, s3, lambda)
 * @param uri {string} The URI-encoded version of the absolute path component URL to create a canonical request
 * @param queryParams {string} The URL-encoded query string parameters to create a canonical request
 * @param host {string} HTTP host header value
 * @param credentials {object} Credential object with AWS credentials in it (AccessKeyId, SecretAccessKey, SessionToken)
 * @returns {string} HTTP Authorization header value
 */
function signatureV4(r, timestamp, region, service, uri, queryParams, host, credentials) {
    const eightDigitDate = utils.getEightDigitDate(timestamp);
    const amzDatetime = utils.getAmzDatetime(timestamp, eightDigitDate);
    const payloadHash = getPayloadHash(r.requestText);
    const canonicalRequest = _buildCanonicalRequest(
        r.method, uri, queryParams, host, amzDatetime, credentials.sessionToken, payloadHash);
    const signature = _buildSignatureV4(r, amzDatetime, eightDigitDate,
        credentials, region, service, canonicalRequest);
    const authHeader = 'AWS4-HMAC-SHA256 Credential='
        .concat(credentials.accessKeyId, '/', eightDigitDate, '/', region, '/', service, '/aws4_request,',
            'SignedHeaders=', _signedHeaders(credentials.sessionToken), ',Signature=', signature);

    utils.debug_log(r, 'AWS v4 Auth header: [' + authHeader + ']');

    return authHeader;
}

function getPayloadHash(payloadString) {
    let payloadHash = EMPTY_PAYLOAD_HASH;
    if (typeof payloadString !== 'undefined' && payloadString.length > 0) {
        payloadHash = mod_hmac.createHash('sha256')
            .update(payloadString)
            .digest('hex');
    }
    return payloadHash;
}

/**
 * Creates a canonical request that will later be signed
 *
 * @see {@link https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html | Creating a Canonical Request}
 * @param method {string} HTTP method
 * @param uri {string} URI associated with request
 * @param queryParams {string} query parameters associated with request
 * @param host {string} HTTP Host header value
 * @param amzDatetime {string} ISO8601 timestamp string to sign request with
 * @returns {string} string with concatenated request parameters
 * @private
 */
function _buildCanonicalRequest(method, uri, queryParams, host, amzDatetime, sessionToken, payloadHash) {
    let canonicalHeaders = 'host:' + host + '\n' +
        'x-amz-content-sha256:' + payloadHash + '\n' +
        'x-amz-date:' + amzDatetime + '\n';

    if (sessionToken) {
        canonicalHeaders += 'x-amz-security-token:' + sessionToken + '\n'
    }

    let canonicalRequest = method + '\n';
    canonicalRequest += uri + '\n';
    canonicalRequest += queryParams + '\n';
    canonicalRequest += canonicalHeaders + '\n';
    canonicalRequest += _signedHeaders(sessionToken) + '\n';
    canonicalRequest += payloadHash;

    return canonicalRequest;
}

/**
 * Creates a signature for use authenticating against an AWS compatible API.
 *
 * @see {@link https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html | AWS V4 Signing Process}
 * @param r {Request} HTTP request object
 * @param amzDatetime {string} ISO8601 timestamp string to sign request with
 * @param eightDigitDate {string} date in the form of 'YYYYMMDD'
 * @param creds {object} AWS credentials
 * @param region {string} API region associated with request
 * @param service {string} service code (for example, s3, lambda)
 * @param canonicalRequest {string} string with concatenated request parameters
 * @returns {string} hex encoded hash of signature HMAC value
 * @private
 */
function _buildSignatureV4(
    r, amzDatetime, eightDigitDate, creds, region, service, canonicalRequest) {
    utils.debug_log(r, 'AWS v4 Auth Canonical Request: [' + canonicalRequest + ']');

    const canonicalRequestHash = mod_hmac.createHash('sha256')
        .update(canonicalRequest)
        .digest('hex');

    utils.debug_log(r, 'AWS v4 Auth Canonical Request Hash: [' + canonicalRequestHash + ']');

    const stringToSign = _buildStringToSign(
        amzDatetime, eightDigitDate, region, service, canonicalRequestHash);

        utils.debug_log(r, 'AWS v4 Auth Signing String: [' + stringToSign + ']');

    let kSigningHash;

    /* If we have a keyval zone and key defined for caching the signing key hash,
     * then signing key caching will be enabled. By caching signing keys we can
     * accelerate the signing process because we will have four less HMAC
     * operations that have to be performed per incoming request. The signing
     * key expires every day, so our cache key can persist for 24 hours safely.
     */
    if ("variables" in r && r.variables.cache_signing_key_enabled == 1) {
        // cached value is in the format: [eightDigitDate]:[signingKeyHash]
        const cached = "signing_key_hash" in r.variables ? r.variables.signing_key_hash : "";
        const fields = _splitCachedValues(cached);
        const cachedEightDigitDate = fields[0];
        const cacheIsValid = fields.length === 2 && eightDigitDate === cachedEightDigitDate;

        // If true, use cached value
        if (cacheIsValid) {
            utils.debug_log(r, 'AWS v4 Using cached Signing Key Hash');
            /* We are forced to JSON encode the string returned from the HMAC
             * operation because it is in a very specific format that include
             * binary data and in order to preserve that data when persisting
             * we encode it as JSON. By doing so we can gracefully decode it
             * when reading from the cache. */
            kSigningHash = Buffer.from(JSON.parse(fields[1]));
        // Otherwise, generate a new signing key hash and store it in the cache
        } else {
            kSigningHash = _buildSigningKeyHash(creds.secretAccessKey, eightDigitDate, region, service);
            utils.debug_log(r, 'Writing key: ' + eightDigitDate + ':' + kSigningHash.toString('hex'));
            r.variables.signing_key_hash = eightDigitDate + ':' + JSON.stringify(kSigningHash);
        }
    // Otherwise, don't use caching at all (like when we are using NGINX OSS)
    } else {
        kSigningHash = _buildSigningKeyHash(creds.secretAccessKey, eightDigitDate, region, service);
    }

    utils.debug_log(r, 'AWS v4 Signing Key Hash: [' + kSigningHash.toString('hex') + ']');

    const signature = mod_hmac.createHmac('sha256', kSigningHash)
        .update(stringToSign).digest('hex');

    utils.debug_log(r, 'AWS v4 Authorization Header: [' + signature + ']');

    return signature;
}

/**
 * Creates a string to sign by concatenating together multiple parameters required
 * by the signatures algorithm.
 *
 * @see {@link https://docs.aws.amazon.com/general/latest/gr/sigv4-create-string-to-sign.html | String to Sign}
 * @param amzDatetime {string} ISO8601 timestamp string to sign request with
 * @param eightDigitDate {string} date in the form of 'YYYYMMDD'
 * @param region {string} region associated with server API
 * @param service {string} service code (for example, s3, lambda)
 * @param canonicalRequestHash {string} hex encoded hash of canonical request string
 * @returns {string} a concatenated string of the passed parameters formatted for signatures
 * @private
 */
function _buildStringToSign(amzDatetime, eightDigitDate, region, service, canonicalRequestHash) {
    return 'AWS4-HMAC-SHA256\n' +
        amzDatetime + '\n' +
        eightDigitDate + '/' + region + '/' + service + '/aws4_request\n' +
        canonicalRequestHash;
}

/**
 * Creates a string containing the headers that need to be signed as part of v4
 * signature authentication.
 *
 * @param sessionToken {string|undefined} AWS session token if present
 * @returns {string} semicolon delimited string of the headers needed for signing
 * @private
 */
function _signedHeaders(sessionToken) {
    let headers = DEFAULT_SIGNED_HEADERS;
    if (sessionToken) {
        headers += ';x-amz-security-token';
    }
    return headers;
}

/**
 * Creates a signing key HMAC. This value is used to sign the request made to
 * the API.
 *
 * @param kSecret {string} secret access key
 * @param eightDigitDate {string} date in the form of 'YYYYMMDD'
 * @param region {string} region associated with server API
 * @param service {string} name of service that request is for e.g. s3, lambda
 * @returns {ArrayBuffer} signing HMAC
 * @private
 */
function _buildSigningKeyHash(kSecret, eightDigitDate, region, service) {
    const kDate = mod_hmac.createHmac('sha256', 'AWS4'.concat(kSecret))
        .update(eightDigitDate).digest();
    const kRegion = mod_hmac.createHmac('sha256', kDate)
        .update(region).digest();
    const kService = mod_hmac.createHmac('sha256', kRegion)
        .update(service).digest();
    const kSigning = mod_hmac.createHmac('sha256', kService)
        .update('aws4_request').digest();

    return kSigning;
}

/**
 * Splits the cached values into an array with two elements or returns an
 * empty array if the input string is invalid. The first element contains
 * the eight digit date string and the second element contains a JSON string
 * of the kSigningHash.
 *
 * @param cached input string to parse
 * @returns {string[]|*[]} array containing eight digit date and kSigningHash or empty
 * @private
 */
function _splitCachedValues(cached) {
    const matchedPos = cached.indexOf(':', 0);
    // Do a sanity check on the position returned, if it isn't sane, return
    // an empty array and let the caller logic process it.
    if (matchedPos < 0 || matchedPos + 1 > cached.length) {
        return []
    }

    const eightDigitDate = cached.substring(0, matchedPos);
    const kSigningHash = cached.substring(matchedPos + 1);

    return [eightDigitDate, kSigningHash]
}


export default {
    signatureV4,
    getPayloadHash,
    // These functions do not need to be exposed, but they are exposed so that
    // unit tests can run against them.
    _buildCanonicalRequest,
    _buildSignatureV4,
    _buildSigningKeyHash,
    _splitCachedValues
}
