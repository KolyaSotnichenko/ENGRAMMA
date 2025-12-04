import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpService } from './mcp.service';

@Controller('/mcp')
export class McpController {
  constructor(private readonly svc: McpService) {}

  @Post()
  async post(
    @Req() req: Request,
    @Res() res: Response,
    @Body() payload: unknown,
  ) {
    await this.svc.handlePost(req, res, payload);
  }
}
