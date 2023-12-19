
const Minio = require("minio");

const FILES = [
  {
    path: "/foo/bar.txt",
    content: "dog"
  },
  {
    path: "/foo/baz.txt",
    content: "cat"
  },
  {
    path: "/grumpy.txt",
    content: "bah"
  }
];

const BUCKET_NAME = "javier";

beforeAll(async () => {
  const minioClient = new Minio.Client({
    endPoint: "localhost",
    port: 9090,
    useSSL: false,
    accessKey: 'AKIAIOSFODNN7EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  });

  ensureBucketWithObjects(minioClient, BUCKET_NAME, FILES);
});

async function ensureBucketWithObjects(s3Client, bucketName, objects) {
  if (await s3Client.bucketExists(BUCKET_NAME)) {
    await s3Client.removeObjects(BUCKET_NAME, FILES.map((f) => f.path));
    await s3Client.removeBucket(BUCKET_NAME);
  }

  await s3Client.makeBucket(BUCKET_NAME, 'us-east-1');

  for (const i in FILES) {
    console.log(`now loading file ${FILES[i]}`)
    let buf = Buffer.from(FILES[i].content, "utf-8");
    let res = await s3Client.putObject(BUCKET_NAME, FILES[i].path, buf);
    console.log(`Uploaded file: ${JSON.stringify(res)}`);
  }
}

test('adds 1 + 2 to equal 3', () => {
  expect(true).toBe(true);
});