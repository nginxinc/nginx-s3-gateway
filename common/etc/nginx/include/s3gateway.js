/*
 *  Copyright 2020 F5 Networks
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

_require_env_var('S3_BUCKET_NAME');
_require_env_var('S3_SERVER');
_require_env_var('S3_SERVER_PROTO');
_require_env_var('S3_SERVER_PORT');
_require_env_var('S3_REGION');
_require_env_var('AWS_SIGS_VERSION');
_require_env_var('S3_STYLE');

const mod_hmac = require('crypto');
const fs = require('fs');

/**
 * Flag indicating debug mode operation. If true, additional information
 * about signature generation will be logged.
 * @type {boolean}
 */
const DEBUG = _parseBoolean(process.env['S3_DEBUG']);
const ALLOW_LISTING = _parseBoolean(process.env['ALLOW_DIRECTORY_LIST']);
const PROVIDE_INDEX_PAGE = _parseBoolean(process.env['PROVIDE_INDEX_PAGE']);
const APPEND_SLASH = _parseBoolean(process.env['APPEND_SLASH_FOR_POSSIBLE_DIRECTORY']);

const S3_STYLE = process.env['S3_STYLE'];

const ADDITIONAL_HEADER_PREFIXES_TO_STRIP = _parseArray(process.env['HEADER_PREFIXES_TO_STRIP']);

/**
 * Default filename for index pages to be read off of the backing object store.
 * @type {string}
 */
const INDEX_PAGE = "index.html";

/**
 * The current moment as a timestamp. This timestamp will be used across
 * functions in order for there to be no variations in signatures.
 * @type {Date}
 */
const NOW = new Date();

/**
 * Constant defining the service requests are being signed for.
 * @type {string}
 */
const SERVICE = 's3';

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
 * Constant base URI to fetch credentials together with the credentials relative URI, see
 * https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html for more details.
 * @type {string}
 */
const ECS_CREDENTIAL_BASE_URI = 'http://169.254.170.2';

/**
 * @type {string}
 */
const EC2_IMDS_TOKEN_ENDPOINT = 'http://169.254.169.254/latest/api/token';

const EC2_IMDS_SECURITY_CREDENTIALS_ENDPOINT = 'http://169.254.169.254/latest/meta-data/iam/security-credentials/';

/**
 * Transform the headers returned from S3 such that there isn't information
 * leakage about S3 and do other tasks needed for appropriate gateway output.
 * @param r HTTP request
 */
function editHeaders(r) {
    const isDirectoryHeadRequest =
        ALLOW_LISTING &&
        r.method === 'HEAD' &&
        _isDirectory(decodeURIComponent(r.variables.uri_path));

    /* Strips all x-amz- headers from the output HTTP headers so that the
     * requesters to the gateway will not know you are proxying S3. */
    if ('headersOut' in r) {
        for (const key in r.headersOut) {
            /* We delete all headers when it is a directory head request because
             * none of the information is relevant for passing on via a gateway. */
            if (isDirectoryHeadRequest) {
                delete r.headersOut[key];
            } else if (_isHeaderToBeStripped(key.toLowerCase(), ADDITIONAL_HEADER_PREFIXES_TO_STRIP)) {
                delete r.headersOut[key];
            }
        }

        /* Transform content type returned on HEAD requests for directories
         * if directory listing is enabled. If you change the output format
         * for the XSL stylesheet from HTML to something else, you will
         * want to change the content type below. */
        if (isDirectoryHeadRequest) {
            r.headersOut['Content-Type'] = 'text/html; charset=utf-8'
        }
    }
}

/**
 * Determines if a given HTTP header should be removed before being
 * sent on to the requesting client.
 * @param headerName {string} Lowercase HTTP header name
 * @param additionalHeadersToStrip {Array[string]} array of additional headers to remove
 * @returns {boolean} true if header should be removed
 */
function _isHeaderToBeStripped(headerName, additionalHeadersToStrip) {
    if (headerName.indexOf('x-amz-', 0) >= 0) {
        return true;
    }

    for (let i = 0; i < additionalHeadersToStrip.length; i++) {
        const headerToStrip = additionalHeadersToStrip[i];
        if (headerName.indexOf(headerToStrip, 0) >= 0) {
            return true;
        }
    }

    return false;
}

/**
 * Outputs the timestamp used to sign the request, so that it can be added to
 * the 'Date' header and sent by NGINX.
 *
 * @param r {Request} HTTP request object (not used, but required for NGINX configuration)
 * @returns {string} RFC2616 timestamp
 */
function s3date(r) {
    return NOW.toUTCString();
}

