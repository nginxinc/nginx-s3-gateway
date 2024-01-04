const request = require("supertest");
const container = require("./support/container.js");
const s3Mock = require("./support/s3Mock.js");

const TEST_NAME = "base";

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
    `,
  },
  "b/c/=": {
    content: `
    This is an awful filename.
    このフィール名を選ばないでください
    `
  },
  "b/c/@": {
    content: ""
  },
  "b/c/'(1).txt": {
    content: "In the midst of movement and chaos, keep stillness inside of you."
  },
  "a/plus+plus.txt": {
    content: `
    代悲白頭翁　　　Lament for the White-Haired Old Man
    洛陽城東桃李花　In the east of Luoyang City, Peach blossoms abound
    飛來飛去落誰家　Their petals float around, coming and going, to whose house will they fall?
    洛陽女児惜顔色　Girls in Luoyang cherish their complexion
    行逢落花長歎息　They breathe a deep sigh upon seeing the petals fall
    今年花落顔色改　This year the petals fall and their complexion changes
    明年花開復誰在　Who will be there when the flowers bloom next year?
    已見松柏摧為薪　I've seen the pines and cypresses destroyed and turned into firewood
    更聞桑田変成海　I hear that the mulberry fields have fallen into the sea
    古人無復洛城東　The people of old never came back to the east of Luoyang City
    今人還對落花風　The people of today likewise face the falling flowers in the wind
    年年歳歳花相似　Year after year, flowers look alike
    歳歳年年人不同　Year after year, the people are not the same
    寄言全盛紅顔子　I want you to get this message, my child, you are in your prime, with a rosy complexion
    應憐半死白頭翁　Take pity on the half-dead white-haired old man
    此翁白頭真可憐　You really must take pity on this white-haired old man
    伊昔紅顔美少年　For once upon a time, I used to be a red-faced handsome young man
    公子王孫芳樹下　A child of noble birth under a fragrant tree
    清歌妙舞落花前　Singing and dancing in front of the falling petals
    光禄池臺開錦繍　At the platform before the mirror pond, beautiful autumn leaves opening all around
    将軍楼閣畫神仙　The general’s pavilion is painted with gods and goddesses
    一朝臥病無相識　Once I was sick and no one knew me
    三春行楽在誰邉　Who will be at the shore for the spring outing?
    宛轉蛾眉能幾時　For how long will the moths gracefully turn about?
    須臾鶴髪亂如絲　The crane’s feathers are like tangled threads for just a moment
    但看古来歌舞地　Yet, look at the ancient places of song and dance
    惟有黄昏鳥雀悲　Only in twilight, do the birds lament
    `
  },
  "системы/%bad%file%name%": {
    content: `
    Filename encoding issues are hard.

    `
  }
};

const BUCKET_NAME = "bucket-2";

// Config for the running container per test

const CONFIG = container.Config({
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
  dockerfileName: "Dockerfile.oss",
  testName: TEST_NAME,
  networkName: "s3-gateway-test",
});

const minioClient = s3Mock.Client("localhost", 9090, "AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");

beforeAll(async () => {
  try {
    await container.stop(CONFIG);
  } catch (e) {
    console.log("no container to stop");
  }

  await s3Mock.ensureBucketWithObjects(minioClient, BUCKET_NAME, FILES);
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
    const res = await request(CONFIG.testContainer.baseUrl).get(`/${objectPath}`);
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("many params that should be stripped", async () => {
    const objectPath = "a.txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/a.txt?some=param&that=should&be=stripped#aaah")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("with a more complex path", async () => {
    const objectPath = "b/c/d.txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/b/c/d.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test.skip("with dot segments in the path", async () => {
    const objectPath = "b/e.txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/b/c/../e.txt")
      .set("accept", "binary/octet-stream");

    const reqData = JSON.parse(JSON.stringify(res)).req;
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("another simple path", async () => {
    const objectPath = "b/e.txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/b/e.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("too many forward slashes", async () => {
    const objectPath = "b/e.txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/b//e.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
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
    expect(res.text).toBe(FILES[objectPath].content);
  });
});

describe("strange file names and encodings", () => {
  test("URI encoded equal sign as file name", async () => {
    const objectPath = "b/c/=";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/b/c/%3D")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("URI encoded @ symbol as file name", async () => {
    const objectPath = "b/c/@";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/b/c/%40")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("URI with encoded punctuation in file name", async () => {
    const objectPath = "b/c/'(1).txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/b/c/%27%281%29.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("URI with encoded plus in file name", async () => {
    const objectPath = "a/plus+plus.txt";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/a/plus%2Bplus.txt")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });

  test("URI with cyrillic script and punctuation in file name", async () => {
    const objectPath = "системы/%bad%file%name%";
    const res = await request(CONFIG.testContainer.baseUrl)
      .get("/%D1%81%D0%B8%D1%81%D1%82%D0%B5%D0%BC%D1%8B/%25bad%25file%25name%25")
      .set("accept", "binary/octet-stream");

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe(FILES[objectPath].content);
  });
});
