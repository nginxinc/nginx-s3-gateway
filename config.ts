import convict from "convict";

convict.addFormat(require("convict-format-with-validator").ipaddress);

// Define a schema
const config = convict({
  env: {
    doc: "The application environment.",
    format: ["production", "development", "test"],
    default: "development",
    env: "NODE_ENV",
  },
  ip: {
    doc: "The IP address to bind.",
    format: "ipaddress",
    default: "127.0.0.1",
    env: "AWS_ACCESS_KEY_ID",
  },
  awsSecretAccessKey: {
    doc: "The port to bind.",
    format: "port",
    default: 8080,
    env: "AWS_SECRET_ACCESS_KEY"
  },
  s3Server: {
    doc: "Hostname of the S3 server",
    format: String,
    default: "minio"
  },
  s3ServerPort: {
    doc: "port on which the s3 server is listening",
    format: "port",
    default: 9000,
    env: "S3_SERVER_PORT"
  },
  s3ServerProto: {
    doc: "The http protocol for the S3 server",
    format: String,
    default: "http",
    env: "S3_SERVER_PROTO"
  },
  s3Region: {
    doc: "The AWS region in which the bucket is located",
    format: String,
    default: "us-east-1",
    env: "S3_REGION"
  }
  db: {
    host: {
      doc: "Database host name/IP",
      format: "*",
      default: "server1.dev.test",
    },
    name: {
      doc: "Database name",
      format: String,
      default: "users",
    },
  },
  admins: {
    doc: "Users with write access, or null to grant full access without login.",
    format: Array,
    nullable: true,
    default: null,
  },
});


S3_BUCKET_NAME: BUCKET_NAME,
  AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
    AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      S3_SERVER: "minio",
        S3_SERVER_PORT: "9000",
          S3_SERVER_PROTO: "http",
            S3_REGION: "us-east-1",
              DEBUG: "true",
                S3_STYLE: "virtual",
                  ALLOW_DIRECTORY_LIST: "false",
                    PROVIDE_INDEX_PAGE: "",
                      APPEND_SLASH_FOR_POSSIBLE_DIRECTORY: "",
                        STRIP_LEADING_DIRECTORY_PATH: "",
                          PREFIX_LEADING_DIRECTORY_PATH: "",
                            AWS_SIGS_VERSION: "4",
                              STATIC_SITE_HOSTING: "",
                                PROXY_CACHE_MAX_SIZE: "10g",
                                  PROXY_CACHE_INACTIVE: "60m",
                                    PROXY_CACHE_VALID_OK: "1h",
                                      PROXY_CACHE_VALID_NOTFOUND: "1m",
                                        PROXY_CACHE_VALID_FORBIDDEN: "30s",

// Load environment dependent configuration
const env = config.get("env");
config.loadFile("./config/" + env + ".json");

// Perform validation
config.validate({ allowed: "strict" });

export default config;
