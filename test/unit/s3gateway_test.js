#!env njs

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

import s3gateway from "include/s3gateway.js";
import fs from "fs";

globalThis.ngx = {};

var fakeRequest = {
    "remoteAddress" : "172.17.0.1",
    "headersIn" : {
        "Connection" : "keep-alive",
        "Accept-Encoding" : "gzip, deflate",
        "Accept-Language" : "en-US,en;q=0.7,ja;q=0.3",
        "Host" : "localhost:8999",
        "User-Agent" : "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:79.0) Gecko/20100101 Firefox/79.0",
        "DNT" : "1",
        "Cache-Control" : "max-age=0",
        "Accept" : "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Upgrade-Insecure-Requests" : "1"
    },
    "uri" : "/a/c/ramen.jpg",
    "method" : "GET",
    "httpVersion" : "1.1",
    "headersOut" : {},
    "args" : {
        "foo" : "bar"
    },
    "status" : 0
};

fakeRequest.log = function(msg) {
    console.log(msg);
}

function testEncodeURIComponent() {
    printHeader('testEncodeURIComponent');
    function testPureAsciiAlphaNum() {
        console.log('  ## testPureAsciiAlphaNum');
        let alphaNum = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let encoded = s3gateway._encodeURIComponent(alphaNum);
        if (alphaNum !== alphaNum) {
            throw 'Incorrect encoding applied to string.\n' +
            `Actual:   [${encoded}]\n` +
            `Expected: [${expected}]`;
        }
    }
    function testUnicodeText() {
        console.log('  ## testUnicodeText');
        let unicode = 'これは　This is ASCII системы  חן ';
        let expected = '%E3%81%93%E3%82%8C%E3%81%AF%E3%80%80This%20is%20ASCII%20%D1%81%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D1%8B%20%20%D7%97%D7%9F%20';
        let encoded = s3gateway._encodeURIComponent(unicode);
        if (expected !== encoded) {
            throw 'Incorrect encoding applied to string.\n' +
            `Actual:   [${encoded}]\n` +
            `Expected: [${expected}]`;
        }
    }
    function testDiceyCharactersInText() {
        console.log('  ## testDiceyCharactersInText');

        let diceyCharacters = '%@!*()=+$#^&|\\/';
        for (let i = 0; i < diceyCharacters.length; i++) {
            let char = diceyCharacters[i];
            let encoded = s3gateway._encodeURIComponent(char);
            let expected = `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
            if (encoded !== expected) {
                throw 'Incorrect encoding applied to string.\n' +
                `Actual:   [${encoded}]\n` +
                `Expected: [${expected}]`;
            }
        }
    }

    testPureAsciiAlphaNum();
    testUnicodeText();
    testDiceyCharactersInText();
}

function testPad() {
    printHeader('testPad');
    var padSingleDigit = s3gateway._padWithLeadingZeros(3, 2);
    var expected = '03';

    if (padSingleDigit !== expected) {
        throw 'Single digit 3 was not padded with leading zero.\n' +
        'Actual:   ' + padSingleDigit + '\n' +
        'Expected: ' + expected;
    }
}

function testEightDigitDate() {
    printHeader('testEightDigitDate');
    var timestamp = new Date('2020-08-03T02:01:09.004Z');
    var eightDigitDate = s3gateway._eightDigitDate(timestamp);
    var expected = '20200803';

    if (eightDigitDate !== expected) {
        throw 'Eight digit date was not created correctly.\n' +
        'Actual:   ' + eightDigitDate + '\n' +
        'Expected: ' + expected;
    }
}

function testAmzDatetime() {
    printHeader('testAmzDatetime');
    var timestamp = new Date('2020-08-03T02:01:09.004Z');
    var eightDigitDate = s3gateway._eightDigitDate(timestamp);
    var amzDatetime = s3gateway._amzDatetime(timestamp, eightDigitDate);
    var expected = '20200803T020109Z';

    if (amzDatetime !== expected) {
        throw 'Amazon date time was not created correctly.\n' +
        'Actual:   [' + amzDatetime + ']\n' +
        'Expected: [' + expected + ']';
    }
}

function testSplitCachedValues() {
    printHeader('testSplitCachedValues');
    var eightDigitDate = "20200811"
    var kSigningHash = "{\"type\":\"Buffer\",\"data\":[164,135,1,191,232,3,16,62,137,5,31,85,175,34,151,221,118,120,59,188,235,94,180,22,218,183,30,14,173,203,196,246]}"
    var cached = eightDigitDate + ":" + kSigningHash;
    var fields = s3gateway._splitCachedValues(cached);

    if (fields.length !== 2) {
        throw 'Unexpected array length returned.\n' +
        'Actual:   [' + fields.length + ']\n' +
        'Expected: [2]';
    }

    if (fields[0] !== eightDigitDate) {
        throw 'Eight digit date field not extracted correctly.\n' +
        'Actual:   [' + fields[0] + ']\n' +
        'Expected: [' + eightDigitDate + ']';
    }

    if (fields[1] !== kSigningHash) {
        throw 'kSigningHash field not extracted correctly.\n' +
        'Actual:   [' + fields[1] + ']\n' +
        'Expected: [' + kSigningHash + ']';
    }
}

function testBuildSigningKeyHashWithReferenceInputs() {
    printHeader('testBuildSigningKeyHashWithReferenceInputs');
    var kSecret = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';
    var date = '20150830';
    var service = 'iam';
    var region = 'us-east-1';
    var expected = 'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9';
    var signingKeyHash = s3gateway._buildSigningKeyHash(kSecret, date, service, region).toString('hex');

    if (signingKeyHash !== expected) {
        throw 'Signing key hash was not created correctly.\n' +
        'Actual:   [' + signingKeyHash + ']\n' +
        'Expected: [' + expected + ']';
    }
}

function testBuildSigningKeyHashWithTestSuiteInputs() {
    printHeader('testBuildSigningKeyHashWithTestSuiteInputs');
    var kSecret = 'pvgoBEA1z7zZKqN9RoKVksKh31AtNou+pspn+iyb';
    var date = '20200811';
    var service = 's3';
    var region = 'us-west-2';
    var expected = 'a48701bfe803103e89051f55af2297dd76783bbceb5eb416dab71e0eadcbc4f6';
    var signingKeyHash = s3gateway._buildSigningKeyHash(kSecret, date, service, region).toString('hex');

    if (signingKeyHash !== expected) {
        throw 'Signing key hash was not created correctly.\n' +
        'Actual:   [' + signingKeyHash + ']\n' +
        'Expected: [' + expected + ']';
    }
}

function _runSignatureV4(r) {
    r.log = function(msg) {
        console.log(msg);
    }
    var timestamp = new Date('2020-08-11T19:42:14Z');
    var eightDigitDate = s3gateway._eightDigitDate(timestamp);
    var amzDatetime = s3gateway._amzDatetime(timestamp, eightDigitDate);
    var bucket = 'ez-test-bucket-1'
    var secret = 'pvgoBEA1z7zZKqN9RoKVksKh31AtNou+pspn+iyb'
    var region = 'us-west-2';
    var server = 's3-us-west-2.amazonaws.com';

    var expected = 'cf4dd9e1d28c74e2284f938011efc8230d0c20704f56f67e4a3bfc2212026bec';
    var signature = s3gateway._buildSignatureV4(r, amzDatetime, eightDigitDate, {secretAccessKey: secret}, bucket, region, server);

    if (signature !== expected) {
        throw 'V4 signature hash was not created correctly.\n' +
        'Actual:   [' + signature + ']\n' +
        'Expected: [' + expected + ']';
    }
}

function testSignatureV4() {
    printHeader('testSignatureV4');
    // Note: since this is a read-only gateway, host, query parameters and all
    // client headers will be ignored.
    var r = {
        "remoteAddress" : "172.17.0.1",
        "headersIn" : {
            "Connection" : "keep-alive",
            "Accept-Encoding" : "gzip, deflate",
            "Accept-Language" : "en-US,en;q=0.7,ja;q=0.3",
            "Host" : "localhost:8999",
            "User-Agent" : "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:79.0) Gecko/20100101 Firefox/79.0",
            "DNT" : "1",
            "Cache-Control" : "max-age=0",
            "Accept" : "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Upgrade-Insecure-Requests" : "1"
        },
        "uri" : "/a/c/ramen.jpg",
        "method" : "GET",
        "httpVersion" : "1.1",
        "headersOut" : {},
        "args" : {
            "foo" : "bar"
        },
        "variables" : {
            "uri_path": "/a/c/ramen.jpg"
        },
        "status" : 0
    };

    _runSignatureV4(r);
}

function testSignatureV4Cache() {
    printHeader('testSignatureV4Cache');
    // Note: since this is a read-only gateway, host, query parameters and all
    // client headers will be ignored.
    var r = {
        "remoteAddress" : "172.17.0.1",
        "headersIn" : {
            "Connection" : "keep-alive",
            "Accept-Encoding" : "gzip, deflate",
            "Accept-Language" : "en-US,en;q=0.7,ja;q=0.3",
            "Host" : "localhost:8999",
            "User-Agent" : "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:79.0) Gecko/20100101 Firefox/79.0",
            "DNT" : "1",
            "Cache-Control" : "max-age=0",
            "Accept" : "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Upgrade-Insecure-Requests" : "1"
        },
        "uri" : "/a/c/ramen.jpg",
        "method" : "GET",
        "httpVersion" : "1.1",
        "headersOut" : {},
        "args" : {
            "foo" : "bar"
        },
        "variables": {
            "cache_signing_key_enabled": 1,
            "uri_path": "/a/c/ramen.jpg"
        },
        "status" : 0
    };

    _runSignatureV4(r);

    if (!"signing_key_hash" in r.variables) {
        throw "Hash key not written to r.variables.signing_key_hash";
    }

    _runSignatureV4(r);
}

function testEditHeaders() {
    printHeader('testEditHeaders');

    const r = {
        "headersOut": {
            "Accept-Ranges": "bytes",
            "Content-Length": 42,
            "Content-Security-Policy": "block-all-mixed-content",
            "Content-Type": "text/plain",
            "X-Amz-Bucket-Region": "us-east-1",
            "X-Amz-Request-Id": "166539E18A46500A",
            "X-Xss-Protection": "1; mode=block"
        },
        "variables": {
            "uri_path": "/a/c/ramen.jpg"
        },
    }

    r.log = function(msg) {
        console.log(msg);
    }

    s3gateway.editHeaders(r);

    for (const key in r.headersOut) {
        if (key.toLowerCase().indexOf("x-amz", 0) >= 0) {
            throw "x-amz header not stripped from headers correctly";
        }
    }
}

function testEditHeadersHeadDirectory() {
    printHeader('testEditHeadersHeadDirectory');
    let r = {
        "method": "HEAD",
        "headersOut" : {
            "Content-Security-Policy": "block-all-mixed-content",
                "Content-Type": "application/xml",
                "Server": "AmazonS3",
                "X-Amz-Bucket-Region": "us-east-1",
                "X-Amz-Request-Id": "166539E18A46500A",
                "X-Xss-Protection": "1; mode=block"
        },
    "variables": {
            "uri_path": "/a/c/"
        },
    }

    r.log = function(msg) {
        console.log(msg);
    }

    s3gateway.editHeaders(r);

    if (r.headersOut.length > 0) {
        throw "all headers were not stripped from request";
    }
}

function testIsHeaderToBeStripped() {
    printHeader('testIsHeaderToBeStripped');
    // if (s3gateway._isHeaderToBeStripped('cache-control', [])) {
    //     throw "valid header should not be stripped";
    // }
    // if (!s3gateway._isHeaderToBeStripped('x-amz-request-id', [])) {
    //     throw "x-amz header should always be stripped";
    // }
    if (!s3gateway._isHeaderToBeStripped('x-goog-storage-class',
        ['x-goog'])) {
        throw "x-goog-storage-class header should be stripped";
    }
}

function testEscapeURIPathPreservesDoubleSlashes() {
    printHeader('testEscapeURIPathPreservesDoubleSlashes');
    var doubleSlashed = '/testbucketer2/foo3//bar3/somedir/license';
    var actual = s3gateway._escapeURIPath(doubleSlashed);
    var expected = '/testbucketer2/foo3//bar3/somedir/license';

    if (actual !== expected) {
        throw 'URI Path escaping is stripping slashes'
    }
}

function testReadCredentialsWithAccessSecretKeyAndSessionTokenSet() {
    printHeader('testReadCredentialsWithAccessSecretKeyAndSessionTokenSet');
    let r = {};
    process.env['S3_ACCESS_KEY_ID'] = 'SOME_ACCESS_KEY';
    process.env['S3_SECRET_KEY'] = 'SOME_SECRET_KEY';
    if ('S3_SESSION_TOKEN' in process.env) {
        process.env['S3_SESSION_TOKEN'] = 'SOME_SESSION_TOKEN';
    }

    try {
        var credentials = s3gateway.readCredentials(r);
        if (credentials.accessKeyId !== process.env['S3_ACCESS_KEY_ID']) {
            throw 'static credentials do not match returned value [accessKeyId]';
        }
        if (credentials.secretAccessKey !== process.env['S3_SECRET_KEY']) {
            throw 'static credentials do not match returned value [secretAccessKey]';
        }
        if ('S3_SESSION_TOKEN' in process.env) {
            if (credentials.sessionToken !== process.env['S3_SESSION_TOKEN']) {
                throw 'static credentials do not match returned value [sessionToken]';
            }
        } else {
            if (credentials.sessionToken !== null) {
                throw 'static credentials do not match returned value [sessionToken]';
            }
        }
        if (credentials.expiration !== null) {
            throw 'static credentials do not match returned value [expiration]';
        }

    } finally {
        delete process.env.S3_ACCESS_KEY_ID;
        delete process.env.S3_SECRET_KEY;
        delete process.env.S3_SESSION_TOKEN;
    }
}

function testReadCredentialsFromFilePath() {
    printHeader('testReadCredentialsFromFilePath');
    let r = {
        variables: {
            cache_instance_credentials_enabled: 0
        }
    };

    var originalCredentialPath = process.env['S3_CREDENTIALS_TEMP_FILE'];
    var tempDir = (process.env['TMPDIR'] ? process.env['TMPDIR'] : '/tmp');
    var uniqId = `${new Date().getTime()}-${Math.floor(Math.random()*101)}`;
    var tempFile = `${tempDir}/credentials-unit-test-${uniqId}.json`;
    var testData = '{"accessKeyId":"A","secretAccessKey":"B",' +
        '"sessionToken":"C","expiration":"2022-02-15T04:49:08Z"}';
    fs.writeFileSync(tempFile, testData);

    try {
        process.env['S3_CREDENTIALS_TEMP_FILE'] = tempFile;
        var credentials = s3gateway.readCredentials(r);
        var testDataAsJSON = JSON.parse(testData);
        if (credentials.accessKeyId !== testDataAsJSON.accessKeyId) {
            throw 'JSON test data does not match credentials [accessKeyId]';
        }
        if (credentials.secretAccessKey !== testDataAsJSON.secretAccessKey) {
            throw 'JSON test data does not match credentials [secretAccessKey]';
        }
        if (credentials.sessionToken !== testDataAsJSON.sessionToken) {
            throw 'JSON test data does not match credentials [sessionToken]';
        }
        if (credentials.expiration !== testDataAsJSON.expiration) {
            throw 'JSON test data does not match credentials [expiration]';
        }
    } finally {
        if (originalCredentialPath) {
            process.env['S3_CREDENTIALS_TEMP_FILE'] = originalCredentialPath;
        }
        if (fs.statSync(tempFile, {throwIfNoEntry: false})) {
            fs.unlinkSync(tempFile);
        }
    }
}

function testReadCredentialsFromNonexistentPath() {
    printHeader('testReadCredentialsFromNonexistentPath');
    let r = {
        variables: {
            cache_instance_credentials_enabled: 0
        }
    };
    var originalCredentialPath = process.env['S3_CREDENTIALS_TEMP_FILE'];
    var tempDir = (process.env['TMPDIR'] ? process.env['TMPDIR'] : '/tmp');
    var uniqId = `${new Date().getTime()}-${Math.floor(Math.random()*101)}`;
    var tempFile = `${tempDir}/credentials-unit-test-${uniqId}.json`;

    try {
        process.env['S3_CREDENTIALS_TEMP_FILE'] = tempFile;
        var credentials = s3gateway.readCredentials(r);
        if (credentials !== undefined) {
            throw 'Credentials returned when no credentials file should be present';
        }

    } finally {
        if (originalCredentialPath) {
            process.env['S3_CREDENTIALS_TEMP_FILE'] = originalCredentialPath;
        }
        if (fs.statSync(tempFile, {throwIfNoEntry: false})) {
            fs.unlinkSync(tempFile);
        }
    }
}

function testReadAndWriteCredentialsFromKeyValStore() {
    printHeader('testReadAndWriteCredentialsFromKeyValStore');

    let accessKeyId = process.env['S3_ACCESS_KEY_ID'];
    let secretKey = process.env['S3_SECRET_KEY'];
    let sessionToken = process.env['S3_SESSION_TOKEN'];
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_KEY;
    delete process.env.S3_SESSION_TOKEN

    try {
        let r = {
            variables: {
                cache_instance_credentials_enabled: 1,
                instance_credential_json: null
            }
        };
        let expectedCredentials = {
            AccessKeyId: 'AN_ACCESS_KEY_ID',
            Expiration: '2017-05-17T15:09:54Z',
            RoleArn: 'TASK_ROLE_ARN',
            SecretAccessKey: 'A_SECRET_ACCESS_KEY',
            Token: 'A_SECURITY_TOKEN',
        };

        s3gateway.writeCredentials(r, expectedCredentials);
        let credentials = JSON.stringify(s3gateway.readCredentials(r));
        let expectedJson = JSON.stringify(expectedCredentials);

        if (credentials !== expectedJson) {
            console.log(`EXPECTED:\n${expectedJson}\nACTUAL:\n${credentials}`);
            throw 'Credentials do not match expected value';
        }
    } finally {
        process.env['S3_ACCESS_KEY_ID'] = accessKeyId;
        process.env['S3_SECRET_KEY'] = secretKey;
        process.env['S3_SESSION_TOKEN'] = sessionToken;
    }
}

async function testEcsCredentialRetrieval() {
    printHeader('testEcsCredentialRetrieval');
    process.env['S3_ACCESS_KEY_ID'] = undefined;
    process.env['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI'] = '/example';
    globalThis.ngx.fetch = function (url) {
        globalThis.recordedUrl = url;

        return Promise.resolve({
            ok: true,
            json: function () {
                return Promise.resolve({
                    AccessKeyId: 'AN_ACCESS_KEY_ID',
                    Expiration: '2017-05-17T15:09:54Z',
                    RoleArn: 'TASK_ROLE_ARN',
                    SecretAccessKey: 'A_SECRET_ACCESS_KEY',
                    Token: 'A_SECURITY_TOKEN',
                });
            }
        });
    };
    var r = {
        "headersOut" : {
            "Accept-Ranges": "bytes",
            "Content-Length": 42,
            "Content-Security-Policy": "block-all-mixed-content",
            "Content-Type": "text/plain",
            "X-Amz-Bucket-Region": "us-east-1",
            "X-Amz-Request-Id": "166539E18A46500A",
            "X-Xss-Protection": "1; mode=block"
        },
        log: function(msg) {
            console.log(msg);
        },
        return: function(code) {
            if (code !== 200) {
                throw 'Expected 200 status code, got: ' + code;
            }
        },
    };

    await s3gateway.fetchCredentials(r);

    if (globalThis.recordedUrl !== 'http://169.254.170.2/example') {
        throw 'No or wrong ECS credentials fetch URL recorded: ' + globalThis.recordedUrl;
    }
}

async function testEc2CredentialRetrieval() {
    printHeader('testEc2CredentialRetrieval');
    process.env['S3_ACCESS_KEY_ID'] = undefined;
    process.env['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI'] = undefined;
    globalThis.ngx.fetch = function (url, options) {
        if (url === 'http://169.254.169.254/latest/api/token' && options && options.method === 'PUT') {
            return Promise.resolve({
                ok: true,
                text: function () {
                    return Promise.resolve('A_TOKEN');
                },
            });
        } else if (url === 'http://169.254.169.254/latest/meta-data/iam/security-credentials/') {
            if (options && options.headers && options.headers['x-aws-ec2-metadata-token'] === 'A_TOKEN') {
                return Promise.resolve({
                    ok: true,
                    text: function () {
                        return Promise.resolve('A_ROLE_NAME');
                    },
                });
            } else {
                throw 'Invalid token passed: ' + options.headers['x-aws-ec2-metadata-token'];
            }
        }  else if (url === 'http://169.254.169.254/latest/meta-data/iam/security-credentials/A_ROLE_NAME') {
            if (options && options.headers && options.headers['x-aws-ec2-metadata-token'] === 'A_TOKEN') {
                return Promise.resolve({
                    ok: true,
                    json: function () {
                        globalThis.credentialsIssued = true;
                        return Promise.resolve({
                            AccessKeyId: 'AN_ACCESS_KEY_ID',
                            Expiration: '2017-05-17T15:09:54Z',
                            RoleArn: 'TASK_ROLE_ARN',
                            SecretAccessKey: 'A_SECRET_ACCESS_KEY',
                            Token: 'A_SECURITY_TOKEN',
                        });
                    },
                });
            } else {
                throw 'Invalid token passed: ' + options.headers['x-aws-ec2-metadata-token'];
            }
        } else {
            throw 'Invalid request URL: ' + url;
        }
    };
    var r = {
        "headersOut" : {
            "Accept-Ranges": "bytes",
            "Content-Length": 42,
            "Content-Security-Policy": "block-all-mixed-content",
            "Content-Type": "text/plain",
            "X-Amz-Bucket-Region": "us-east-1",
            "X-Amz-Request-Id": "166539E18A46500A",
            "X-Xss-Protection": "1; mode=block"
        },
        log: function(msg) {
            console.log(msg);
        },
        return: function(code) {
            if (code !== 200) {
                throw 'Expected 200 status code, got: ' + code;
            }
        },
    };

    await s3gateway.fetchCredentials(r);

    if (!globalThis.credentialsIssued) {
        throw 'Did not reach the point where EC2 credentials were issues.';
    }
}

function printHeader(testName) {
    console.log(`\n## ${testName}`);
}

function testParseArray() {
    printHeader('testParseArray');

    function testParseNull() {
        console.log('  ## testParseNull');
        const actual = s3gateway._parseArray(null);
        if (!Array.isArray(actual) || actual.length > 0) {
            throw 'Null not parsed into an empty array';
        }
    }
    function testParseEmptyString() {
        console.log('  ## testParseEmptyString');
        const actual = s3gateway._parseArray('');
        if (!Array.isArray(actual) || actual.length > 0) {
            throw 'Empty string not parsed into an empty array';
        }
    }
    function testParseSingleValue() {
        console.log('  ## testParseSingleValue');
        const value = 'Single Value';
        const actual = s3gateway._parseArray(value);
        if (!Array.isArray(actual) || actual.length !== 1) {
            throw 'Single value not parsed into an array with a single element';
        }
        if (actual[0] !== value) {
            throw `Unexpected array element: ${actual[0]}`
        }
    }
    function testParseMultipleValues() {
        console.log('  ## testParseMultipleValues');
        const values = ['string 1', 'something else', 'Yet another value'];
        const textValues = values.join(';');
        const actual = s3gateway._parseArray(textValues);
        if (!Array.isArray(actual) || actual.length !== values.length) {
            throw 'Multiple values not parsed into an array with the expected length';
        }
        for (let i = 0; i < values.length; i++) {
            if (values[i] !== actual[i]) {
                throw `Unexpected array element [${i}]: ${actual[i]}`
            }
        }
    }

    function testParseMultipleValuesTrailingDelimiter() {
        console.log('  ## testParseMultipleValuesTrailingDelimiter');
        const values = ['string 1', 'something else', 'Yet another value'];
        const textValues = values.join(';');
        const actual = s3gateway._parseArray(textValues + ';');
        if (!Array.isArray(actual) || actual.length !== values.length) {
            throw 'Multiple values not parsed into an array with the expected length';
        }
        for (let i = 0; i < values.length; i++) {
            if (values[i] !== actual[i]) {
                throw `Unexpected array element [${i}]: ${actual[i]}`
            }
        }
    }

    testParseNull();
    testParseEmptyString();
    testParseSingleValue();
    testParseMultipleValues();
    testParseMultipleValuesTrailingDelimiter();
}

async function test() {
    testEncodeURIComponent();
    testPad();
    testEightDigitDate();
    testAmzDatetime();
    testSplitCachedValues();
    testBuildSigningKeyHashWithReferenceInputs();
    testBuildSigningKeyHashWithTestSuiteInputs();
    testSignatureV4();
    testSignatureV4Cache();
    testIsHeaderToBeStripped();
    testEditHeaders();
    testEditHeadersHeadDirectory();
    testEscapeURIPathPreservesDoubleSlashes();
    testReadCredentialsWithAccessSecretKeyAndSessionTokenSet();
    testReadCredentialsFromFilePath();
    testReadCredentialsFromNonexistentPath();
    testReadAndWriteCredentialsFromKeyValStore();
    await testEcsCredentialRetrieval();
    await testEc2CredentialRetrieval();
    testParseArray();
}

test();
console.log('Finished unit tests');
