import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { scraperConfig } from '../leads/scrapers/scraper-config';

@Injectable()
export class AdminSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const secret = req.headers['x-admin-secret'];
    if (!scraperConfig.adminSecret || secret !== scraperConfig.adminSecret) {
      throw new UnauthorizedException('invalid admin secret');
    }
    return true;
  }
}
