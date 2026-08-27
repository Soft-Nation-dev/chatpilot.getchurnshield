// IMPORTANT: Make sure to import `instrument.ts` at the top of your file.
// If you're using CommonJS (CJS) syntax, use `require("./instrument.ts");`
import './instrument'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

import { LoggerService } from './common/logging/logger.service'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { json, urlencoded } from 'express'
;(BigInt.prototype as any).toJSON = function () {
  const int = Number.parseInt(this.toString())
  return int ?? this.toString()
}
async function bootstrap() {
  const isProduction = process.env.NODE_ENV?.toLowerCase() === 'production'
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new LoggerService({
      prefix: 'api',
      lokiUrl: process.env.LOKI_URL,
    }),
  })

  // Configure body parser limits
  app.use(
    json({
      limit: '50mb',
      verify: (req: any, _res, buf: Buffer) => {
        req.rawBody = Buffer.from(buf)
      },
    }),
  )
  app.use(urlencoded({ limit: '50mb', extended: true }))

  const uploadsDir = resolve(process.env.UPLOADS_DIR || '/app/uploads')
  mkdirSync(uploadsDir, { recursive: true })
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' })

  app.setGlobalPrefix('api/v1')
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('RAMP-API')
      .addCookieAuth()
      .setDescription('RAMP API Services')
      .setExternalDoc('Postman Collection', '/api-json')
      .setVersion('1.0')
      .build()
    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup('api', app, document)
  }
  const KNOWN_FRONTEND_ORIGINS = [
    'https://chatpilot.trygetchurnshield.com',
    'https://trygetchurnshield.com',
    'https://www.trygetchurnshield.com',
    'https://chat-pilot.dev',
    'https://www.chat-pilot.dev',
  ]

  const normalizeOrigin = (origin: string) =>
    origin.trim().replace(/\/$/, '').toLowerCase()

  const frontendOrigins = [
    ...KNOWN_FRONTEND_ORIGINS,
    ...(process.env.FRONTEND_URL || '').split(','),
    ...(process.env.EXTRA_CORS_ORIGINS || '').split(','),
  ]
    .map(normalizeOrigin)
    .filter(Boolean)

  if (!isProduction) {
    frontendOrigins.push('http://localhost:3000')
    frontendOrigins.push('http://localhost:3001')
    frontendOrigins.push('http://localhost:3002')
  }

  const allowedOrigins = new Set(frontendOrigins)

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      callback(null, allowedOrigins.has(normalizeOrigin(origin)))
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-admin-secret',
      'chatPilot-api-key',
    ],
    optionsSuccessStatus: 204,
  })
  app.useGlobalFilters(new AllExceptionsFilter())
  app.useGlobalPipes(new ValidationPipe())
  await app.listen(process.env.PORT ?? 3000)
}
bootstrap()
