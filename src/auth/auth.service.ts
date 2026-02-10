import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Auth } from 'better-auth';
import { eq } from 'drizzle-orm';
import { IncomingHttpHeaders } from 'node:http';
import { DrizzleService } from '../database/drizzle.service';
import { users } from '../database/schema';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private auth!: Auth;

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initBetterAuth();
  }

  get instance(): Auth {
    if (!this.auth) {
      throw new InternalServerErrorException(
        'BetterAuth has not been initialized',
      );
    }
    return this.auth;
  }

  private async initBetterAuth(): Promise<void> {
    const baseURL = this.configService.get<string>('BETTER_AUTH_BASE_URL');
    const basePath =
      this.configService.get<string>('BETTER_AUTH_BASE_PATH') ?? '/api/v1/auth';
    const secret = this.configService.getOrThrow<string>('BETTER_AUTH_SECRET');

    const trustedOrigins = (
      this.configService.get<string>('BETTER_AUTH_TRUSTED_ORIGINS') ?? ''
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      const [{ betterAuth }, { drizzleAdapter }, { jwt }] = await Promise.all([
        import('better-auth/minimal'),
        import('better-auth/adapters/drizzle'),
        import('better-auth/plugins/jwt'),
      ]);

      this.auth = betterAuth({
        secret,
        baseURL,
        basePath,
        trustedOrigins: trustedOrigins.length ? trustedOrigins : undefined,
        advanced: {
          database: {
            // Use UUIDs and let Postgres generate them by default.
            generateId: 'uuid',
          },
        },
        emailAndPassword: { enabled: true },
        user: {
          modelName: 'users',
          fields: {
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            emailVerified: 'email_verified',
          },
          additionalFields: {
            role: {
              type: 'string',
              required: true,
              defaultValue: Role.CUSTOMER,
              fieldName: 'role',
            },
          },
        },
        session: {
          modelName: 'session',
          fields: {
            userId: 'user_id',
            expiresAt: 'expires_at',
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            ipAddress: 'ip_address',
            userAgent: 'user_agent',
          },
        },
        account: {
          modelName: 'account',
          fields: {
            userId: 'user_id',
            providerId: 'provider_id',
            accountId: 'account_id',
            accessToken: 'access_token',
            refreshToken: 'refresh_token',
            idToken: 'id_token',
            accessTokenExpiresAt: 'access_token_expires_at',
            refreshTokenExpiresAt: 'refresh_token_expires_at',
            password: 'password_hash',
            createdAt: 'created_at',
            updatedAt: 'updated_at',
          },
        },
        verification: {
          modelName: 'verification',
          fields: {
            identifier: 'identifier',
            value: 'value',
            expiresAt: 'expires_at',
            createdAt: 'created_at',
            updatedAt: 'updated_at',
          },
        },
        database: drizzleAdapter(this.drizzle.db, { provider: 'pg' }),
        plugins: [
          jwt({
            schema: {
              jwks: {
                modelName: 'jwks',
                fields: {
                  publicKey: 'public_key',
                  privateKey: 'private_key',
                  createdAt: 'created_at',
                  expiresAt: 'expires_at',
                },
              },
            },
            jwks: {
              jwksPath: '/jwks',
            },
          }),
        ],
        databaseHooks: {
          // Keep `users.password_hash` populated for the MVP table spec.
          account: {
            create: {
              after: async (createdAccount) => {
                if (!createdAccount?.userId) return;
                if (createdAccount.providerId !== 'credential') return;
                if (!createdAccount.password) return;
                try {
                  await this.drizzle.db
                    .update(users)
                    .set({ passwordHash: createdAccount.password })
                    .where(eq(users.id, createdAccount.userId));
                } catch (error) {
                  this.logger.warn(
                    `Failed to sync users.password_hash for userId=${createdAccount.userId}`,
                  );
                  this.logger.debug(error);
                }
              },
            },
          },
        },
      });
    } catch (error) {
      this.logger.error('Failed to initialize BetterAuth', error as Error);
      throw error;
    }
  }

  private headersToFetchHeaders(headers: IncomingHttpHeaders): Headers {
    const out = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'undefined') continue;
      if (Array.isArray(value)) {
        for (const item of value) out.append(key, item);
        continue;
      }
      out.set(key, value);
    }
    return out;
  }

  buildAuthRequest(args: {
    origin: string;
    path: string;
    method: string;
    headers: IncomingHttpHeaders;
    body?: unknown;
  }): Request {
    const url = new URL(args.path, args.origin).toString();
    const headers = this.headersToFetchHeaders(args.headers);

    // BetterAuth expects a real Request for body parsing/middlewares.
    const init: RequestInit = { method: args.method, headers };

    if (typeof args.body !== 'undefined') {
      if (!headers.has('content-type'))
        headers.set('content-type', 'application/json');
      init.body = JSON.stringify(args.body);
    }

    return new Request(url, init);
  }

  async callHandler(request: Request): Promise<Response> {
    return this.instance.handler(request);
  }
}
