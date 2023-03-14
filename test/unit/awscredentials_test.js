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

import awscred from "include/awscredentials.js";
import fs from "fs";


function testReadCredentialsWithAccessSecretKeyAndSessionTokenSet() {
    printHeader('testReadCredentialsWithAccessSecretKeyAndSessionTokenSet');
    let r = {};
    process.env['S3_ACCESS_KEY_ID'] = 'SOME_ACCESS_KEY';
    process.env['S3_SECRET_KEY'] = 'SOME_SECRET_KEY';
    if ('S3_SESSION_TOKEN' in process.env) {
        process.env['S3_SESSION_TOKEN'] = 'SOME_SESSION_TOKEN';
    }

    try {
        var credentials = awscred.readCredentials(r);
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
        if ('S3_SESSION_TOKEN' in process.env) {
            delete process.env.S3_SESSION_TOKEN;
        }
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
        var credentials = awscred.readCredentials(r);
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
        var credentials = awscred.readCredentials(r);
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
    let sessionToken = null;
    if ('S3_SESSION_TOKEN' in process.env) {
        sessionToken = process.env['S3_SESSION_TOKEN'];
    }
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_KEY;
    if ('S3_SESSION_TOKEN' in process.env) {
        delete process.env.S3_SESSION_TOKEN
    }
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

        awscred.writeCredentials(r, expectedCredentials);
        let credentials = JSON.stringify(awscred.readCredentials(r));
        let expectedJson = JSON.stringify(expectedCredentials);

        if (credentials !== expectedJson) {
            console.log(`EXPECTED:\n${expectedJson}\nACTUAL:\n${credentials}`);
            throw 'Credentials do not match expected value';
        }
    } finally {
        process.env['S3_ACCESS_KEY_ID'] = accessKeyId;
        process.env['S3_SECRET_KEY'] = secretKey;
        if ('S3_SESSION_TOKEN' in process.env) {
            process.env['S3_SESSION_TOKEN'] = sessionToken
        }
    }
}

async function test() {
    testReadCredentialsWithAccessSecretKeyAndSessionTokenSet();
    testReadCredentialsFromFilePath();
    testReadCredentialsFromNonexistentPath();
    testReadAndWriteCredentialsFromKeyValStore();
}

function printHeader(testName) {
    console.log(`\n## ${testName}`);
}

test();
console.log('Finished unit tests for awscredentials.js');
