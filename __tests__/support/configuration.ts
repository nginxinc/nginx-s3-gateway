/**
 * Configuration for a single test
 */
export type TestConfig = {
  name: string;
  image: {
    dockerfile: string;
    prebuiltName?: string;
  };
  container: {
    env: ContainerEnvironment;
  };
};

/**
 * The environment variables to be given to the container
 */
type ContainerEnvironment = {
  [key: string]: string;
};

export type DummyFileList = {
  [key: string]: DummyFile;
};

type DummyFile = {
  content: string;
};
