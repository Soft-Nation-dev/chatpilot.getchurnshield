import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'

@Injectable()
export class CompanyScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const raw = request.params?.companyId ?? request.params?.id

    if (raw === undefined) return true

    const companyId = Number(raw)
    if (!Number.isFinite(companyId)) return true

    if (request.user?.companyId !== companyId) {
      throw new ForbiddenException('You do not own this company')
    }

    return true
  }
}
