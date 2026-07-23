import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { PrismaModule } from '../prisma/prisma.module';
import { ContactModule } from '../contact/contact.module';
import { CompanyModule } from '../company/company.module';
import { VercelAiModule } from '../vercel-ai/vercel-ai.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './services/leads.service';
import { LeadSourcingService } from './services/lead-sourcing.service';
import { LeadsOutreachProcessor } from './processors/leads-outreach.processor';
import { LEADS_OUTREACH_QUEUE } from './leads.constants';

@Module({
  imports: [
    PrismaModule,
    ContactModule,
    CompanyModule,
    VercelAiModule,
    BullModule.registerQueue({ name: LEADS_OUTREACH_QUEUE }),
    BullBoardModule.forFeature({ name: LEADS_OUTREACH_QUEUE, adapter: BullMQAdapter }),
  ],
  controllers: [LeadsController],
  providers: [LeadsService, LeadSourcingService, LeadsOutreachProcessor],
  exports: [LeadsService],
})
export class LeadsModule {}