/**
 * Outputs the timestamp used to sign the request, so that it can be added to
 * the 'x-amz-date' header and sent by NGINX. The output format is
 * ISO 8601: YYYYMMDD'T'HHMMSS'Z'.
 * @see {@link https://docs.aws.amazon.com/general/latest/gr/sigv4-date-handling.html | Handling dates in Signature Version 4}
 *
 * @param r {Request} HTTP request object (not used, but required for NGINX configuration)
 * @returns {string} ISO 8601 timestamp
 */
function awsHeaderDate(r) {
    return _amzDatetime(NOW, _eightDigitDate(NOW));
}

/**
 * Returns the path to the credentials temporary cache file.
 *
 * @returns {string} path on the file system to credentials cache file
 * @private
 */
function _credentialsTempFile() {
    if (process.env['S3_CREDENTIALS_TEMP_FILE']) {
        return process.env['S3_CREDENTIALS_TEMP_FILE'];
    }
    if (process.env['TMPDIR']) {
        return `${process.env['TMPDIR']}/credentials.json`
    }

    return '/tmp/credentials.json';
}

/**
 * Write the instance profile credentials to a caching backend.
 *
 * @param r {Request} HTTP request object (not used, but required for NGINX configuration)
 * @param credentials {{accessKeyId: (string), secretAccessKey: (string), sessionToken: (string), expiration: (string)}} AWS instance profile credentials
 */
function writeCredentials(r, credentials) {
    /* Do not bother writing credentials if we are running in a mode where we
       do not need instance credentials. */
    if (process.env['S3_ACCESS_KEY_ID'] && process.env['S3_SECRET_KEY']) {
        return;
    }

    if (!credentials) {
        throw `Cannot write invalid credentials: ${JSON.stringify(credentials)}`;
    }

    if ("variables" in r && r.variables.cache_instance_credentials_enabled == 1) {
        _writeCredentialsToKeyValStore(r, credentials);
    } else {
        _writeCredentialsToFile(credentials);
    }
}

/**
 * Write the instance profile credentials to the NGINX Keyval store.
 *
 * @param r {Request} HTTP request object (not used, but required for NGINX configuration)
 * @param credentials {{accessKeyId: (string), secretAccessKey: (string), sessionToken: (string), expiration: (string)}} AWS instance profile credentials
 * @private
 */
function _writeCredentialsToKeyValStore(r, credentials) {
    r.variables.instance_credential_json = JSON.stringify(credentials);
}

/**
 * Write the instance profile credentials to a file on the file system. This
 * file will be quite small and should end up in the file cache relatively
 * quickly if it is repeatedly read.
 *
 * @param r {Request} HTTP request object (not used, but required for NGINX configuration)
 * @param credentials {{accessKeyId: (string), secretAccessKey: (string), sessionToken: (string), expiration: (string)}} AWS instance profile credentials
 * @private
 */
function _writeCredentialsToFile(credentials) {
    fs.writeFileSync(_credentialsTempFile(), JSON.stringify(credentials));
}

/**
 * Get the instance profile credentials needed to authenticated against S3 from
 * a backend cache. If the credentials cannot be found, then return undefined.
 * @param r {Request} HTTP request object (not used, but required for NGINX configuration)
 * @returns {undefined|{accessKeyId: (string), secretAccessKey: (string), sessionToken: (string|null), expiration: (string|null)}} AWS instance profile credentials or undefined
 */
function readCredentials(r) {
    if (process.env['S3_ACCESS_KEY_ID'] && process.env['S3_SECRET_KEY']) {
        return {
            accessKeyId: process.env['S3_ACCESS_KEY_ID'],
            secretAccessKey: process.env['S3_SECRET_KEY'],
            sessionToken: null,
            expiration: null
        };
    }

    if ("variables" in r && r.variables.cache_instance_credentials_enabled == 1) {
        return _readCredentialsFromKeyValStore(r);
    } else {
        return _readCredentialsFromFile();
    }
}

/**
 * Read credentials from the NGINX Keyval store. If it is not found, then
 * return undefined.
 *
 * @param r {Request} HTTP request object (not used, but required for NGINX configuration)
 * @returns {undefined|{accessKeyId: (string), secretAccessKey: (string), sessionToken: (string), expiration: (string)}} AWS instance profile credentials or undefined
 * @private
 */
function _readCredentialsFromKeyValStore(r) {
    const cached = r.variables.instance_credential_json;

    if (!cached) {
        return undefined;
    }

    try {
        return JSON.parse(cached);
    } catch (e) {
        _debug_log(r, `Error parsing JSON value from r.variables.instance_credential_json: ${e}`);
        return undefined;
    }
}

/**
 * Read the contents of the credentials file into memory. If it is not
 * found, then return undefined.
 *
 * @returns {undefined|{accessKeyId: (string), secretAccessKey: (string), sessionToken: (string), expiration: (string)}} AWS instance profile credentials or undefined
 * @private
 */
