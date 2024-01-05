import * as Minio from "minio";

type s3BucketItem = {
  content: string;
};

type s3BucketContents = {
  [key: string]: s3BucketItem;
};

export function Client(
  hostname: string,
  port: number,
  accessKey: string,
  secretKey: string,
): Minio.Client {
  return new Minio.Client({
    endPoint: hostname,
    port: port,
    useSSL: false,
    accessKey: accessKey,
    secretKey: secretKey,
  });
}

export function listObjectsInBucket(
  s3Client: Minio.Client,
  bucketName: string,
  prefix = "",
): Promise<string[]> {
  const objectStream = s3Client.listObjectsV2(
    bucketName,
    prefix,
    /*recursive: */ true,
  );
  const list: string[] = [];

  return new Promise((resolve, reject) => {
    objectStream.on(
      "data",
      (obj: Minio.BucketItem) => obj.name && list.push(obj.name),
    );
    objectStream.on("end", () => resolve(list));
    objectStream.on("error", (e) => reject(e));
  });
}

export async function ensureBucketWithObjects(
  s3Client: Minio.Client,
  bucketName: string,
  objects: s3BucketContents,
) {
  await deleteBucket(s3Client, bucketName);
  await s3Client.makeBucket(bucketName, "us-east-1");

  for (const path of Object.keys(objects)) {
    let buf = Buffer.from(objects[path].content, "utf-8");
    await s3Client.putObject(bucketName, path, buf);
  }

  console.log("S3 bucket status ensured 🔒");
}

export async function deleteBucket(s3Client: Minio.Client, bucketName: string) {
  if (!(await s3Client.bucketExists(bucketName))) return;

  const items = await listObjectsInBucket(s3Client, bucketName);
  await s3Client.removeObjects(bucketName, items);
  await s3Client.removeBucket(bucketName);
}

export default {
  Client,
  ensureBucketWithObjects,
  deleteBucket,
};
