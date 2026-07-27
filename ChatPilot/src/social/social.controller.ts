import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Response } from 'express'
import { socialConfig } from './social.config'
import { MetaSignatureGuard } from './guards/meta-signature.guard'
import { MetaWebhookService } from './services/meta-webhook.service'
import { MetaWebhookBody } from './dto/meta-webhook.dto'

@ApiTags('Social')
@Controller('webhook/meta')
export class SocialController {
  constructor(private readonly metaWebhookService: MetaWebhookService) {}

  @ApiOperation({ summary: 'Meta webhook verification handshake' })
  @ApiExcludeEndpoint()
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (!socialConfig.verifyToken) {
      res.status(503).type('text/plain').send('not configured')
      return
    }

    if (mode === 'subscribe' && token === socialConfig.verifyToken) {
      res.status(200).type('text/plain').send(String(challenge ?? ''))
      return
    }

    res.status(403).type('text/plain').send('forbidden')
  }

  @ApiOperation({ summary: 'Meta webhook events (comments and DMs)' })
  @UseGuards(MetaSignatureGuard)
  @HttpCode(200)
  @Post()
  receive(@Body() body: MetaWebhookBody) {
    this.metaWebhookService.ingest(body).catch(() => undefined)
    return 'EVENT_RECEIVED'
  }
}
