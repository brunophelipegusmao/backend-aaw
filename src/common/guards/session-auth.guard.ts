import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../../auth/auth.service';
import { Role } from '../enums/role.enum';
import { RequestUser } from '../interfaces/request-user.interface';

type HeadersWithSetCookie = Headers & { getSetCookie?: () => string[] };

function parseRequestUser(data: unknown): RequestUser | null {
  if (!data || typeof data !== 'object' || !('user' in data)) return null;
  const user = (data as { user?: unknown }).user;
  if (!user || typeof user !== 'object') return null;

  const rawId = (user as { id?: unknown }).id;
  const rawEmail = (user as { email?: unknown }).email;
  const rawRole = (user as { role?: unknown }).role;

  if (typeof rawId !== 'string' || typeof rawEmail !== 'string') return null;

  return {
    id: rawId,
    email: rawEmail,
    role: rawRole === Role.ADMIN ? Role.ADMIN : Role.CUSTOMER,
  };
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  private getOrigin(req: Request): string {
    const configured = process.env.BETTER_AUTH_BASE_URL;
    if (configured) return configured;
    return `${req.protocol}://${req.get('host')}`;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const res = context.switchToHttp().getResponse<Response>();

    const origin = this.getOrigin(req);

    const request = this.authService.buildAuthRequest({
      origin,
      path: '/api/v1/auth/get-session',
      method: 'GET',
      headers: req.headers,
    });

    const response = await this.authService.callHandler(request);

    // Keep the browser session cookie fresh when BetterAuth rotates/refreshes.
    const setCookies =
      (response.headers as HeadersWithSetCookie).getSetCookie?.() ?? [];
    for (const cookie of setCookies) res.append('set-cookie', cookie);

    const setAuthJwt = response.headers.get('set-auth-jwt');
    if (setAuthJwt) res.setHeader('set-auth-jwt', setAuthJwt);

    if (!response.ok) {
      throw new UnauthorizedException();
    }

    const data: unknown = await response.json().catch(() => null);
    const requestUser = parseRequestUser(data);

    if (!requestUser) throw new UnauthorizedException();

    req.user = requestUser;

    return true;
  }
}
