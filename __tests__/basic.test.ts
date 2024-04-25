import request from "supertest";
import container from "./support/container";
import s3Mock from "./support/s3Mock";
import { describe, expect, test, beforeAll, afterAll } from "@jest/globals";
import { TestConfig, DummyFileList } from "./support/configuration";

const BUCKET_NAME = "bucket-2";

// Config for the running container per test
const testConfig: TestConfig = {
  name: "base_test",
  image: {
    dockerfile: "Dockerfile.oss",
  },
  container: {
    env: {
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
    },
  },
};

const CONFIG = container.Config(testConfig);

const minioClient = s3Mock.Client(
  "localhost",
  9090,
  "AKIAIOSFODNN7EXAMPLE",
  "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
);

beforeAll(async () => {
  try {
    await container.stop(CONFIG);
  } catch (e) {
    console.log("no container to stop");
  }

  await s3Mock.ensureBucketWithObjects(minioClient, BUCKET_NAME, files());
  await container.build(CONFIG);
  await container.start(CONFIG);
});

afterAll(async () => {
  await container.stop(CONFIG);
  await s3Mock.deleteBucket(minioClient, BUCKET_NAME);
});

describe("Ordinary filenames", () => {
  test("simple url", async () => {
    const objectPath = "a.txt";
    const res = await request(CONFIG.testContainer.baseUrl).get(
      `/${objectPath}`,
    );
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(fileContent(objectPath));
  });

  test("many params that should be stripped", async () => {
    const objectPath = "a.txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/a.txt?some=param&that=should&be=stripped#aaah")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(fileContent(objectPath));
  });

  test("with a more complex path", async () => {
    const objectPath = "b/c/d.txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/b/c/d.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(fileContent(objectPath));
  });

  test("another simple path", async () => {
    const objectPath = "b/e.txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/b/e.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(fileContent(objectPath));
  });

  test("too many forward slashes", async () => {
    const objectPath = "b/e.txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/b//e.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(fileContent(objectPath));
  });

  test("very long file name", async () => {
    const objectPath =
      "a/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get(
        "/a/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.txt",
      )
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(fileContent(objectPath));
  });
});

function fileContent(key: string): string | undefined {
  return files()[key]?.content;
}

function files(): DummyFileList {
  return {
    "a.txt": {
      content: "Let go, or be dragged.",
    },
    "b/c/d.txt": {
      content: `When thoughts arise, then do all things arise. When thoughts vanish, then do all things vanish.`,
    },
    "b/e.txt": {
      content: "If only you could hear the sound of snow.",
    },
    "a/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.txt": {
      content: `
      "Where the is not one thing, what then?"
      "Throw it away!"
      "With not one thing, what there is to throw away?"
      "Then carry it off!"
      `,
    },
  };
}
