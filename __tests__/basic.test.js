
const Minio = require("minio");
const request = require("supertest");

const FILES = {
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
    `
  }
};

const BUCKET_NAME = "bucket-2";
const GATEWAY_HOST = "localhost";
const GATEWAY_PORT = "8989";
const GATEWAY_BASE_URL = `http://${GATEWAY_HOST}:${GATEWAY_PORT}`;

beforeAll(async () => {
  const minioClient = new Minio.Client({
    endPoint: "localhost",
    port: 9090,
    useSSL: false,
    accessKey: 'AKIAIOSFODNN7EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  });

  await ensureBucketWithObjects(minioClient, BUCKET_NAME, FILES);
});

async function ensureBucketWithObjects(s3Client, bucketName, objects) {
  if (await s3Client.bucketExists(BUCKET_NAME)) {
    await s3Client.removeObjects(BUCKET_NAME, Object.keys(FILES));
    await s3Client.removeBucket(BUCKET_NAME);
  }

  await s3Client.makeBucket(BUCKET_NAME, 'us-east-1');

  for (const path of Object.keys(FILES)) {
    console.log(`now loading file ${path}`);
    let buf = Buffer.from(FILES[path].content, "utf-8");
    let res = await s3Client.putObject(BUCKET_NAME, path, buf);
    console.log(`Uploaded file: ${JSON.stringify(res)}`);
  }
}

describe("Ordinary filenames", () => {
  test("simple url", async () => {
    const objectPath = "a.txt";
    const res = await request(GATEWAY_BASE_URL)
      .get(`/${objectPath}`);

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("many params that should be stripped", async () => {
    const objectPath = "a.txt";
    const res = await request(GATEWAY_BASE_URL)
      .get("/a.txt?some=param&that=should&be=stripped#aaah")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("with a more complex path", async () => {
    const objectPath = "b/c/d.txt";
    const res = await request(GATEWAY_BASE_URL)
      .get("/b/c/d.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("with a more complex path", async () => {
    const objectPath = "b/e.txt";
    const res = await request(GATEWAY_BASE_URL)
      .get("/b/c/../e.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("another simple path", async () => {
    const objectPath = "b/e.txt";
    const res = await request(GATEWAY_BASE_URL)
      .get("/b/e.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("too many forward slashes", async () => {
    const objectPath = "b/e.txt";
    const res = await request(GATEWAY_BASE_URL)
      .get("/b//e.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("very long file name", async () => {
    const objectPath = "a/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.txt";
    const res = await request(GATEWAY_BASE_URL)
      .get("/a/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });
});

describe("strange file names and encodings", () => {

})

// # We try to request URLs that are properly encoded as well as URLs that
// # are not properly encoded to understand what works and what does not.

// # Weird filenames
// assertHttpRequestEquals "HEAD" "b/c/%3D" "200"
// assertHttpRequestEquals "HEAD" "b/c/=" "200"

// assertHttpRequestEquals "HEAD" "b/c/%40" "200"
// assertHttpRequestEquals "HEAD" "b/c/@" "200"

// assertHttpRequestEquals "HEAD" "b/c/%27%281%29.txt" "200"
// assertHttpRequestEquals "HEAD" "b/c/'(1).txt" "200"

// # These URLs do not work unencoded
// assertHttpRequestEquals "HEAD" 'a/plus%2Bplus.txt' "200"
// assertHttpRequestEquals "HEAD" "%D1%81%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D1%8B/%25bad%25file%25name%25" "200"

