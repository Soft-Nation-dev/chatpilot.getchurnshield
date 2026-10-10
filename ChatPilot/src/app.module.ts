import { Module } from '@nestjs/common'
import { SentryModule } from '@sentry/nestjs/setup'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import { ConfigsModule } from './config'
import { ResponseInterceptor } from './utils/global-interceptors/response.interceptor'
import { GlobalExceptionFilter } from './utils/global-interceptors/global-exception-filter.interceptor'
import { PrismaModule } from './prisma/prisma.module'
import { WebhookModule } from './webhook/webhook.module'
import { BackgroundTasksModule } from './background-tasks/background-tasks.module'
import { BullModule } from '@nestjs/bullmq'
import { VercelAiModule } from './vercel-ai/vercel-ai.module'
import { UtilsModule } from './utils/utils.module'
import { ContactModule } from './contact/contact.module'
import { CompanyModule } from './company/company.module'
import { ExpressAdapter } from '@bull-board/express'
import { BullBoardModule } from '@bull-board/nestjs'
import { bullBoardAuthMiddleware } from './utils/Middlewares/bull-board-auth.middleware'
import { AuthModule } from './auth/auth.module'
import { LeadsModule } from './leads/leads.module'
import { AdminModule } from './admin/admin.module'
import { TeamModule } from './team/team.module'
import { SocialModule } from './social/social.module'
import { ContentModule } from './content/content.module'
import { LearningModule } from './learning/learning.module'
import { AiRoutingModule } from './ai-routing/ai-routing.module'
import { NotificationsModule } from './notifications/notifications.module'

@Module({
  imports: [
    ConfigsModule,
    ...(process.env.SENTRY_DSN ? [SentryModule.forRoot()] : []),
    PrismaModule,
    AiRoutingModule,
    NotificationsModule,

    WebhookModule,
    BackgroundTasksModule,
    VercelAiModule,
    UtilsModule,
    CompanyModule,
    ContactModule,

    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL,
      },
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
        attempts: 0,
      },
    }),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
      middleware: [
        bullBoardAuthMiddleware(
          process.env.BULL_BOARD_USER || 'admin',
          process.env.BULL_BOARD_PASSWORD || 'password',
        ),
      ],
    }),
    ContactModule,
    CompanyModule,
    AuthModule,
    LeadsModule,
    AdminModule,
    TeamModule,
    SocialModule,
    ContentModule,
    LearningModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
