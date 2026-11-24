import {
  Controller,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Get,
  Put,
  Delete,
  Res,
  UnprocessableEntityException,
  ForbiddenException,
  Headers,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { CompanyService } from './company.service'
import { CompanyAccessService } from './company-access.service'
import { CreateCompanyDto } from './dto/create-company.dto'
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger'
import { Response } from 'express'
import { ContactService } from 'src/contact/contact.service'
import { ContactRedactionService } from 'src/contact/contact-redaction.service'
import { AUTHOR_TYPE, Contact } from 'src/utils/constants/types'
import { SendMessageDto } from './dto/send-message.dto'
import { WhatsAppFormatter } from 'src/utils/services/whatsapp-formatter.helper'
import { ConfigsService } from 'src/config/config.service'
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard'
import {
  CHAT_STATES,
  ChatLifecycleService,
} from 'src/contact/chat-lifecycle.service'
import { ReplyService } from 'src/background-tasks/services/reply.service'

const MAX_COMPANY_ASSET_BYTES = 95 * 1024 * 1024

@ApiTags('Companies')
@Controller('companies')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly contactService: ContactService,
    private readonly WaFormattingService: WhatsAppFormatter,
    private readonly ConfigService: ConfigsService,
    private readonly companyAccess: CompanyAccessService,
    private readonly contactRedaction: ContactRedactionService,
    private readonly chatLifecycle: ChatLifecycleService,
    private readonly replyService: ReplyService,
  ) {}

  private async verifyOwnership(userId: number, companyId: number) {
    await this.companyAccess.assertAccess({ userId }, companyId)
  }

  @ApiOperation({ summary: 'Create Company' })
  @ApiBody({
    type: CreateCompanyDto,
    description: 'The webhook data in JSON format',
  })
  @Post()
  createCompany(@Body() createWebhookDto: CreateCompanyDto) {
    return this.companyService.createCompany(createWebhookDto)
  }
  @ApiOperation({
    summary: 'Sync/Get Connection Status of all WhatsApp connected companies',
  })
  @Get('sync-connection_status')
  async syncWapiSessionStatus() {
    return await this.companyService.syncAllSessionStatus()
  }
  @ApiOperation({ summary: 'Send Message from Company to contact' })
  @ApiHeader({
    name: 'chatPilot-api-key',
    description: 'API Key for authentication',
    required: true,
  })
  @Post(':companyId/contacts/:contactId/send-message')
  async sendMessage(
    @Headers('chatPilot-api-key') apiKey: string,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('contactId', ParseIntPipe) contactId: number,
    @Query() data: SendMessageDto,
  ) {
    if (this.ConfigService.chatPilotApiKey !== apiKey) {
      throw new UnprocessableEntityException('invalid api key')
    }
    const contact = await this.contactService.getContactById(contactId)
    if (!contact) throw new UnprocessableEntityException('contact not found')
    const company = await this.companyService.findById(companyId)
    if (!company) throw new UnprocessableEntityException('company not found')
    const contentParts = this.WaFormattingService.splitMessage(data.message)
    const messages: any = []

    for (let i = 0; i < contentParts.length; i++) {
      const part = contentParts[i]
      const image = this.WaFormattingService.getMarkdownImage(part)

      if (image) {
        await this.contactService.sendMessage(
          contact as Contact,
          image.alt_text,
          image.url,
          AUTHOR_TYPE.BOT,
          data.source,
        )
        messages.push({
          message: image.alt_text,
          image: image.url,
        })
      } else {
        await this.contactService.sendMessage(
          contact as Contact,
          part,
          '',
          AUTHOR_TYPE.BOT,
          data.source,
        )
        messages.push({
          message: part,
        })
      }
    }
    return messages
  }

  @Post(':companyId/phone/:number/sendMessageByPhone')
  async sendMessageToPhone(
    @Headers('chatPilot-api-key') apiKey: string,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('number', ParseIntPipe) number: number,
    @Query() data: SendMessageDto,
  ) {
    if (this.ConfigService.chatPilotApiKey !== apiKey) {
      throw new UnprocessableEntityException('invalid api key')
    }
    const company = await this.companyService.findById(companyId)
    if (!company) throw new UnprocessableEntityException('company not found')
    const contact = await this.contactService.getOrCreateContact(
      company,
      number,
    )
    if (!contact) throw new UnprocessableEntityException('contact not found')

    const contentParts = this.WaFormattingService.splitMessage(data.message)
    const messages: any = []

    for (let i = 0; i < contentParts.length; i++) {
      const part = contentParts[i]
      const image = this.WaFormattingService.getMarkdownImage(part)

      if (image) {
        await this.contactService.sendMessage(
          contact as Contact,
          image.alt_text,
          image.url,
          AUTHOR_TYPE.BOT,
          data.source,
        )
        messages.push({
          message: image.alt_text,
          image: image.url,
        })
      } else {
        await this.contactService.sendMessage(
          contact as Contact,
          part,
          '',
          AUTHOR_TYPE.BOT,
          data.source,
        )
        messages.push({
          message: part,
        })
      }
    }
    return messages
  }

  @ApiOperation({ summary: 'Create Session for Company (QR or Pairing Code)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':id/create_session')
  async createSession(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { usePairingCode?: boolean; phoneNumber?: string },
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return await this.companyService.createSession(
      id,
      body?.usePairingCode,
      body?.phoneNumber,
    )
  }

  @ApiOperation({ summary: 'Get pairing code for Company session' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/pairing-code')
  async getPairingCode(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return await this.companyService.getPairingCode(id)
  }

  @ApiOperation({ summary: 'Get  wapi Session status for Company ' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/connection_status')
  async getSessionStatus(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return await this.companyService.getSessionStatus(id)
  }
  @ApiOperation({ summary: 'Get wapi QrCode for Company ' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/get_qr')
  async getQrCode(
    @Request() req: any,
    @Res() res: Response,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return await this.companyService.getSessionQrCode(res, id)
  }

  @ApiOperation({ summary: 'Remove WhatsApp session for Company' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id/remove-session')
  async removeSession(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return await this.companyService.removeSession(id)
  }

  @ApiOperation({ summary: 'Send OTP for company deletion' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':id/send-delete-otp')
  async sendDeleteOtp(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return this.companyService.sendDeleteOtp(id)
  }

  @ApiOperation({
    summary: 'Delete company and all related data (requires OTP)',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteCompany(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { otp: string },
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return this.companyService.deleteCompany(id, body.otp)
  }

  @ApiOperation({ summary: 'Save business details' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put(':id/business-details')
  async updateBusinessDetails(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, any>,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return this.companyService.updateBusinessDetails(id, body)
  }

  @ApiOperation({ summary: 'Generate AI system prompt from business details' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':id/generate-prompt')
  async generatePrompt(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return this.companyService.generatePrompt(id)
  }

  @ApiOperation({ summary: 'Get dashboard stats' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/dashboard')
  async getDashboard(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return this.companyService.getDashboardStats(id)
  }

  @ApiOperation({ summary: 'Toggle bot activation' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put(':id/bot-settings')
  async updateBotSettings(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { is_bot_activated: boolean },
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return this.companyService.setBotActivation(id, body.is_bot_activated)
  }

  @ApiOperation({
    summary: 'Get company settings (email, monthly lead quota, profile)',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/company-settings')
  async getCompanySettings(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    const company = await this.companyService.findById(id)
    if (!company) throw new UnprocessableEntityException('company not found')
    return company
  }

  @ApiOperation({
    summary: 'Update company settings (email, monthly lead quota)',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put(':id/company-settings')
  async updateCompanySettings(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      email?: string
      monthly_lead_quota?: number
      daily_lead_limit?: number
    },
  ) {
    await this.verifyOwnership(req.user.userId, id)
    const data: any = {}
    if (body.email !== undefined) {
      data.email = body.email === '' ? null : body.email
    }
    if (
      body.monthly_lead_quota !== undefined &&
      body.monthly_lead_quota !== null
    ) {
      data.monthly_lead_quota = Math.max(
        0,
        Math.floor(Number(body.monthly_lead_quota)) || 0,
      )
    }
    if (body.daily_lead_limit !== undefined && body.daily_lead_limit !== null) {
      data.daily_lead_limit = Math.max(
        0,
        Math.floor(Number(body.daily_lead_limit)) || 0,
      )
    }
    return this.companyService.updateCompany(id, data)
  }

  @ApiOperation({ summary: 'Get paginated contacts list' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/contacts')
  async getContacts(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search?: string,
    @Query('needs_review') needs_review?: string,
    @Query('bot_activated') bot_activated?: string,
    @Query('has_appointment') has_appointment?: string,
    @Query('active_within') active_within?: string,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    const result = await this.companyService.getContacts(
      id,
      +page,
      +limit,
      search,
      {
        needs_review,
        bot_activated,
        has_appointment,
        active_within,
      },
    )
    result.data = this.contactRedaction.redactManyForUser(
      result.data as any,
      req.user,
    ) as any
    return result
  }

  @ApiOperation({ summary: 'Toggle bot activation for a contact' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put(':id/contacts/:contactId/bot-toggle')
  async toggleContactBot(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('contactId', ParseIntPipe) contactId: number,
    @Body() body: { is_bot_activated: boolean },
  ) {
    await this.verifyOwnership(req.user.userId, id)
    const contact = await this.contactService.getContactById(contactId)
    if (!contact || contact.company_id !== id) {
      throw new UnprocessableEntityException('Contact not found')
    }
    if (body.is_bot_activated) {
      return this.chatLifecycle.resumeAutomation(contactId, {
        reason: 'Dashboard bot enabled',
        actor: 'dashboard_user',
      })
    }
    return this.contactService.updateContact(contactId, {
      is_bot_activated: false,
    })
  }

  @ApiOperation({ summary: 'Get compact automation history for a contact' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/contacts/:contactId/operations')
  async getContactOperations(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('contactId', ParseIntPipe) contactId: number,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    const contact = await this.contactService.getContactById(contactId)
    if (!contact || contact.company_id !== id) {
      throw new UnprocessableEntityException('Contact not found')
    }
    return this.chatLifecycle.operationalTimeline(id, contactId)
  }

  @ApiOperation({ summary: 'Control automation lifecycle for a contact' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put(':id/contacts/:contactId/automation')
  async controlContactAutomation(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('contactId', ParseIntPipe) contactId: number,
    @Body()
    body: {
      action:
        | 'pause'
        | 'soft_review'
        | 'hard_takeover'
        | 'resume'
        | 'handoff'
        | 'close'
        | 'reopen'
        | 'retry'
      reason?: string
    },
  ) {
    await this.verifyOwnership(req.user.userId, id)
    const contact = await this.contactService.getContactById(contactId)
    if (!contact || contact.company_id !== id) {
      throw new UnprocessableEntityException('Contact not found')
    }
    const reason = body.reason || `Dashboard action: ${body.action}`

    if (body.action === 'pause' || body.action === 'soft_review') {
      return this.chatLifecycle.setReviewMode(contactId, 'SOFT_REVIEW', {
        reason:
          body.reason ||
          'Dashboard soft review: AI paused but monitoring new business intent',
        actor: 'dashboard_user',
      })
    }
    if (body.action === 'resume' || body.action === 'reopen') {
      return this.chatLifecycle.resumeAutomation(contactId, {
        reason,
        actor: 'dashboard_user',
      })
    }
    if (body.action === 'handoff' || body.action === 'hard_takeover') {
      return this.chatLifecycle.setReviewMode(contactId, 'HARD_TAKEOVER', {
        reason:
          body.reason ||
          'Dashboard hard takeover: all AI replies blocked until manually resumed',
        actor: 'dashboard_user',
      })
    }
    if (body.action === 'close') {
      return this.chatLifecycle.transition(contactId, 'CONCLUDED_CLOSED', {
        reason,
        actor: 'dashboard_user',
      })
    }
    if (body.action === 'retry') {
      const gate = await this.chatLifecycle.gate(contactId, 'INBOUND_REPLY')
      if (!gate.allowed) {
        throw new UnprocessableEntityException(
          `Retry blocked because the conversation is ${gate.state.toLowerCase()}`,
        )
      }
      const task = await this.replyService.addReplyTask({
        clientId: contactId,
        companyId: id,
      })
      await this.chatLifecycle.recordAutomation({
        companyId: id,
        contactId,
        jobType: 'reply',
        status: 'queued',
        jobId: String(task.id),
        maxAttempts: task.opts.attempts || 1,
        details: { source: 'dashboard_retry' },
      })
      return { queued: true, jobId: task.id }
    }

    throw new UnprocessableEntityException(
      `Action must be one of soft_review, hard_takeover, resume, close, reopen, retry. States: ${CHAT_STATES.join(', ')}`,
    )
  }

  // ─── Company Assets (File Upload) ──────────────────────────────

  @ApiOperation({ summary: 'Upload a company asset (image, PDF, doc)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':id/assets/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_COMPANY_ASSET_BYTES },
    }),
  )
  async uploadAsset(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body('description') description?: string,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    if (!file) throw new UnprocessableEntityException('No file provided')
    return this.companyService.uploadAsset(id, file, description)
  }

  @ApiOperation({ summary: 'Get all company assets' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/assets')
  async getAssets(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    await this.verifyOwnership(req.user.userId, id)
    return this.companyService.getAssets(id)
  }

  @ApiOperation({
    summary: 'Register media stored in the public media library',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':id/assets/register')
  async registerMedia(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      url: string
      name: string
      contentType: string
      key?: string
      size?: number
      items?: Array<{
        url: string
        name: string
        contentType: string
        key?: string
        size?: number
      }>
    },
  ) {
    await this.verifyOwnership(req.user.userId, id)
    if (Array.isArray(body.items)) {
      return this.companyService.registerExternalMediaBatch(id, body.items)
    }
    return this.companyService.registerExternalMedia(id, body)
  }

  @ApiOperation({
    summary: 'Remove a deleted media-library item from the index',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':id/assets/unregister')
  async unregisterMedia(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { url: string },
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return this.companyService.unregisterExternalMedia(id, body.url)
  }

  @ApiOperation({ summary: 'Update asset description' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put(':id/assets/:assetId')
  async updateAsset(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('assetId', ParseIntPipe) assetId: number,
    @Body() body: { description: string },
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return this.companyService.updateAssetDescription(
      id,
      assetId,
      body.description,
    )
  }

  @ApiOperation({ summary: 'Delete a company asset' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete(':id/assets/:assetId')
  async deleteAsset(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('assetId', ParseIntPipe) assetId: number,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return this.companyService.deleteAsset(id, assetId)
  }

  @ApiOperation({ summary: 'Get chat history for a contact' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id/contacts/:contactId/messages')
  async getContactMessages(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('contactId', ParseIntPipe) contactId: number,
  ) {
    await this.verifyOwnership(req.user.userId, id)
    return this.companyService.getContactMessages(id, contactId)
  }

  @ApiOperation({ summary: 'Send message to contact (JWT auth)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':id/contacts/:contactId/send')
  async sendMessageAuth(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('contactId', ParseIntPipe) contactId: number,
    @Body() body: { message: string },
  ) {
    await this.verifyOwnership(req.user.userId, id)
    const contact = await this.contactService.getContactById(contactId)
    if (!contact) throw new UnprocessableEntityException('contact not found')
    const company = await this.companyService.findById(id)
    if (!company) throw new UnprocessableEntityException('company not found')

    const contentParts = this.WaFormattingService.splitMessage(body.message)
    const messages: any = []

    for (const part of contentParts) {
      const image = this.WaFormattingService.getMarkdownImage(part)
      if (image) {
        await this.contactService.sendMessage(
          contact as Contact,
          image.alt_text,
          image.url,
          AUTHOR_TYPE.USER_WHATSAPP,
          'dashboard',
        )
        messages.push({ message: image.alt_text, image: image.url })
      } else {
        await this.contactService.sendMessage(
          contact as Contact,
          part,
          '',
          AUTHOR_TYPE.USER_WHATSAPP,
          'dashboard',
        )
        messages.push({ message: part })
      }
    }
    return messages
  }
}
