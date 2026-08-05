import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import * as bcrypt from 'bcrypt'
import { PrismaService } from 'src/prisma/prisma.service'
import { CompanyService } from 'src/company/company.service'
import { WhatsBaileyService } from 'src/utils/services/whats-bailey.service'
import { InviteUserDto } from './dto/invite-user.dto'
import { UpdateRoleDto } from './dto/update-role.dto'

const INVITE_TOKEN_TTL_HOURS = Number(
  process.env.INVITE_TOKEN_TTL_HOURS || '72',
)

const TEAM_SELECT = {
  id: true,
  phone: true,
  full_name: true,
  role: true,
  status: true,
  revoked_at: true,
  invited_by: true,
  invite_expires_at: true,
  last_login_at: true,
  can_view_contact_phone: true,
  created_at: true,
}

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly companyService: CompanyService,
    private readonly whatsBaileyService: WhatsBaileyService,
  ) {}

  async list(companyId: number) {
    return this.prisma.users.findMany({
      where: { company_id: companyId },
      select: TEAM_SELECT,
      orderBy: { id: 'asc' },
    })
  }

  async invite(companyId: number, actorId: number, dto: InviteUserDto) {
    const existing = await this.prisma.users.findUnique({
      where: { phone: dto.phone },
      select: { id: true },
    })

    if (existing) {
      throw new ConflictException('This phone number is already registered')
    }

    const token = randomBytes(24).toString('hex')
    const expiresAt = new Date(
      Date.now() + INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    )
    const placeholder = await bcrypt.hash(randomBytes(24).toString('hex'), 10)

    const user = await this.prisma.users.create({
      data: {
        phone: dto.phone,
        password: placeholder,
        company_id: companyId,
        full_name: dto.full_name ?? null,
        role: dto.role,
        status: 'invited',
        invited_by: actorId,
        invite_token: token,
        invite_expires_at: expiresAt,
      },
      select: TEAM_SELECT,
    })

    await this.audit(companyId, actorId, 'team.invited', 'user', user.id, {
      role: dto.role,
    })

    await this.deliverInvite(companyId, dto.phone, token)

    return { user, invite_token: token, invite_expires_at: expiresAt }
  }

  async updateRole(
    companyId: number,
    actorId: number,
    userId: number,
    dto: UpdateRoleDto,
  ) {
    const target = await this.requireMember(companyId, userId)

    if (target.role === 'owner' && dto.role !== 'owner') {
      await this.assertNotLastOwner(companyId, userId)
    }

    const updated = await this.prisma.users.update({
      where: { id: userId },
      data: {
        role: dto.role,
        ...(dto.can_view_contact_phone === undefined
          ? {}
          : { can_view_contact_phone: dto.can_view_contact_phone }),
      },
      select: TEAM_SELECT,
    })

    await this.audit(companyId, actorId, 'team.role_changed', 'user', userId, {
      role: dto.role,
    })

    return updated
  }

  async revoke(companyId: number, actorId: number, userId: number) {
    if (actorId === userId) {
      throw new BadRequestException('You cannot revoke your own access')
    }

    const target = await this.requireMember(companyId, userId)
    if (target.role === 'owner') {
      await this.assertNotLastOwner(companyId, userId)
    }

    const updated = await this.prisma.users.update({
      where: { id: userId },
      data: {
        status: 'revoked',
        revoked_at: new Date(),
        token_version: { increment: 1 },
        invite_token: null,
        invite_expires_at: null,
      },
      select: TEAM_SELECT,
    })

    await this.audit(companyId, actorId, 'team.revoked', 'user', userId, null)

    return updated
  }

  async restore(companyId: number, actorId: number, userId: number) {
    await this.requireMember(companyId, userId)

    const updated = await this.prisma.users.update({
      where: { id: userId },
      data: { status: 'active', revoked_at: null },
      select: TEAM_SELECT,
    })

    await this.audit(companyId, actorId, 'team.restored', 'user', userId, null)

    return updated
  }

  async audit(
    companyId: number,
    userId: number | null,
    action: string,
    entity: string | null,
    entityId: number | string | null,
    meta: any,
  ) {
    try {
      await this.prisma.audit_logs.create({
        data: {
          company_id: companyId,
          user_id: userId,
          action,
          entity,
          entity_id: entityId == null ? null : String(entityId),
          meta: meta ?? undefined,
        },
      })
    } catch (error) {
      this.logger.error('Failed to write audit log', error?.message)
    }
  }

  private async requireMember(companyId: number, userId: number) {
    const target = await this.prisma.users.findFirst({
      where: { id: userId, company_id: companyId },
      select: { id: true, role: true, status: true },
    })

    if (!target) {
      throw new NotFoundException('Team member not found')
    }

    return target
  }

  private async assertNotLastOwner(companyId: number, userId: number) {
    const owners = await this.prisma.users.count({
      where: {
        company_id: companyId,
        role: 'owner',
        status: 'active',
        id: { not: userId },
      },
    })

    if (owners === 0) {
      throw new BadRequestException(
        'This company must keep at least one active owner',
      )
    }
  }

  private async deliverInvite(
    companyId: number,
    phone: string,
    token: string,
  ): Promise<void> {
    try {
      const company = await this.companyService.findById(companyId)
      if (!company) return
      const frontendUrl = (
        process.env.FRONTEND_URL || 'https://chatpilot.trygetchurnshield.com'
      )
        .split(',')[0]
        .trim()
        .replace(/\/$/, '')
      const inviteUrl = `${frontendUrl}/accept-invite?token=${encodeURIComponent(token)}`
      await this.whatsBaileyService.sendMessage(
        company,
        Number(phone),
        `You have been invited to join ${company.name}.\n\nAccept your invitation:\n${inviteUrl}\n\nInvitation code:\n*${token}*\n\nIt expires in ${INVITE_TOKEN_TTL_HOURS} hours.`,
      )
    } catch (error) {
      this.logger.error('Failed to deliver invite over WhatsApp', error?.message)
    }
  }
}
