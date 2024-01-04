const Minio = require("minio");

function Client(hostname, port, accessKey, secretKey) {
  return new Minio.Client({
    endPoint: hostname,
    port: port,
    useSSL: false,
    accessKey: accessKey,
    secretKey: secretKey,
  });
}

function listObjectsInBucket(s3Client, bucketName, prefix = "") {
  const objectStream = s3Client.listObjectsV2(bucketName, prefix, /*recursive: */ true);
  const list = [];

  return new Promise((resolve, reject) => {
    objectStream.on('data', obj => list.push(obj.name));
    objectStream.on('end', () => resolve(list));
    objectStream.on('error', e => reject(e));
  });
}

async function ensureBucketWithObjects(s3Client, bucketName, objects) {
  await deleteBucket(s3Client, bucketName);
  await s3Client.makeBucket(bucketName, "us-east-1");

  for (const path of Object.keys(objects)) {
    let buf = Buffer.from(objects[path].content, "utf-8");
    let res = await s3Client.putObject(bucketName, path, buf);
  }

  console.log("S3 bucket status ensured 🔒");
}

async function deleteBucket(s3Client, bucketName) {
  if (!await s3Client.bucketExists(bucketName)) return;

  const items = await listObjectsInBucket(s3Client, bucketName);
  await s3Client.removeObjects(bucketName, items);
  await s3Client.removeBucket(bucketName);
}

module.exports = {
  Client,
  ensureBucketWithObjects,
  deleteBucket
};