function _readCredentialsFromFile() {
    const credsFilePath = _credentialsTempFile();

    try {
        const creds = fs.readFileSync(credsFilePath);
        return JSON.parse(creds);
    } catch (e) {
        /* Do not throw an exception in the case of when the
           credentials file path is invalid in order to signal to
           the caller that such a file has not been created yet. */
        if (e.code === 'ENOENT') {
            return undefined;
        }
        throw e;
    }
}

/**
 * Creates an AWS authentication signature based on the global settings and
 * the passed request parameter.
 *
 * @param r {Request} HTTP request object
 * @returns {string} AWS authentication signature
 */
function s3auth(r) {
    const bucket = process.env['S3_BUCKET_NAME'];
    const region = process.env['S3_REGION'];
    let server;
    if (S3_STYLE === 'path') {
        server = process.env['S3_SERVER'] + ':' + process.env['S3_SERVER_PORT'];
    } else {
        server = process.env['S3_SERVER'];
    }
    const sigver = process.env['AWS_SIGS_VERSION'];

    let signature;

    const credentials = readCredentials(r);
    if (sigver == '2') {
        signature = signatureV2(r, bucket, credentials);
    } else {
        signature = signatureV4(r, NOW, bucket, region, server, credentials);
    }

    return signature;
}

/**
 * Get the current session token from the instance profile credential cache.
 *
 * @param r {Request} HTTP request object (not used, but required for NGINX configuration)
 * @returns {string} current session token or empty string
 */
function s3SecurityToken(r) {
    const credentials = readCredentials(r);
    if (credentials.sessionToken) {
        return credentials.sessionToken;
    }
    return '';
}

/**
 * Build the base file path for a S3 request URI. This function allows for
 * path style S3 URIs to be created that do not use a subdomain to specify
 * the bucket name.
 *
 * @param r {Request} HTTP request object (not used, but required for NGINX configuration)
 * @returns {string} start of the file path for the S3 object URI
 */
function s3BaseUri(r) {
    const bucket = process.env['S3_BUCKET_NAME'];
    let basePath;

    if (S3_STYLE === 'path') {
        _debug_log(r, 'Using path style uri : ' + '/' + bucket);
        basePath = '/' + bucket;
    } else {
        basePath = '';
    }

    return basePath;
}

/**
 * Returns the s3 path given the incoming request
 *
 * @param r HTTP request
 * @returns {string} uri for s3 request
 */
function s3uri(r) {
    let uriPath = r.variables.uri_path;
    const basePath = s3BaseUri(r);
    let path;

    // Create query parameters only if directory listing is enabled.
    if (ALLOW_LISTING) {
        const queryParams = _s3DirQueryParams(uriPath, r.method);
        if (queryParams.length > 0) {
            path = basePath + '?' + queryParams;
        } else {
            path = _escapeURIPath(basePath + uriPath);
        }
    } else {
        // This is a path that will resolve to an index page
        if (PROVIDE_INDEX_PAGE  && _isDirectory(uriPath) ) {
            uriPath += INDEX_PAGE;
        }
        path = _escapeURIPath(basePath + uriPath);
    }

    _debug_log(r, 'S3 Request URI: ' + r.method + ' ' + path);
    return path;
}

/**
 * Create and encode the query parameters needed to query S3 for an object
 * listing.
 *
 * @param uriPath request URI path
 * @param method request HTTP method
 * @returns {string} query parameters to use with S3 request
 * @private
 */
function _s3DirQueryParams(uriPath, method) {
    if (!_isDirectory(uriPath) || method !== 'GET') {
        return '';
    }

    /* Return if static website. We don't want to list the files in the
       directory, we want to append the index page and get the fil. */
    if (PROVIDE_INDEX_PAGE){
        return '';
    }

    let path = 'delimiter=%2F'

    if (uriPath !== '/') {
        let decodedUriPath = decodeURIComponent(uriPath);
        let without_leading_slash = decodedUriPath.charAt(0) === '/' ?
            decodedUriPath.substring(1, decodedUriPath.length) : decodedUriPath;
        path += '&prefix=' + _encodeURIComponent(without_leading_slash);
    }

    return path;
}

/**
 * Redirects the request to the appropriate location. If the request is not
 * a read (GET/HEAD) request, then we reject the request outright by returning
 * a HTTP 405 error with a list of allowed methods.
 *
 * @param r {Request} HTTP request object
 */
