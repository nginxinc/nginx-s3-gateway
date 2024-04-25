import { exec } from "child_process";
import { promisify } from "util";
const asyncExec = promisify(exec);
import http from "http";
import { TestConfig } from "./configuration";

const GATEWAY_HOST = "localhost";
const GATEWAY_PORT = 8989;
const GATEWAY_BASE_URL = `http://${GATEWAY_HOST}:${GATEWAY_PORT}`;
const START_TIMEOUT_SECONDS = 10;
const STOP_TIMEOUT_SECONDS = 5;

// Must match network name in docker-compose.yaml
const DOCKER_NETWORK_NAME = "s3-gateway-test";

type ContainerEnvironment = {
  [key: string]: string;
};

type TestContainer = {
  host: string;
  port: number;
  baseUrl: string;
};

type ContainerConfig = {
  imageName: string;
  containerName: string;
  env: ContainerEnvironment;
  dockerfileName?: string;
  usePrebuiltImage: boolean;
  networkName: string;
  testContainer: TestContainer;
};

export function Config(testConfig: TestConfig): ContainerConfig {
  const imageName =
    testConfig.image.prebuiltName ||
    (testConfig.name && buildImageName(testConfig.name));

  return {
    imageName: imageName,
    containerName: imageNameToContainerName(imageName),
    env: testConfig.container.env,
    dockerfileName: testConfig.image.dockerfile,
    usePrebuiltImage: !!testConfig.image.prebuiltName,
    networkName: DOCKER_NETWORK_NAME,
    testContainer: {
      host: GATEWAY_HOST,
      port: GATEWAY_PORT,
      baseUrl: GATEWAY_BASE_URL,
    },
  };
}

export async function build(config: ContainerConfig) {
  if (config.usePrebuiltImage) return config.imageName;
  await asyncExec(
    `docker build -t ${config.imageName} -f ${config.dockerfileName} .`,
  );
}

export async function start(config: ContainerConfig) {
  console.log("Waiting for test container to be ready...");
  async function waitForContainerStart(timeoutAt: number) {
    if (new Date().getTime() > timeoutAt)
      throw new Error(
        `Failed to start S3 Gateway test container ${config.imageName} with name ${config.containerName}. Check container logs for details`,
      );

    try {
      const statusCode = await getStatusCode(
        `${config.testContainer.baseUrl}/health`,
      );
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

  const dockerRunCmd = [
    "docker run -d --rm",
    `--name ${config.containerName}`,
    `--network ${config.networkName}`,
    `-p ${config.testContainer.port}:80`,
    envToDockerRunArgs(config.env),
    config.imageName,
  ].join(" ");

  await asyncExec(dockerRunCmd);

  await waitForContainerStart(
    new Date().getTime() + START_TIMEOUT_SECONDS * 1000,
  );
}

export async function stop(config: ContainerConfig) {
  await asyncExec(
    `docker stop -t ${STOP_TIMEOUT_SECONDS} ${config.containerName}`,
  );
}

function timeout(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getStatusCode(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        // Check the status code.
        const statusCode = response.statusCode;
        if (statusCode) {
          resolve(statusCode);
        } else {
          reject(new Error(`No status code from request to ${url}`));
        }
      })
      .on("error", (error) => {
        reject(error);
      });
  });
}

function buildImageName(testName: string): string {
  return `nginx-s3-gateway:test-${testName}`;
}

function imageNameToContainerName(name: string): string {
  return name.replace(":", "-");
}

function envToDockerRunArgs(env: ContainerEnvironment) {
  return Object.keys(env).reduce(
    (acc, key) => `${acc} -e ${key}=${env[key]}`,
    "",
  );
}

export default { build, start, stop, Config };
