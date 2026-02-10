import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type HeadersWithSetCookie = Headers & { getSetCookie?: () => string[] };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getOrigin(req: Request): string {
    const configured = process.env.BETTER_AUTH_BASE_URL;
    if (configured) return configured;
    return `${req.protocol}://${req.get('host')}`;
  }

  private applyBetterAuthHeaders(res: Response, headers: Headers): void {
    const setCookies = (headers as HeadersWithSetCookie).getSetCookie?.() ?? [];
    if (setCookies.length) {
      for (const cookie of setCookies) res.append('set-cookie', cookie);
    }

    headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') return;
      res.setHeader(key, value);
    });
  }

  private async proxyToBetterAuth(args: {
    req: Request;
    res: Response;
    method: string;
    path: string;
    body?: unknown;
  }) {
    const origin = this.getOrigin(args.req);
    const request = this.authService.buildAuthRequest({
      origin,
      path: args.path,
      method: args.method,
      headers: args.req.headers,
      body: args.body,
    });

    const response = await this.authService.callHandler(request);
    this.applyBetterAuthHeaders(args.res, response.headers);

    const contentType = response.headers.get('content-type') || '';
    const payload: unknown = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    args.res.status(response.status).send(payload);
  }

  @Post('register')
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.proxyToBetterAuth({
      req,
      res,
      method: 'POST',
      path: '/api/v1/auth/sign-up/email',
      body,
    });
  }

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.proxyToBetterAuth({
      req,
      res,
      method: 'POST',
      path: '/api/v1/auth/sign-in/email',
      body,
    });
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    return this.proxyToBetterAuth({
      req,
      res,
      method: 'POST',
      path: '/api/v1/auth/sign-out',
    });
  }

  @Get('me')
  async me(@Req() req: Request, @Res() res: Response) {
    const origin = this.getOrigin(req);
    const request = this.authService.buildAuthRequest({
      origin,
      path: '/api/v1/auth/get-session',
      method: 'GET',
      headers: req.headers,
    });

    const response = await this.authService.callHandler(request);
    this.applyBetterAuthHeaders(res, response.headers);

    const contentType = response.headers.get('content-type') || '';
    const data: unknown = contentType.includes('application/json')
      ? await response.json()
      : null;

    const user = (() => {
      if (!data || typeof data !== 'object') return null;
      if (!('user' in data)) return null;
      return (data as { user?: unknown }).user ?? null;
    })();

    res.status(response.status).send({ user });
  }
}
