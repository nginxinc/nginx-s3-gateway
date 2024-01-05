import request from "supertest";
import container from "./support/container";
import s3Mock from "./support/s3Mock";
import { describe, expect, test, beforeAll, afterAll } from "@jest/globals";
import { TestConfig, DummyFileList } from "./support/configuration";

const BUCKET_NAME = "bucket-3";

// Config for the running container per test
const testConfig: TestConfig = {
  name: "encodings",
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

describe("strange file names and encodings", () => {
  test("URI encoded equal sign as file name", async () => {
    const objectPath = "b/c/=";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/b/c/%3D")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(fileContent(objectPath));
  });

  test("URI encoded @ symbol as file name", async () => {
    const objectPath = "b/c/@";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/b/c/%40")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(fileContent(objectPath));
  });

  test("URI with encoded punctuation in file name", async () => {
    const objectPath = "b/c/'(1).txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/b/c/%27%281%29.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(fileContent(objectPath));
  });

  test("URI with encoded plus in file name", async () => {
    const objectPath = "a/plus+plus.txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/a/plus%2Bplus.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(fileContent(objectPath));
  });

  test("URI with cyrillic script and punctuation in file name", async () => {
    const objectPath = "системы/%bad%file%name%";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get(
        "/%D1%81%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D1%8B/%25bad%25file%25name%25",
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
    "b/c/=": {
      content: `
      This is an awful filename.
      このフィール名を選ばないでください
      `,
    },
    "b/c/@": {
      content: "",
    },
    "b/c/'(1).txt": {
      content:
        "In the midst of movement and chaos, keep stillness inside of you.",
    },
    "a/plus+plus.txt": {
      content: `代悲白頭翁　　　Lament for the White-Haired Old Man`,
    },
    "системы/%bad%file%name%": {
      content: `Filename encoding issues are hard.`,
    },
  };
}