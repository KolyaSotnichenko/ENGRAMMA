import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthBootstrapDto, AuthLoginDto } from './dto/auth.dto';

@Controller()
export class AuthController {
  constructor(private svc: AuthService) {}

  @Get('/auth/status')
  async status(@Res() res: Response) {
    try {
      const r = await this.svc.status();
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ error: msg });
    }
  }

  @Post('/auth/bootstrap')
  async bootstrap(@Body() dto: AuthBootstrapDto, @Res() res: Response) {
    try {
      const r = await this.svc.bootstrap(dto.login, dto.password);
      if (!r) return res.status(409).json({ error: 'already_initialized' });
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ error: msg });
    }
  }

  @Post('/auth/login')
  async login(@Body() dto: AuthLoginDto, @Res() res: Response) {
    try {
      const r = await this.svc.login(dto.login, dto.password);
      if (!r) return res.status(401).json({ error: 'invalid_credentials' });
      res.json(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ error: msg });
    }
  }

  @Get('/auth/me')
  async me(@Req() req: Request, @Res() res: Response) {
    try {
      const token = this.extractBearer(req);
      if (!token)
        return res.status(401).json({ error: 'authentication_required' });

      const u = await this.svc.me(token);
      if (!u) return res.status(401).json({ error: 'authentication_required' });

      res.json({ user: u });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ error: msg });
    }
  }

  @Post('/auth/logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    try {
      const token = this.extractBearer(req);
      if (!token)
        return res.status(401).json({ error: 'authentication_required' });

      await this.svc.logout(token);
      res.json({ ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'internal';
      res.status(500).json({ error: msg });
    }
  }

  private extractBearer(req: Request): string | null {
    const auth = req.headers?.authorization
      ? String(req.headers.authorization)
      : '';
    if (!auth.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }
}
