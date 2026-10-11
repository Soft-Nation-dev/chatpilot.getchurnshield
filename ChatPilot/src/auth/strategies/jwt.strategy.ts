import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigsService } from 'src/config/config.service'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configsService: ConfigsService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configsService.jwtSecret,
    })
  }

  async validate(payload: {
    sub: number
    phone: string
    cid?: number
    role?: string
    tv?: number
  }) {
    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        phone: true,
        company_id: true,
        role: true,
        status: true,
        token_version: true,
        can_view_contact_phone: true,
        company: {
          select: {
            account_status: true,
            subscription_status: true,
            subscription_expires_at: true,
          },
        },
      },
    })

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException()
    }

    if (payload.tv !== undefined && payload.tv !== user.token_version) {
      throw new UnauthorizedException()
    }

    if (user.company.account_status === 'suspended') {
      throw new UnauthorizedException('This workspace has been suspended')
    }

    if (
      ['active', 'trialing'].includes(user.company.subscription_status) &&
      user.company.subscription_expires_at &&
      user.company.subscription_expires_at < new Date()
    ) {
      throw new UnauthorizedException('This workspace subscription has expired')
    }

    return {
      userId: user.id,
      phone: user.phone,
      companyId: user.company_id,
      role: user.role,
      canViewContactPhone: user.can_view_contact_phone,
    }
  }
}
