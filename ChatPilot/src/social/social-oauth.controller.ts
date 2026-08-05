import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard'
import { RolesGuard } from 'src/auth/guards/roles.guard'
import { Roles } from 'src/auth/decorators/roles.decorator'
import { CompanyAccessService } from 'src/company/company-access.service'
import { SocialOauthService } from './services/social-oauth.service'
import { SocialAccountService } from './services/social-account.service'
import { GraphApiService } from './services/graph-api.service'
import { ConnectAccountDto } from './dto/connect-account.dto'

@ApiTags('Social')
@Controller('social')
export class SocialOauthController {
  constructor(
    private readonly socialOauthService: SocialOauthService,
    private readonly socialAccountService: SocialAccountService,
    private readonly companyAccess: CompanyAccessService,
    private readonly graph: GraphApiService,
  ) {}

  @ApiOperation({ summary: 'Get the Facebook connect dialog URL' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('oauth/facebook/authorize')
  authorize(@Request() req: any) {
    const url = this.socialOauthService.buildAuthorizeUrl(
      req.user.companyId,
      req.user.userId,
    )
    return { url }
  }

  @ApiExcludeEndpoint()
  @Get('oauth/facebook/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const base = (
      process.env.FRONTEND_URL || 'https://chatpilot.trygetchurnshield.com'
    )
      .split(',')[0]
      .trim()
      .replace(/\/$/, '')
    try {
      await this.socialOauthService.completeCallback(code, state)
      res.redirect(`${base}/settings/social?connected=1`)
    } catch (error) {
      res.redirect(
        `${base}/settings/social?error=${encodeURIComponent(error?.message || 'connect_failed')}`,
      )
    }
  }

  @ApiOperation({ summary: 'List connected social accounts' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('companies/:companyId/accounts')
  async list(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)
    return this.socialAccountService.listForCompany(companyId)
  }

  @ApiOperation({ summary: 'Attach a Page access token directly' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Post('companies/:companyId/accounts/manual')
  async connectManual(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: ConnectAccountDto,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)

    const account = await this.socialAccountService.upsert({
      companyId,
      platform: dto.platform,
      externalId: dto.external_id,
      pageId: dto.page_id ?? null,
      igUserId: dto.ig_user_id ?? null,
      name: dto.name ?? null,
      username: dto.username ?? null,
      accessToken: dto.access_token,
    })

    const pageId = dto.page_id || dto.external_id
    const subscribed = await this.graph.subscribePage(pageId, dto.access_token)
    if (subscribed.success) {
      await this.socialAccountService.markSubscribed(account.id)
    } else {
      await this.socialAccountService.recordError(
        account.id,
        subscribed.error ?? 'subscribe failed',
      )
    }

    return {
      id: account.id,
      platform: account.platform,
      external_id: account.external_id,
      subscribed: subscribed.success,
      error: subscribed.error,
    }
  }

  @ApiOperation({ summary: 'Disconnect a social account' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Delete('companies/:companyId/accounts/:accountId')
  async disconnect(
    @Request() req: any,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Param('accountId', ParseIntPipe) accountId: number,
  ) {
    await this.companyAccess.assertAccess(req.user, companyId)

    const accounts = await this.socialAccountService.listForCompany(companyId)
    const target = accounts.find(a => a.id === accountId)
    if (!target) return { disconnected: false }

    await this.socialAccountService.deactivate(accountId, 'disconnected by owner')
    return { disconnected: true }
  }
}
