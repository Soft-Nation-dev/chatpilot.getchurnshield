import { Logger } from '@nestjs/common';

export function log(scope: string) {
  const logger = new Logger(scope);
  return {
    info: (meta: unknown, msg?: string) => logger.log(msg ? `${msg} ${JSON.stringify(meta)}` : String(meta)),
    warn: (meta: unknown, msg?: string) => logger.warn(msg ? `${msg} ${JSON.stringify(meta)}` : String(meta)),
    error: (meta: unknown, msg?: string) => logger.error(msg ? `${msg} ${JSON.stringify(meta)}` : String(meta)),
  };
}
