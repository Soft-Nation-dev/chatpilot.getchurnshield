import { plainToClass } from 'class-transformer'
import {
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator'
import { Environment } from './config.configuration'
class EnvironmentVariables {
  @IsDefined()
  @IsEnum(Environment)
  NODE_ENV: Environment

  @IsDefined()
  @IsNumberString()
  @MinLength(1)
  PORT: string

  @IsDefined()
  @IsString()
  @MinLength(1)
  DATABASE_URL: string

  @IsOptional()
  @IsString()
  GEMINI_API_KEY?: string

  @IsOptional()
  @IsString()
  GROQ_API_KEY?: string

  @IsOptional()
  @IsString()
  CLOUDFLARE_ACCOUNT_ID?: string

  @IsOptional()
  @IsString()
  CLOUDFLARE_API_TOKEN?: string

  @IsDefined()
  @IsString()
  @MinLength(1)
  REDIS_URL: string

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  chatPilot_API_KEY?: string
}

export function validateConfig(configuration: Record<string, unknown>) {
  const finalConfig = plainToClass(EnvironmentVariables, configuration, {
    enableImplicitConversion: true,
  })

  const errors = validateSync(finalConfig, { skipMissingProperties: false })

  if (errors.length) {
    let errorMessage = ''
    for (const err of errors) {
      if (err.constraints) {
        Object.values(err.constraints).forEach(msg => {
          errorMessage += ` ${msg}\n`
        })
      }
    }
    throw new Error(errorMessage)
  }

  const hasCloudflare =
    !!finalConfig.CLOUDFLARE_ACCOUNT_ID && !!finalConfig.CLOUDFLARE_API_TOKEN
  if (
    !hasCloudflare &&
    !finalConfig.GROQ_API_KEY &&
    !finalConfig.GEMINI_API_KEY
  ) {
    throw new Error(
      'Configure Cloudflare Workers AI, GROQ_API_KEY, or GEMINI_API_KEY. At least one AI provider is required.',
    )
  }

  return finalConfig
}
