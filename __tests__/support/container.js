const util = require("util");
const execAsync = util.promisify(require("child_process").exec);

const GATEWAY_HOST = "localhost";
const GATEWAY_PORT = "8989";
const GATEWAY_BASE_URL = `http://${GATEWAY_HOST}:${GATEWAY_PORT}`;
const START_TIMEOUT_SECONDS = 10;
const STOP_TIMEOUT_SECONDS = 5;

function Config(testConfig) {
  const imageName = testConfig.prebuiltImageName || buildImageName(testConfig.testName);
  return {
    imageName: imageName,
    containerName: imageNameToContainerName(imageName),
    env: testConfig.env,
    dockerfileName: testConfig.dockerfileName,
    usePrebuiltImage: !!testConfig.prebuiltImageName,
    networkName: testConfig.networkName,
    testContainer: {
      host: GATEWAY_HOST,
      port: GATEWAY_PORT,
      baseUrl: GATEWAY_BASE_URL,
    },
  };
}

async function build(config) {
  if (config.usePrebuiltImage) return config.imageName;
  await execAsync(`docker build -t ${config.imageName} -f ${config.dockerfileName} .`);
}

async function start(config) {
  console.log("Waiting for test container to be ready...");
  async function waitForContainerStart(timeoutAt) {
    if (new Date().getTime() > timeoutAt)
      throw new Error(
        `Failed to start S3 Gateway test container ${config.imageName} with name ${config.containerName}. Check container logs for details`,
      );

    try {
      const statusCode = await getStatusCode(`${config.testContainer.baseUrl}/health`);
      console.log(statusCode);

      if (statusCode === 200) {
        console.log("Verified test container is running!");
      } else {
        await timeout(1500);
        await waitForContainerStart(timeoutAt); 
      }
    } catch (e) {
        await timeout(1500);
        await waitForContainerStart(timeoutAt); 
    }

  }
// `docker run -d --rm --name ${config.containerName} --network ${config.networkName} -p 8989:80 ${envToDockerRunArgs(config.env)} ${imageName}`;
  const dockerRunCmd = [
    "docker run -d --rm",
    `--name ${config.containerName}`,
    `--network ${config.networkName}`,
    `-p ${config.testContainer.port}:80`,
    envToDockerRunArgs(config.env),
    config.imageName
  ].join(" ");

  await execAsync(dockerRunCmd);

  await waitForContainerStart(
    new Date().getTime() + (START_TIMEOUT_SECONDS * 1000)
  );
}

async function stop(config) {
  await execAsync(`docker stop -t ${STOP_TIMEOUT_SECONDS} ${config.containerName}`);
}

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const http = require("http");
async function getStatusCode(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      // Check the status code.
      const statusCode = response.statusCode;
      resolve(statusCode);
    }).on('error', (error) => {
      reject(error);
    });
  });
}

function buildImageName(testName) {
  return `nginx-s3-gateway:test-${testName}`;
}

function imageNameToContainerName(name) {
  return name.replace(":", "-");
}

function envToDockerRunArgs(env) {
  return Object.keys(env).reduce(
    (acc, key) => `${acc} -e ${key}=${env[key]}`,
    "",
  );
}

module.exports = { build, start, stop, Config };
