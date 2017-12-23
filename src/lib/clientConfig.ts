const cron = require("node-cron");
import * as path from "path";
import logger from "./logger";
import { SendEvent } from "./sendEvent";

const IDENTITY = (a: any) => a;

export class JobConfig {
  public readonly id?: string;
  public readonly schedule: string;
  public readonly fn: () => void;

  constructor(schedule: string, fn: () => void) {
    this.schedule = schedule;
    this.fn = fn;
  }
}

export class ClientConfig {
  public readonly projectPath: string;
  public readonly jobs: JobConfig[] = [];
  public readonly onStart: (sendEvent: SendEvent) => void = () => {};

  public readonly forceHttps: boolean = false;
  public readonly port: number = 3000;
  public readonly eventStoragePath: string = path.join(
    process.cwd(),
    "dashbling-events"
  );

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }
}

export class ValidationError extends Error {
  public errors: string[];

  constructor(errors: string[]) {
    super();
    this.errors = errors;
  }
}

const error = (name: string, expectation: string, actualValue: any): string => {
  return `Invalid '${name}' configuration. Expected '${name}' to be ${expectation}, but was '${actualValue}'.`;
};

const isFunction = (val: any): boolean => {
  return typeof val === "function";
};

const envify = (option: string) => {
  return option
    .split(/(?=[A-Z])/)
    .join("_")
    .toUpperCase();
};

const tryParseBool = (input: any) => {
  if (typeof input === "boolean") return input;

  if (typeof input === "string") {
    if (input.toLocaleLowerCase() === "true") return true;
    if (input.toLocaleLowerCase() === "false") return false;
  }

  return input;
};

const tryParseNumber = (input: any) => {
  const parsed = Number(input);
  return isNaN(parsed) ? input : parsed;
};

const tryLoadEnvVar = (
  option: string,
  env: NodeJS.ProcessEnv,
  config: any,
  parse = IDENTITY
) => {
  let value = env[envify(option)];
  value = value == null ? config[option] : value;

  if (value == null) return value;
  config[option] = parse(value);
};

export const parse = (
  input: any,
  projectPath: string,
  env = process.env
): ClientConfig => {
  input = Object.assign({}, input);
  const errors = new Array<string>();

  if (!(input.jobs instanceof Array)) {
    errors.push(error("jobs", "an array", input.jobs));
  } else {
    input.jobs.forEach((job: any) => {
      if (!isFunction(job.fn)) {
        errors.push(error("job.fn", "a funciton", job.fn));
      }

      if (!cron.validate(job.schedule)) {
        errors.push(
          error("job.schedule", "a valid cron expression", job.schedule)
        );
      }
    });
  }

  if (input.onStart != null && !isFunction(input.onStart)) {
    errors.push(error("onStart", "a function", input.onStart));
  }

  tryLoadEnvVar("forceHttps", env, input, tryParseBool);
  if (input.forceHttps != null && typeof input.forceHttps !== "boolean") {
    errors.push(error("forceHttps", "a boolean", input.forceHttps));
  }

  tryLoadEnvVar("port", env, input, tryParseNumber);
  if (input.port != null && typeof input.port !== "number") {
    errors.push(error("port", "a number", input.port));
  }

  tryLoadEnvVar("eventStoragePath", env, input);
  if (
    input.eventStoragePath != null &&
    typeof input.eventStoragePath !== "string"
  ) {
    errors.push(error("eventStoragePath", "a string", input.eventStoragePath));
  }

  if (errors.length > 0) {
    throw new ValidationError(errors);
  }

  const config = new ClientConfig(projectPath);
  Object.assign(config, input);

  return config;
};

export const load = (projectPath: string): ClientConfig => {
  const configPath = path.join(projectPath, "dashbling.config.js");

  try {
    const rawConfig = require(configPath);
    return parse(rawConfig, projectPath);
  } catch (e) {
    logger.error(e);

    if (e instanceof ValidationError) {
      throw e;
    }

    throw new Error(`Unable to load configuration at path '${configPath}'.`);
  }
};