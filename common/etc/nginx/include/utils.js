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

/**
 * Flag indicating debug mode operation. If true, additional information
 * about signature generation will be logged.
 * @type {boolean}
 */
const DEBUG = parseBoolean(process.env['S3_DEBUG']);


/**
 * Parses a string to and returns a boolean value based on its value. If the
 * string can't be parsed, this method returns false.
 *
 * @param string {*} value representing a boolean
 * @returns {boolean} boolean value of string
 */
function parseBoolean(string) {
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
 * Outputs a log message to the request logger if debug messages are enabled.
 *
 * @param r {Request} HTTP request object
 * @param msg {string} message to log
 */
function debug_log(r, msg) {
    if (DEBUG && "log" in r) {
        r.log(msg);
    }
}

export default {
    debug_log,
    parseBoolean
}
