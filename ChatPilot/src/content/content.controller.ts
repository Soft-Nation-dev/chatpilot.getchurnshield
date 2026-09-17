import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard'
import { CompanyAccessService } from 'src/company/company-access.service'
import { PrismaService } from 'src/prisma/prisma.service'
import { decryptMessage } from 'src/common/crypto/message-crypto'
import { PropertyService } from './services/property.service'
import { ContentGeneratorService } from './services/content-generator.service'
import { ContentPublisherService } from './services/content-publisher.service'
import { ContentAutomationService } from './services/content-automation.service'
import { UpsertPropertyDto } from './dto/property.dto'
import {
  GenerateBatchDto,
  GenerateContentDto,
  UpdateContentPostDto,
  UpdateContentAutomationDto,
} from './dto/content.dto'

@ApiTags('Content')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId')
export class ContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly propertyService: PropertyService,
    private readonly generator: ContentGeneratorService,
    private readonly publisher: ContentPublisherService,
    private readonly automation: ContentAutomationService,
  ) {}

  @ApiOperation({ summary: 'Get automatic content planning settings' })
  @Get('content-automation')
  async getContentAutomation(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.automation.getSettings(companyId)
  }

  @ApiOperation({ summary: 'Update automatic content planning settings' })
  @Put('content-automation')
  async updateContentAutomation(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: UpdateContentAutomationDto,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.automation.updateSettings(companyId, dto)
  }

  @ApiOperation({ summary: 'Generate the next automatic content plan now' })
  @Post('content-automation/run-now')
  async runContentAutomation(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.automation.planCompany(companyId, true)
  }

  @ApiOperation({ summary: 'List properties' })
  @Get('properties')
  async listProperties(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('status') status?: string,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.propertyService.list(companyId, status)
  }

  @ApiOperation({ summary: 'Get one property' })
  @Get('properties/:propertyId')
  async getProperty(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('propertyId', ParseIntPipe) propertyId: number,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.propertyService.detail(companyId, propertyId)
  }

  @ApiOperation({ summary: 'Add a property to the inventory' })
  @Post('properties')
  async createProperty(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: UpsertPropertyDto,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.propertyService.create(companyId, dto)
  }

  @ApiOperation({ summary: 'Update a property' })
  @Put('properties/:propertyId')
  async updateProperty(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Body() dto: UpsertPropertyDto,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.propertyService.update(companyId, propertyId, dto)
  }

  @ApiOperation({ summary: 'Delete a property' })
  @Delete('properties/:propertyId')
  async deleteProperty(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('propertyId', ParseIntPipe) propertyId: number,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.propertyService.remove(companyId, propertyId)
  }

  @ApiOperation({ summary: 'List generated content posts' })
  @Get('content')
  async listContent(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('status') status?: string,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.prisma.content_posts.findMany({
      where: { company_id: companyId, ...(status ? { status } : {}) },
      orderBy: { id: 'desc' },
      take: 100,
    })
  }

  @ApiOperation({ summary: 'Read captured comments and replies for a post' })
  @Get('content/:postId/comments')
  async listComments(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('postId', ParseIntPipe) postId: number,
    @Query('before') before?: string,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    await this.requirePost(companyId, postId)
    const cursor = Number(before)
    const rows = await this.prisma.social_events.findMany({
      where: {
        company_id: companyId,
        content_post_id: postId,
        event_type: 'comment',
        ...(Number.isSafeInteger(cursor) && cursor > 0 ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: 51,
      select: {
        id: true, platform: true, external_user_name: true, text: true,
        reply_text: true, action: true, created_at: true, updated_at: true,
        social_account_id: true,
      },
    })
    const page = rows.slice(0, 50)
    const accounts = await this.prisma.social_accounts.findMany({
      where: {
        company_id: companyId,
        id: { in: page.map(row => row.social_account_id).filter((id): id is number => id !== null) },
      },
      select: { id: true, name: true, username: true },
    })
    const readable = (value: string | null) => {
      const plain = decryptMessage(value)
      return plain?.startsWith('enc:v1:') ? null : plain
    }
    return {
      items: page.map(row => ({
        id: row.id, platform: row.platform, author: row.external_user_name,
        text: readable(row.text), reply: readable(row.reply_text),
        action: row.action, created_at: row.created_at, updated_at: row.updated_at,
        account: accounts.find(account => account.id === row.social_account_id) ?? null,
      })),
      next_cursor: rows.length > 50 ? page[page.length - 1].id : null,
    }
  }

  @ApiOperation({ summary: 'Generate one social post with AI' })
  @Post('content/generate')
  async generate(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: GenerateContentDto,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.generator.generate(companyId, {
      kind: dto.kind,
      propertyId: dto.property_id ?? null,
      topic: dto.topic ?? null,
      scheduledAt: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
      platforms: dto.platforms ?? null,
      autoApprove: dto.auto_approve ?? false,
    })
  }

  @ApiOperation({ summary: 'Generate a batch of posts (a content calendar)' })
  @Post('content/generate-batch')
  async generateBatch(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: GenerateBatchDto,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    const posts = await this.generator.generateBatch(companyId, dto.count, {
      autoApprove: dto.auto_approve ?? false,
    })
    return { created: posts.length, posts }
  }

  @ApiOperation({ summary: 'Edit, approve or schedule a post' })
  @Put('content/:postId')
  async updatePost(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('postId', ParseIntPipe) postId: number,
    @Body() dto: UpdateContentPostDto,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    await this.requirePost(companyId, postId)

    return this.prisma.content_posts.update({
      where: { id: postId },
      data: {
        ...(dto.caption === undefined ? {} : { caption: dto.caption }),
        ...(dto.hashtags === undefined ? {} : { hashtags: dto.hashtags }),
        ...(dto.image_urls === undefined ? {} : { image_urls: dto.image_urls }),
        ...(dto.platforms === undefined ? {} : { platforms: dto.platforms }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.scheduled_at === undefined
          ? {}
          : { scheduled_at: new Date(dto.scheduled_at) }),
      },
    })
  }

  @ApiOperation({ summary: 'Publish a post to Facebook and Instagram now' })
  @Post('content/:postId/publish')
  async publishNow(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('postId', ParseIntPipe) postId: number,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    await this.requirePost(companyId, postId)
    const action = await this.publisher.publish(postId)
    return { action }
  }

  @ApiOperation({ summary: 'Delete a post' })
  @Delete('content/:postId')
  async deletePost(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('postId', ParseIntPipe) postId: number,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    await this.requirePost(companyId, postId)
    await this.prisma.content_posts.delete({ where: { id: postId } })
    return { deleted: true }
  }

  private async requirePost(companyId: number, postId: number) {
    const post = await this.prisma.content_posts.findFirst({
      where: { id: postId, company_id: companyId },
      select: { id: true },
    })
    if (!post) throw new NotFoundException('Content post not found')
    return post
  }
}
