import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyService } from '../company/company.service';
import { LeadsService } from './services/leads.service';
import { BotToggleDto, RequestLeadsDto, SendLeadMessageDto } from './dto/leads.dto';

@ApiTags('Leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:id/leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly companyService: CompanyService,
  ) {}

  private async verifyOwnership(userId: number, companyId: number) {
    const owns = await this.companyService.userOwnsCompany(userId, companyId);
    if (!owns) throw new ForbiddenException('You do not own this company');
  }

  @ApiOperation({ summary: 'List leads' })
  @Get()
  async list(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('status') status?: string,
    @Query('bot') bot?: string,
  ) {
    await this.verifyOwnership(req.user.userId, id);
    return this.leadsService.list(id, { status, bot });
  }

  @ApiOperation({ summary: 'Monthly lead quota usage' })
  @Get('usage')
  async usage(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    await this.verifyOwnership(req.user.userId, id);
    return this.leadsService.monthlyUsage(id);
  }

  @ApiOperation({ summary: 'Request leads on demand' })
  @Post('request')
  async request(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: RequestLeadsDto) {
    await this.verifyOwnership(req.user.userId, id);
    return this.leadsService.requestLeads(id, Number(body?.count) || 1);
  }

  @ApiOperation({ summary: 'Lead detail with messages' })
  @Get(':leadId')
  async detail(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('leadId', ParseIntPipe) leadId: number,
  ) {
    await this.verifyOwnership(req.user.userId, id);
    return this.leadsService.detail(id, leadId);
  }

  @ApiOperation({ summary: 'Send a manual message to a lead' })
  @Post(':leadId/message')
  async message(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('leadId', ParseIntPipe) leadId: number,
    @Body() body: SendLeadMessageDto,
  ) {
    await this.verifyOwnership(req.user.userId, id);
    return this.leadsService.enqueueManual(id, leadId, body?.text ?? '');
  }

  @ApiOperation({ summary: 'Ask the AI to open a conversation with a lead' })
  @Post(':leadId/ai-message')
  async aiMessage(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('leadId', ParseIntPipe) leadId: number,
  ) {
    await this.verifyOwnership(req.user.userId, id);
    return this.leadsService.enqueueAiOpen(id, leadId);
  }

  @ApiOperation({ summary: 'Blast a manual message to selected or all leads' })
  @Post('blast')
  async blast(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { text: string; leadIds?: number[]; all?: boolean },
  ) {
    await this.verifyOwnership(req.user.userId, id);
    return this.leadsService.blast(id, body?.text ?? '', { all: Boolean(body?.all), leadIds: body?.leadIds });
  }

  @ApiOperation({ summary: 'AI opens conversations with selected or all qualified leads' })
  @Post('ai-outreach')
  async aiOutreach(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { leadIds?: number[]; all?: boolean },
  ) {
    await this.verifyOwnership(req.user.userId, id);
    return this.leadsService.aiOutreach(id, { all: Boolean(body?.all), leadIds: body?.leadIds });
  }

  @ApiOperation({ summary: 'Toggle a lead AI bot on/off' })
  @Put(':leadId/bot-toggle')
  async botToggle(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('leadId', ParseIntPipe) leadId: number,
    @Body() body: BotToggleDto,
  ) {
    await this.verifyOwnership(req.user.userId, id);
    return this.leadsService.toggleBot(id, leadId, Boolean(body?.is_bot_activated));
  }
}
