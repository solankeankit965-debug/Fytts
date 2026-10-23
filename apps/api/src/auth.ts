import { cloudAuthMessage } from "./auth-errors";
import {
  Body,
  CanActivate,
  ConflictException,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import jwt from "jsonwebtoken";
import { credentialsSchema, type Account } from "@fytts/contracts";
import { LocalStore } from "./local-store";
import { settings } from "./config";
import { cloud } from "./cloud";
const scrypt = promisify(scryptCallback);
export type UserRequest = Request & { identity: Account; accessToken: string };
@Injectable()
export class AuthService {
  private secret?: Buffer;
  constructor(@Inject(LocalStore) private readonly store: LocalStore) {}
  private async getSecret() {
    if (this.secret) return this.secret;
    await mkdir(this.store.directory, { recursive: true, mode: 0o700 });
    const p = join(this.store.directory, "session.key");
    try {
      this.secret = await readFile(p);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      const next = randomBytes(48);
      try {
        await writeFile(p, next, { flag: "wx", mode: 0o600 });
        this.secret = next;
      } catch (e2) {
        if ((e2 as NodeJS.ErrnoException).code !== "EEXIST") throw e2;
        this.secret = await readFile(p);
      }
    }
    return this.secret;
  }
  async authenticate(token: string): Promise<Account> {
    if (settings.mode === "supabase") {
      const { data, error } = await cloud().auth.getUser(token);
      if (error || !data.user)
        throw new UnauthorizedException("Please sign in again.");
      return { id: data.user.id, email: data.user.email || "" };
    }
    try {
      const payload = jwt.verify(token, await this.getSecret(), {
        algorithms: ["HS256"],
        issuer: "fytts-local",
        audience: "fytts",
      }) as jwt.JwtPayload;
      const a = await this.store.read((d) =>
        d.accounts.find((a) => a.id === payload.sub),
      );
      if (!a) throw new Error();
      return { id: a.id, email: a.email };
    } catch {
      throw new UnauthorizedException("Please sign in again.");
    }
  }
  async credentials(raw: unknown, signup: boolean) {
    const v = credentialsSchema.safeParse(raw);
    if (!v.success)
      throw new BadRequestException(
        v.error.issues.map((i) => i.message).join(" "),
      );
    const { email, password } = v.data;
    if (settings.mode === "supabase") {
      const c = cloud();
      const result = signup
        ? await c.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: settings.origin },
          })
        : await c.auth.signInWithPassword({ email, password });
      if (result.error)
        throw new BadRequestException(
          cloudAuthMessage(result.error.code, signup),
        );
      return {
        accessToken: result.data.session?.access_token,
        refreshToken: result.data.session?.refresh_token,
        needsConfirmation: !result.data.session,
      };
    }
    let account = await this.store.read((d) =>
      d.accounts.find((a) => a.email === email),
    );
    if (signup) {
      const salt = randomBytes(16).toString("hex");
      const hash = (await scrypt(password, salt, 64)) as Buffer;
      const a = {
        id: randomUUID(),
        email,
        passwordHash: salt + ":" + hash.toString("hex"),
      };
      await this.store.write((d) => {
        if (d.accounts.some((a) => a.email === email))
          throw new ConflictException(
            "An account already exists. Please sign in.",
          );
        d.accounts.push(a);
        d.profiles.push({ id: a.id, displayName: "", preferredFit: "Relaxed" });
      });
      account = a;
    } else {
      const [salt, stored] = (
        account?.passwordHash || "00:" + Buffer.alloc(64).toString("hex")
      ).split(":");
      const candidate = (await scrypt(password, salt, 64)) as Buffer;
      if (!account || !timingSafeEqual(candidate, Buffer.from(stored, "hex")))
        throw new UnauthorizedException("Email or password was not accepted.");
    }
    return {
      accessToken: jwt.sign({ email }, await this.getSecret(), {
        subject: account!.id,
        issuer: "fytts-local",
        audience: "fytts",
        expiresIn: "8h",
      }),
      refreshToken: undefined,
      needsConfirmation: false,
    };
  }
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<UserRequest>();
    const token = req.cookies?.fytts_access;
    if (!token)
      throw new UnauthorizedException("Sign in to access your wardrobe.");
    req.identity = await this.auth.authenticate(token);
    req.accessToken = token;
    return true;
  }
}
function sessionCookies(res: Response, access?: string, refresh?: string) {
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: settings.production,
    path: "/",
  };
  if (access)
    res.cookie("fytts_access", access, {
      ...opts,
      maxAge: settings.mode === "local" ? 8 * 3600000 : 3600000,
    });
  if (refresh)
    res.cookie("fytts_refresh", refresh, { ...opts, maxAge: 30 * 86400000 });
}
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post("signup") async signup(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const s = await this.auth.credentials(body, true);
    sessionCookies(res, s.accessToken, s.refreshToken);
    return { needsConfirmation: s.needsConfirmation };
  }
  @Post("login") async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const s = await this.auth.credentials(body, false);
    sessionCookies(res, s.accessToken, s.refreshToken);
    return { needsConfirmation: s.needsConfirmation };
  }
  @Post("refresh") async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (settings.mode === "local") throw new UnauthorizedException();
    const refresh = req.cookies?.fytts_refresh;
    if (!refresh) throw new UnauthorizedException();
    const { data, error } = await cloud().auth.refreshSession({
      refresh_token: refresh,
    });
    if (error || !data.session) throw new UnauthorizedException();
    sessionCookies(res, data.session.access_token, data.session.refresh_token);
    return { ok: true };
  }
  @Post("logout") async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (settings.mode === "supabase" && req.cookies?.fytts_access) {
      const c = cloud();
      if (req.cookies.fytts_refresh) {
        await c.auth.setSession({
          access_token: req.cookies.fytts_access,
          refresh_token: req.cookies.fytts_refresh,
        });
        await c.auth.signOut({ scope: "local" });
      }
    }
    res.clearCookie("fytts_access", { path: "/" });
    res.clearCookie("fytts_refresh", { path: "/" });
    return { ok: true };
  }
  @Get("me") @UseGuards(AuthGuard) me(@Req() req: UserRequest) {
    return req.identity;
  }
}