function redirectToS3(r) {
    // This is a read-only S3 gateway, so we do not support any other methods
    if (!(r.method === 'GET' || r.method === 'HEAD')) {
        _debug_log(r, 'Invalid method requested: ' + r.method);
        r.internalRedirect("@error405");
        return;
    }

    const uriPath = r.variables.uri_path;
    const isDirectoryListing = ALLOW_LISTING && _isDirectory(uriPath);

    if (isDirectoryListing && r.method === 'GET') {
        r.internalRedirect("@s3Listing");
    } else if ( PROVIDE_INDEX_PAGE == true ) {
        r.internalRedirect("@s3");
    } else if ( !ALLOW_LISTING && !PROVIDE_INDEX_PAGE && uriPath == "/" ) {
       r.internalRedirect("@error404");
    } else {
        r.internalRedirect("@s3");
    }
}

function trailslashControl(r) {
    if (APPEND_SLASH) {
        const hasExtension = /\/[^.\/]+\.[^.]+$/;
        if (!hasExtension.test(r.variables.uri_path)  && !_isDirectory(r.variables.uri_path)){
            return r.internalRedirect("@trailslash");
        }
    }
        r.internalRedirect("@error404");
}

/**
 * Create HTTP Authorization header for authenticating with an AWS compatible
 * v2 API.
 *
 * @param r {Request} HTTP request object
 * @param bucket {string} S3 bucket associated with request
 * @param accessId {string} User access key credential
 * @param secret {string} Secret access key
 * @returns {string} HTTP Authorization header value
 */
function signatureV2(r, bucket, credentials) {
    const method = r.method;
    /* If the source URI is a directory, we are sending to S3 a query string
     * local to the root URI, so this is what we need to encode within the
     * string to sign. For example, if we are requesting /bucket/dir1/ from
     * nginx, then in S3 we need to request /?delimiter=/&prefix=dir1/
     * Thus, we can't put the path /dir1/ in the string to sign. */
    let uri = _isDirectory(r.variables.uri_path) ? '/' : r.variables.uri_path;
    // To return index pages + index.html
    if (PROVIDE_INDEX_PAGE && _isDirectory(r.variables.uri_path)){
        uri = r.variables.uri_path + INDEX_PAGE
    }
    const hmac = mod_hmac.createHmac('sha1', credentials.secretAccessKey);
    const httpDate = s3date(r);
    const stringToSign = method + '\n\n\n' + httpDate + '\n' + '/' + bucket + uri;

    _debug_log(r, 'AWS v2 Auth Signing String: [' + stringToSign + ']');

    const s3signature = hmac.update(stringToSign).digest('base64');

    return `AWS ${credentials.accessKeyId}:${s3signature}`;
}

/**
 * Processes the directory listing output as returned from S3 and corrupts the
 * XML output by inserting 'junk' into causing nginx to return a 404 for empty
 * directory listings.
 *
 * If anyone finds a better way to do this, please submit a PR.
 *
 * @param r {Request} HTTP request object (not used, but required for NGINX configuration)
 * @param data chunked data buffer
 * @param flags contains field that indicates that a chunk is last
 */
function filterListResponse(r, data, flags) {
    let indexIsEmpty = _parseBoolean(r.variables.indexIsEmpty);

    if (indexIsEmpty && data.indexOf('<Contents') >= 0) {
        r.variables.indexIsEmpty = false;
        indexIsEmpty = false;
    }

    if (indexIsEmpty && data.indexOf('<CommonPrefixes') >= 0) {
        r.variables.indexIsEmpty = false;
        indexIsEmpty = false;
    }

    if (flags.last && indexIsEmpty) {
        r.sendBuffer('junk', flags);
    } else {
        r.sendBuffer(data, flags);
    }
}

/**
 * Creates a string containing the headers that need to be signed as part of v4
 * signature authentication.
 *
 * @param sessionToken {string|undefined} AWS session token if present
 * @returns {string} semicolon delimited string of the headers needed for signing
 */
function signedHeaders(sessionToken) {
    let headers = DEFAULT_SIGNED_HEADERS;
    if (sessionToken) {
        headers += ';x-amz-security-token';
    }
    return headers;
}

/**
 * Create HTTP Authorization header for authenticating with an AWS compatible
 * v4 API.
 *
 * @param r {Request} HTTP request object
 * @param timestamp {Date} timestamp associated with request (must fall within a skew)
 * @param bucket {string} S3 bucket associated with request
 * @param region {string} API region associated with request
 * @param server {string}
 * @param credentials {object} Credential object with AWS credentials in it (AccessKeyId, SecretAccessKey, SessionToken)
 * @returns {string} HTTP Authorization header value
 */
function signatureV4(r, timestamp, bucket, region, server, credentials) {
    const eightDigitDate = _eightDigitDate(timestamp);
    const amzDatetime = _amzDatetime(timestamp, eightDigitDate);
    const signature = _buildSignatureV4(r, amzDatetime, eightDigitDate, credentials, bucket, region, server);
    const authHeader = 'AWS4-HMAC-SHA256 Credential='
        .concat(credentials.accessKeyId, '/', eightDigitDate, '/', region, '/', SERVICE, '/aws4_request,',
            'SignedHeaders=', signedHeaders(credentials.sessionToken), ',Signature=', signature);

    _debug_log(r, 'AWS v4 Auth header: [' + authHeader + ']');

    return authHeader;
}

