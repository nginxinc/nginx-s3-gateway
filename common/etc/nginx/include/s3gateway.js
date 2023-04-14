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

import awscred from "./awscredentials.js";
import awssig2 from "./awssig2.js";
import awssig4 from "./awssig4.js";
import utils from "./utils.js";

_requireEnvVars('S3_BUCKET_NAME');
_requireEnvVars('S3_SERVER');
_requireEnvVars('S3_SERVER_PROTO');
_requireEnvVars('S3_SERVER_PORT');
_requireEnvVars('S3_REGION');
_requireEnvVars('AWS_SIGS_VERSION');
_requireEnvVars('S3_STYLE');

const fs = require('fs');

/**
 * Flag indicating debug mode operation. If true, additional information
 * about signature generation will be logged.
 * @type {boolean}
 */
const ALLOW_LISTING = utils.parseBoolean(process.env['ALLOW_DIRECTORY_LIST']);
const PROVIDE_INDEX_PAGE = utils.parseBoolean(process.env['PROVIDE_INDEX_PAGE']);
const APPEND_SLASH = utils.parseBoolean(process.env['APPEND_SLASH_FOR_POSSIBLE_DIRECTORY']);
const FOUR_O_FOUR_ON_EMPTY_BUCKET = utils.parseBoolean(process.env['FOUR_O_FOUR_ON_EMPTY_BUCKET']);
const S3_STYLE = process.env['S3_STYLE'];

const ADDITIONAL_HEADER_PREFIXES_TO_STRIP = utils.parseArray(process.env['HEADER_PREFIXES_TO_STRIP']);

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
    return utils.getAmzDatetime(NOW, utils.getEightDigitDate(NOW));
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

    const credentials = awscred.readCredentials(r);
    if (sigver == '2') {
        let req = _s3ReqParamsForSigV2(r, bucket);
        signature = awssig2.signatureV2(r, req.uri, req.httpDate, credentials);
    } else {
        let req = _s3ReqParamsForSigV4(r, bucket, server);
        signature = awssig4.signatureV4(r, NOW, region, SERVICE,
            req.uri, req.queryParams, req.host, credentials);
    }

    return signature;
}

/**
 * Generate some of request parameters for AWS signature version 2
 *
 * @see {@link https://docs.aws.amazon.com/AmazonS3/latest/userguide/auth-request-sig-v2.html | AWS signature version 2}
 * @param r {Request} HTTP request object
 * @param bucket {string} S3 bucket associated with request
 * @returns s3ReqParams {object} s3ReqParams object (host, method, uri, queryParams)
 * @private
 */
function _s3ReqParamsForSigV2(r, bucket) {
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

    return {
        uri: '/' + bucket + uri,
        httpDate: s3date(r)
    };
}

/**
 * Generate some of request parameters for AWS signature version 4
 *
 * @see {@link https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html | AWS V4 Signing Process}
 * @param r {Request} HTTP request object
 * @param bucket {string} S3 bucket associated with request
 * @param server {string} S3 host associated with request
 * @returns s3ReqParams {object} s3ReqParams object (host, uri, queryParams)
 * @private
 */
function _s3ReqParamsForSigV4(r, bucket, server) {
    let host = server;
    if (S3_STYLE === 'virtual' || S3_STYLE === 'default' || S3_STYLE === undefined) {
        host = bucket + '.' + host;
    }
    const baseUri = s3BaseUri(r);
    const queryParams = _s3DirQueryParams(r.variables.uri_path, r.method);
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
    return {
        host: host,
        uri: uri,
        queryParams: queryParams
    };
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
        utils.debug_log(r, 'Using path style uri : ' + '/' + bucket);
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

    utils.debug_log(r, 'S3 Request URI: ' + r.method + ' ' + path);
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
        utils.debug_log(r, 'Invalid method requested: ' + r.method);
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
 * Processes the directory listing output as returned from S3. If
 * FOUR_O_FOUR_ON_EMPTY_BUCKET is enabled, this function will corrupt the
 * XML output by inserting the string 'junk' into the output thereby causing
 * nginx to return a 404 for empty directory listings.
 *
 * If anyone finds a better way to do this, please submit a PR.
 *
 * @param r {Request} HTTP request object (not used, but required for NGINX configuration)
 * @param data chunked data buffer
 * @param flags contains field that indicates that a chunk is last
 */
function filterListResponse(r, data, flags) {
    if (FOUR_O_FOUR_ON_EMPTY_BUCKET) {
        let indexIsEmpty = utils.parseBoolean(r.variables.indexIsEmpty);

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
    } else {
        r.sendBuffer(data, flags);
    }
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
 * Checks to see if the given environment variable is present. If not, an error
 * is thrown.
 * @param envVarName {string} environment variable to check for
 * @private
 */
function _requireEnvVars(envVarName) {
    const isSet = envVarName in process.env;

    if (!isSet) {
        throw(`Required environment variable ${envVarName} is missing`);
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
    if (utils.areAllEnvVarsSet(['S3_ACCESS_KEY_ID', 'S3_SECRET_KEY'])) {
        r.return(200);
        return;
    }

    let current;

    try {
        current = awscred.readCredentials(r);
    } catch (e) {
        utils.debug_log(r, `Could not read credentials: ${e}`);
        r.return(500);
        return;
    }

    if (current) {
        // If AWS returns a Unix timestamp it will be in seconds, but in Date constructor we should provide timestamp in milliseconds
        // In some situations (including EC2 and Fargate) current.expiration will be an RFC 3339 string - see https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-roles-for-amazon-ec2.html#instance-metadata-security-credentials
        const expireAt = typeof current.expiration == 'number' ? current.expiration * 1000 : current.expiration
        const exp = new Date(expireAt).getTime() - maxValidityOffsetMs;
        if (NOW.getTime() < exp) {
            r.return(200);
            return;
        }
    }

    let credentials;

    utils.debug_log(r, 'Cached credentials are expired or not present, requesting new ones');

    if (utils.areAllEnvVarsSet('AWS_CONTAINER_CREDENTIALS_RELATIVE_URI')) {
        const relative_uri = process.env['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI'] || '';
        const uri = ECS_CREDENTIAL_BASE_URI + relative_uri;
        try {
            credentials = await _fetchEcsRoleCredentials(uri);
        } catch (e) {
            utils.debug_log(r, 'Could not load ECS task role credentials: ' + JSON.stringify(e));
            r.return(500);
            return;
        }
    }
    else if (utils.areAllEnvVarsSet('AWS_WEB_IDENTITY_TOKEN_FILE')) {
        try {
            credentials = await _fetchWebIdentityCredentials(r)
        } catch(e) {
            utils.debug_log(r, 'Could not assume role using web identity: ' + JSON.stringify(e));
            r.return(500);
            return;
        }
    } else {
        try {
            credentials = await _fetchEC2RoleCredentials();
        } catch (e) {
            utils.debug_log(r, 'Could not load EC2 task role credentials: ' + JSON.stringify(e));
            r.return(500);
            return;
        }
    }
    try {
        awscred.writeCredentials(r, credentials);
    } catch (e) {
        utils.debug_log(r, `Could not write credentials: ${e}`);
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
    s3date,
    s3auth,
    s3uri,
    trailslashControl,
    redirectToS3,
    editHeaders,
    filterListResponse,
    // These functions do not need to be exposed, but they are exposed so that
    // unit tests can run against them.
    _s3ReqParamsForSigV2,
    _s3ReqParamsForSigV4,
    _encodeURIComponent,
    _escapeURIPath,
    _isHeaderToBeStripped
};
