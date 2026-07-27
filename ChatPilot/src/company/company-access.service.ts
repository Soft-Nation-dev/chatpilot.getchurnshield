import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'

@Injectable()
export class CompanyAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(
    user: { userId: number; companyId?: number; role?: string },
    companyId: number,
  ): Promise<void> {
    if (user.companyId !== undefined && user.companyId === companyId) return

    const owns = await this.prisma.users.findFirst({
      where: { id: user.userId, company_id: companyId, status: 'active' },
      select: { id: true },
    })

    if (!owns) {
      throw new ForbiddenException('You do not own this company')
    }
  }
}
