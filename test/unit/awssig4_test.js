#!env njs

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

import awssig4 from "include/awssig4.js";
import utils from "include/utils.js";


function testBuildSigningKeyHashWithReferenceInputs() {
    printHeader('testBuildSigningKeyHashWithReferenceInputs');
    var kSecret = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';
    var date = '20150830';
    var service = 'iam';
    var region = 'us-east-1';
    var expected = 'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9';
    var signingKeyHash = awssig4._buildSigningKeyHash(kSecret, date, region, service).toString('hex');

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
    var signingKeyHash = awssig4._buildSigningKeyHash(kSecret, date, region, service).toString('hex');

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
    var eightDigitDate = utils.getEightDigitDate(timestamp);
    var amzDatetime = utils.getAmzDatetime(timestamp, eightDigitDate);
    var bucket = 'ez-test-bucket-1'
    var secret = 'pvgoBEA1z7zZKqN9RoKVksKh31AtNou+pspn+iyb'
    var creds = {secretAccessKey: secret, sessionToken: null};
    var region = 'us-west-2';
    var service = 's3';
    var server = 's3-us-west-2.amazonaws.com';

    const req = {
        uri : r.variables.uri_path,
        queryParams : '',
        host: bucket.concat('.', server)
    }
    const canonicalRequest = awssig4._buildCanonicalRequest(r, 
        r.method, req.uri, req.queryParams, req.host, amzDatetime, creds.sessionToken);

    var expected = '600721cacc21e3de14416de7517868381831f4709e5c5663bbf2b738e4d5abe4';
    var signature = awssig4._buildSignatureV4(r, 
        amzDatetime, eightDigitDate, creds, region, service, canonicalRequest);
    
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
            "request_body": "",
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
            "request_body": "",
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

async function test() {
    testBuildSigningKeyHashWithReferenceInputs();
    testBuildSigningKeyHashWithTestSuiteInputs();
    testSignatureV4();
    testSignatureV4Cache();
}

function printHeader(testName) {
    console.log(`\n## ${testName}`);
}

test();
console.log('Finished unit tests for awssig4.js');