/**
 * Creates a signature for use authenticating against an AWS compatible API.
 *
 * @see {@link https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html | AWS V4 Signing Process}
 * @param r {Request} HTTP request object
 * @param amzDatetime {string} ISO8601 timestamp string to sign request with
 * @param eightDigitDate {string} date in the form of 'YYYYMMDD'
 * @param bucket {string} S3 bucket associated with request
 * @param region {string} API region associated with request
 * @returns {string} hex encoded hash of signature HMAC value
 * @private
 */
function _buildSignatureV4(r, amzDatetime, eightDigitDate, creds, bucket, region, server) {
    let host = server;
    if (S3_STYLE === 'virtual' || S3_STYLE === 'default' || S3_STYLE === undefined) {
        host = bucket + '.' + host;
    }
    const method = r.method;
    const baseUri = s3BaseUri(r);
    const queryParams = _s3DirQueryParams(r.variables.uri_path, method);
    let uri;
    if (queryParams.length > 0) {
        if (baseUri.length > 0) {
            uri = baseUri;
        } else {
            uri = '/';
        }
    } else {
        uri = s3uri(r);
    }

    const canonicalRequest = _buildCanonicalRequest(method, uri, queryParams, host, amzDatetime, creds.sessionToken);

    _debug_log(r, 'AWS v4 Auth Canonical Request: [' + canonicalRequest + ']');

    const canonicalRequestHash = mod_hmac.createHash('sha256')
        .update(canonicalRequest)
        .digest('hex');

    _debug_log(r, 'AWS v4 Auth Canonical Request Hash: [' + canonicalRequestHash + ']');

    const stringToSign = _buildStringToSign(amzDatetime, eightDigitDate, region, canonicalRequestHash);

    _debug_log(r, 'AWS v4 Auth Signing String: [' + stringToSign + ']');

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
            _debug_log(r, 'AWS v4 Using cached Signing Key Hash');
            /* We are forced to JSON encode the string returned from the HMAC
             * operation because it is in a very specific format that include
             * binary data and in order to preserve that data when persisting
             * we encode it as JSON. By doing so we can gracefully decode it
             * when reading from the cache. */
            kSigningHash = Buffer.from(JSON.parse(fields[1]));
        // Otherwise, generate a new signing key hash and store it in the cache
        } else {
            kSigningHash = _buildSigningKeyHash(creds.secretAccessKey, eightDigitDate, SERVICE, region);
            _debug_log(r, 'Writing key: ' + eightDigitDate + ':' + kSigningHash.toString('hex'));
            r.variables.signing_key_hash = eightDigitDate + ':' + JSON.stringify(kSigningHash);
        }
    // Otherwise, don't use caching at all (like when we are using NGINX OSS)
    } else {
        kSigningHash = _buildSigningKeyHash(creds.secretAccessKey, eightDigitDate, SERVICE, region);
    }

    _debug_log(r, 'AWS v4 Signing Key Hash: [' + kSigningHash.toString('hex') + ']');

    const signature = mod_hmac.createHmac('sha256', kSigningHash)
        .update(stringToSign).digest('hex');

    _debug_log(r, 'AWS v4 Authorization Header: [' + signature + ']');

    return signature;
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

/**
 * Creates a string to sign by concatenating together multiple parameters required
 * by the signatures algorithm.
 *
 * @see {@link https://docs.aws.amazon.com/general/latest/gr/sigv4-create-string-to-sign.html | String to Sign}
 * @param amzDatetime {string} ISO8601 timestamp string to sign request with
 * @param eightDigitDate {string} date in the form of 'YYYYMMDD'
 * @param region {string} region associated with server API
 * @param canonicalRequestHash {string} hex encoded hash of canonical request string
 * @returns {string} a concatenated string of the passed parameters formatted for signatures
 * @private
 */
