
const Minio = require("minio");
const request = require("supertest");

const FILES = {
  "/foo/bar.txt": {
    content: "dog",
  },
  "/foo/baz.txt": {
    content: "cat",
  },
  "/grumpy.txt": {
    content: "bah",
  },
};

const BUCKET_NAME = "bucket-1";

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

test('adds 1 + 2 to equal 3', async () => {
  const res = await request('http://localhost:8989')
    .get("/foo/bar.txt")
    .set("accept", "binary/octet-stream");

  expect(res.statusCode).toBe(200);
  expect(res.text).toBe(FILES["/foo/bar.txt"].content);
});