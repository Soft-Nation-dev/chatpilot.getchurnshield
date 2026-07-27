import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { socialConfig } from '../social.config'

@Injectable()
export class MetaSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest()

    if (!socialConfig.appSecret) {
      throw new UnauthorizedException('meta not configured')
    }

    if (!req.rawBody) {
      throw new UnauthorizedException('raw body unavailable')
    }

    const header = req.headers['x-hub-signature-256']
    if (typeof header !== 'string' || !header.startsWith('sha256=')) {
      throw new UnauthorizedException('missing signature')
    }

    const expected =
      'sha256=' +
      createHmac('sha256', socialConfig.appSecret)
        .update(req.rawBody)
        .digest('hex')

    const a = Buffer.from(header)
    const b = Buffer.from(expected)

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('invalid signature')
    }

    return true
  }
}