function _buildStringToSign(amzDatetime, eightDigitDate, region, canonicalRequestHash) {
    return 'AWS4-HMAC-SHA256\n' +
        amzDatetime + '\n' +
        eightDigitDate + '/' + region + '/s3/aws4_request\n' +
        canonicalRequestHash;
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
function _buildCanonicalRequest(method, uri, queryParams, host, amzDatetime, sessionToken) {
    let canonicalHeaders = 'host:' + host + '\n' +
        'x-amz-content-sha256:' + EMPTY_PAYLOAD_HASH + '\n' +
        'x-amz-date:' + amzDatetime + '\n';

    if (sessionToken) {
        canonicalHeaders += 'x-amz-security-token:' + sessionToken + '\n'
    }

    let canonicalRequest = method + '\n';
    canonicalRequest += uri + '\n';
    canonicalRequest += queryParams + '\n';
    canonicalRequest += canonicalHeaders + '\n';
    canonicalRequest += signedHeaders(sessionToken) + '\n';
    canonicalRequest += EMPTY_PAYLOAD_HASH;

    return canonicalRequest;
}

/**
 * Creates a signing key HMAC. This value is used to sign the request made to
 * the API.
 *
 * @param kSecret {string} secret access key
 * @param eightDigitDate {string} date in the form of 'YYYYMMDD'
 * @param service {string} name of service that request is for e.g. s3, iam, etc
 * @param region {string} region associated with server API
 * @returns {ArrayBuffer} signing HMAC
 * @private
 */
function _buildSigningKeyHash(kSecret, eightDigitDate, service, region) {
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
 * Formats a timestamp into a date string in the format 'YYYYMMDD'.
 *
 * @param timestamp {Date} timestamp used in signature
 * @returns {string} a formatted date string based on the input timestamp
 * @private
 */
function _eightDigitDate(timestamp) {
    const year = timestamp.getUTCFullYear();
    const month = timestamp.getUTCMonth() + 1;
    const day = timestamp.getUTCDate();

    return ''.concat(_padWithLeadingZeros(year, 4),
        _padWithLeadingZeros(month,2),
        _padWithLeadingZeros(day,2));
}

/**
 * Creates a string in the ISO601 date format (YYYYMMDD'T'HHMMSS'Z') based on
 * the supplied timestamp and date. The date is not extracted from the timestamp
 * because that operation is already done once during the signing process.
 *
 * @param timestamp {Date} timestamp to extract date from
 * @param eightDigitDate {string} 'YYYYMMDD' format date string that was already extracted from timestamp
 * @returns {string} string in the format of YYYYMMDD'T'HHMMSS'Z'
 * @private
 */
function _amzDatetime(timestamp, eightDigitDate) {
    const hours = timestamp.getUTCHours();
    const minutes = timestamp.getUTCMinutes();
    const seconds = timestamp.getUTCSeconds();

    return ''.concat(
        eightDigitDate,
        'T', _padWithLeadingZeros(hours, 2),
        _padWithLeadingZeros(minutes, 2),
        _padWithLeadingZeros(seconds, 2),
        'Z');
}

/**
 * Pads the supplied number with leading zeros.
 *
 * @param num {number|string} number to pad
 * @param size number of leading zeros to pad
 * @returns {string} a string with leading zeros
 * @private
 */
function _padWithLeadingZeros(num, size) {
    const s = "0" + num;
    return s.substr(s.length-size);
}

/**
 * Adds additional encoding to a URI component
 *
 * @param string {string} string to encode
 * @returns {string} an encoded string
 * @private
 */
function _encodeURIComponent(string) {
    return encodeURIComponent(string)
        .replace(/[!*'()]/g, (c) =>
            `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Escapes the path portion of a URI without escaping the path separator
 * characters (/).
 *
 * @param uri {string} unescaped URI
 * @returns {string} URI with each path component separately escaped
 * @private
 */
function _escapeURIPath(uri) {
    // Check to see if the URI path was already encoded. If so, we decode it.
    let decodedUri = (uri.indexOf('%') >= 0) ? decodeURIComponent(uri) : uri;
    let components = [];

    decodedUri.split('/').forEach(function (item, i) {
        components[i] = _encodeURIComponent(item);
    });

    return components.join('/');
}

/**
 * Determines if a given path is a directory based on whether or not the last
 * character in the path is a forward slash (/).
 *
 * @param path {string} path to parse
 * @returns {boolean} true if path is a directory
 * @private
 */
function _isDirectory(path) {
    if (path === undefined) {
        return false;
    }
    const len = path.length;

    if (len < 1) {
        return false;
    }

    return path.charAt(len - 1) === '/';
}

/**
 * Parses a string to and returns a boolean value based on its value. If the
 * string can't be parsed, this method returns null.
 *
 * @param string {*} value representing a boolean
 * @returns {boolean} boolean value of string
 * @private
 */
function _parseBoolean(string) {
    switch(string) {
        case "TRUE":
        case "true":
        case "True":
        case "YES":
        case "yes":
        case "Yes":
        case "1":
            return true;
        default:
            return false;
    }
}

/**
 * Parses a string delimited by semicolons into an array of values
 * @param string {string|null} value representing a array of strings
 * @returns {Array} a list of values
 * @private
 */
function _parseArray(string) {
    if (string == null || !string || string === ';') {
        return [];
    }

    // Exclude trailing delimiter
    if (string.endsWith(';')) {
        return string.substr(0, string.length - 1).split(';');
    }

    return string.split(';')
}

/**
 * Outputs a log message to the request logger if debug messages are enabled.
 *
 * @param r {Request} HTTP request object
 * @param msg {string} message to log
 * @private
 */
function _debug_log(r, msg) {
    if (DEBUG && "log" in r) {
        r.log(msg);
    }
}

/**
 * Checks to see if the given environment variable is present. If not, an error
 * is thrown.
 * @param envVarName {string} environment variable to check for
 * @private
 */
function _require_env_var(envVarName) {
    const isSet = envVarName in process.env;

    if (!isSet) {
        throw('Required environment variable ' + envVarName + ' is missing');
    }
}

/**
 * Offset to the expiration of credentials, when they should be considered expired and refreshed. The maximum
 * time here can be 5 minutes, the IMDS and ECS credentials endpoint will make sure that each returned set of credentials
 * is valid for at least another 5 minutes.
 *
 * To make sure we always refresh the credentials instead of retrieving the same again, keep credentials until 4:30 minutes
 * before they really expire.
 *
 * @type {number}
 */
const maxValidityOffsetMs = 4.5 * 60 * 1000;

/**
 * Get the credentials needed to create AWS signatures in order to authenticate
 * to S3. If the gateway is being provided credentials via a instance profile
 * credential as provided over the metadata endpoint, this function will:
 * 1. Try to read the credentials from cache
 * 2. Determine if the credentials are stale
 * 3. If the cached credentials are missing or stale, it gets new credentials
 *    from the metadata endpoint.
 * 4. If new credentials were pulled, it writes the credentials back to the
 *    cache.
 *
 * If the gateway is not using instance profile credentials, then this function
 * quickly exits.
 *
 * @param r {Request} HTTP request object
 * @returns {Promise<void>}
 */
async function fetchCredentials(r) {
    /* If we are not using an AWS instance profile to set our credentials we
       exit quickly and don't write a credentials file. */
    if (process.env['S3_ACCESS_KEY_ID'] && process.env['S3_SECRET_KEY']) {
        r.return(200);
        return;
    }

    let current;

    try {
        current = readCredentials(r);
    } catch (e) {
        _debug_log(r, `Could not read credentials: ${e}`);
        r.return(500);
        return;
    }

    if (current) {
        // AWS returns Unix timestamps in seconds, but in Date constructor we should provide timestamp in milliseconds
        const exp = new Date(current.expiration * 1000).getTime() - maxValidityOffsetMs;
        if (NOW.getTime() < exp) {
            r.return(200);
            return;
        }
    }

    let credentials;

    _debug_log(r, 'Cached credentials are expired or not present, requesting new ones');

    if (process.env['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI']) {
        const uri = ECS_CREDENTIAL_BASE_URI + process.env['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI'];
        try {
            credentials = await _fetchEcsRoleCredentials(uri);
        } catch (e) {
            _debug_log(r, 'Could not load ECS task role credentials: ' + JSON.stringify(e));
            r.return(500);
            return;
        }
    }
    else if(process.env['AWS_WEB_IDENTITY_TOKEN_FILE']) {
        try {
            credentials = await _fetchWebIdentityCredentials(r)
        } catch(e) {
            _debug_log(r, 'Could not assume role using web identity: ' + JSON.stringify(e));
            r.return(500);
            return;
        }
    } else {
        try {
            credentials = await _fetchEC2RoleCredentials();
        } catch (e) {
            _debug_log(r, 'Could not load EC2 task role credentials: ' + JSON.stringify(e));
            r.return(500);
            return;
        }
    }
    try {
        writeCredentials(r, credentials);
    } catch (e) {
        _debug_log(r, `Could not write credentials: ${e}`);
        r.return(500);
        return;
    }
    r.return(200);
}

/**
 * Get the credentials needed to generate AWS signatures from the ECS
 * (Elastic Container Service) metadata endpoint.
 *
 * @param credentialsUri {string} endpoint to get credentials from
 * @returns {Promise<{accessKeyId: (string), secretAccessKey: (string), sessionToken: (string), expiration: (string)}>}
 * @private
 */
async function _fetchEcsRoleCredentials(credentialsUri) {
    const resp = await ngx.fetch(credentialsUri);
    if (!resp.ok) {
        throw 'Credentials endpoint response was not ok.';
    }
    const creds = await resp.json();

    return {
        accessKeyId: creds.AccessKeyId,
        secretAccessKey: creds.SecretAccessKey,
        sessionToken: creds.Token,
        expiration: creds.Expiration,
    };
}

/**
 * Get the credentials needed to generate AWS signatures from the EC2
 * metadata endpoint.
 *
 * @returns {Promise<{accessKeyId: (string), secretAccessKey: (string), sessionToken: (string), expiration: (string)}>}
 * @private
 */
async function _fetchEC2RoleCredentials() {
    const tokenResp = await ngx.fetch(EC2_IMDS_TOKEN_ENDPOINT, {
        headers: {
            'x-aws-ec2-metadata-token-ttl-seconds': '21600',
        },
        method: 'PUT',
    });
    const token = await tokenResp.text();
    let resp = await ngx.fetch(EC2_IMDS_SECURITY_CREDENTIALS_ENDPOINT, {
        headers: {
            'x-aws-ec2-metadata-token': token,
        },
    });
    /* This _might_ get multiple possible roles in other scenarios, however,
       EC2 supports attaching one role only.It should therefore be safe to take
       the whole output, even given IMDS _might_ (?) be able to return multiple
       roles. */
    const credName = await resp.text();
    if (credName === "") {
        throw 'No credentials available for EC2 instance';
    }
    resp = await ngx.fetch(EC2_IMDS_SECURITY_CREDENTIALS_ENDPOINT + credName, {
        headers: {
            'x-aws-ec2-metadata-token': token,
        },
    });
    const creds = await resp.json();

    return {
        accessKeyId: creds.AccessKeyId,
        secretAccessKey: creds.SecretAccessKey,
        sessionToken: creds.Token,
        expiration: creds.Expiration,
    };
}

/**
 * Get the credentials by assuming calling AssumeRoleWithWebIdentity with the environment variable
 * values ROLE_ARN, AWS_WEB_IDENTITY_TOKEN_FILE and HOSTNAME
 *
 * @returns {Promise<{accessKeyId: (string), secretAccessKey: (string), sessionToken: (string), expiration: (string)}>}
 * @private
 */
async function _fetchWebIdentityCredentials(r) {
    const arn = process.env['AWS_ROLE_ARN'];
    const name = process.env['HOSTNAME'] || 'nginx-s3-gateway';

    let sts_endpoint = process.env['STS_ENDPOINT'];
    if (!sts_endpoint) {
        /* On EKS, the ServiceAccount can be annotated with
           'eks.amazonaws.com/sts-regional-endpoints' to control
           the usage of regional endpoints. We are using the same standard
           environment variable here as the AWS SDK. This is with the exception
           of replacing the value `legacy` with `global` to match what EKS sets
           the variable to.
           See: https://docs.aws.amazon.com/sdkref/latest/guide/feature-sts-regionalized-endpoints.html
           See: https://docs.aws.amazon.com/eks/latest/userguide/configure-sts-endpoint.html */
        const sts_regional = process.env['AWS_STS_REGIONAL_ENDPOINTS'] || 'global';
        if (sts_regional === 'regional') {
            /* STS regional endpoints can be derived from the region's name.
               See: https://docs.aws.amazon.com/general/latest/gr/sts.html */
            const region = process.env['AWS_REGION'];
            if (region) {
                sts_endpoint = `https://sts.${region}.amazonaws.com`;
            } else {
                throw 'Missing required AWS_REGION env variable';
            }
        } else {
            // This is the default global endpoint
            sts_endpoint = 'https://sts.amazonaws.com';
        }
    }

    const token = fs.readFileSync(process.env['AWS_WEB_IDENTITY_TOKEN_FILE']);

    const params = `Version=2011-06-15&Action=AssumeRoleWithWebIdentity&RoleArn=${arn}&RoleSessionName=${name}&WebIdentityToken=${token}`;

    const response = await ngx.fetch(sts_endpoint + "?" + params, {
        headers: {
            "Accept": "application/json"
        },
        method: 'GET',
    });

    const resp = await response.json();
    const creds = resp.AssumeRoleWithWebIdentityResponse.AssumeRoleWithWebIdentityResult.Credentials;

    return {
        accessKeyId: creds.AccessKeyId,
        secretAccessKey: creds.SecretAccessKey,
        sessionToken: creds.SessionToken,
        expiration: creds.Expiration,
    };
}

export default {
    awsHeaderDate,
    fetchCredentials,
    readCredentials,
    writeCredentials,
    s3date,
    s3auth,
    s3SecurityToken,
    s3uri,
    trailslashControl,
    redirectToS3,
    editHeaders,
    filterListResponse,
    // These functions do not need to be exposed, but they are exposed so that
    // unit tests can run against them.
    _padWithLeadingZeros,
    _encodeURIComponent,
    _eightDigitDate,
    _amzDatetime,
    _splitCachedValues,
    _buildSigningKeyHash,
    _buildSignatureV4,
    _escapeURIPath,
    _parseArray,
    _isHeaderToBeStripped
};
