import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import { scraperConfig } from '../leads/scrapers/scraper-config'

@Injectable()
export class AdminSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest()
    const supplied = String(req.headers['x-admin-secret'] || '')
    const configured = scraperConfig.adminSecret
    const suppliedBuffer = Buffer.from(supplied)
    const configuredBuffer = Buffer.from(configured || '')
    const valid =
      !!configured &&
      suppliedBuffer.length === configuredBuffer.length &&
      timingSafeEqual(suppliedBuffer, configuredBuffer)
    if (!valid) {
      throw new UnauthorizedException('invalid admin secret')
    }
    return true
  }
}
