import { Injectable, Logger } from '@nestjs/common';
import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod';
import type { Request, Response } from 'express';
import { MemoryService } from '../memory/memory.service';
import { MemoryRepository } from '../memory/memory.repository';
import { SqliteService } from '../sqlite/sqlite.service';
import { Sector } from '../shared/types';

const secEnum = z.enum([
  'episodic',
  'semantic',
  'procedural',
  'emotional',
  'reflective',
] as const);

@Injectable()
export class McpService {
  private srv: McpServer;
  private trans: StreamableHTTPServerTransport;
  private ready: Promise<void>;
  private readonly logger = new Logger(McpService.name);

  constructor(
    private memSvc: MemoryService,
    private repo: MemoryRepository,
    private db: SqliteService,
  ) {
    this.srv = new McpServer({ name: 'AuthfyMemory', version: '2.1.0' });
    this.registerTools();
    this.registerResources();
    this.trans = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    this.ready = this.srv.connect(this.trans);
  }

  async handlePost(req: Request, res: Response, payload: unknown) {
    await this.ready;
    this.setHdrs(res);
    await this.trans.handleRequest(req, res, payload);
  }

  handleOptions(_req: Request, res: Response) {
    res.statusCode = 204;
    this.setHdrs(res);
    res.end();
  }

  methodNotAllowed(_req: Request, res: Response) {
    this.sendErr(
      res,
      -32600,
      'Method not supported. Use POST /mcp with JSON payload.',
      null,
      405,
    );
  }

  private setHdrs(res: Response) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization,x-api-key,Mcp-Session-Id',
    );
  }

  private sendErr(
    res: Response,
    code: number,
    msg: string,
    id: number | string | null = null,
    status = 400,
  ) {
    if (!res.headersSent) {
      res
        .status(status)
        .json({ jsonrpc: '2.0', error: { code, message: msg }, id });
    }
  }

  private registerTools() {
    this.srv.registerTool(
      'query',
      {
        title: 'Semantic retrieval',
        description: 'Run a semantic retrieval against Engramma',
        inputSchema: z.object({
          query: z
            .string()
            .min(1, 'query text is required')
            .describe('Free-form search text'),
          k: z
            .number()
            .int()
            .min(1)
            .max(32)
            .default(8)
            .describe('Maximum results to return'),
          sector: secEnum
            .optional()
            .describe('Restrict search to a specific sector'),
          min_salience: z
            .number()
            .min(0)
            .max(1)
            .optional()
            .describe('Minimum salience threshold'),
          user_id: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe('Isolate results to a specific user identifier'),
        }),
      },
      async ({ query, k, sector, min_salience, user_id }) => {
        const filters = {
          sector: sector as Sector | undefined,
          user_id: user_id,
        };
        const matches = await this.memSvc.query(query, k ?? 8, filters);
        const filtered =
          typeof min_salience === 'number'
            ? matches.filter((m) => (m.salience ?? 0) >= min_salience)
            : matches;
        const text = filtered.length
          ? filtered
              .map(
                (m, idx) =>
                  `${idx + 1}. [${m.primary_sector}] score=${m.score.toFixed(3)} salience=${(m.salience ?? 0).toFixed(3)} id=${m.id}\n${m.content.replace(/\s+/g, ' ').slice(0, 200)}...`,
              )
              .join('\n\n')
          : 'No memories matched the supplied query.';
        const payload = filtered.map((m) => ({
          id: m.id,
          score: Number(m.score.toFixed(4)),
          primary_sector: m.primary_sector,
          sectors: m.sectors,
          salience: Number((m.salience ?? 0).toFixed(4)),
          last_seen_at: m.last_seen_at,
          path: m.path,
          content: m.content,
        }));
        return {
          content: [
            { type: 'text', text },
            {
              type: 'text',
              text: JSON.stringify({ query, matches: payload }, null, 2),
            },
          ],
        };
      },
    );

    this.srv.registerTool(
      'store',
      {
        title: 'Store memory',
        description: 'Persist new content into Engramma',
        inputSchema: z.object({
          content: z.string().min(1).describe('Raw memory text to store'),
          tags: z.array(z.string()).optional().describe('Optional tag list'),
          metadata: z
            .record(z.string(), z.any())
            .optional()
            .describe('Arbitrary metadata blob'),
          user_id: z
            .string()
            .trim()
            .min(1)
            .optional()
            .describe('Associate the memory with a specific user identifier'),
        }),
      },
      async ({ content, tags, metadata, user_id }) => {
        const meta = (metadata || {}) as Record<string, unknown>;
        this.logger.log(
          `store tags=${(tags || []).length} metaKeys=${Object.keys(meta).length} user=${user_id ?? 'null'}`,
        );
        const res = await this.memSvc.add(
          content,
          tags || [],
          meta,
          user_id || undefined,
        );
        const txt = `Stored memory ${res.id} (primary=${res.primary_sector}) across sectors: ${res.sectors.join(', ')}${user_id ? ` [user=${user_id}]` : ''}`;
        const payload = {
          id: res.id,
          primary_sector: res.primary_sector,
          sectors: res.sectors,
          user_id: user_id ?? null,
        };
        return {
          content: [
            { type: 'text', text: txt },
            { type: 'text', text: JSON.stringify(payload, null, 2) },
          ],
        };
      },
    );

    this.srv.registerTool(
      'list',
      {
        title: 'List memories',
        description: 'List recent memories',
        inputSchema: z.object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(10)
            .describe('Number of memories to return'),
          sector: secEnum.optional(),
          user_id: z.string().trim().min(1).optional(),
        }),
      },
      async ({ limit, sector, user_id }) => {
        const rows = user_id
          ? await this.repo.listByUser(user_id, limit ?? 10, 0)
          : sector
            ? await this.repo.listBySector(sector as Sector, limit ?? 10, 0)
            : await this.repo.listAll(limit ?? 10, 0);
        const items = rows.map((row) => ({
          id: row.id,
          primary_sector: row.primary_sector,
          salience: Number((row.salience ?? 0).toFixed(3)),
          last_seen_at: row.last_seen_at,
          user_id: row.user_id,
          content_preview: (row.content || '').slice(0, 240),
          tags: JSON.parse(row.tags || '[]') as string[],
          metadata: JSON.parse(row.meta || '{}') as Record<string, unknown>,
        }));
        const text = items.length
          ? items
              .map(
                (it, idx) =>
                  `${idx + 1}. [${it.primary_sector}] salience=${it.salience} id=${it.id}${it.tags.length ? ` tags=${it.tags.join(',')}` : ''}${it.user_id ? ` user=${it.user_id}` : ''}\n${it.content_preview}`,
              )
              .join('\n\n')
          : 'No memories stored yet.';
        return {
          content: [
            { type: 'text', text },
            { type: 'text', text: JSON.stringify({ items }, null, 2) },
          ],
        };
      },
    );

    this.srv.registerTool(
      'get',
      {
        title: 'Get memory',
        description: 'Fetch a single memory by identifier',
        inputSchema: z.object({
          id: z.string().min(1),
          include_vectors: z.boolean().default(false),
          user_id: z.string().trim().min(1).optional(),
        }),
      },
      async ({ id, include_vectors, user_id }) => {
        const mem = await this.repo.getMemory(id);
        if (!mem)
          return {
            content: [{ type: 'text', text: `Memory ${id} not found.` }],
          };
        if (user_id && mem.user_id && mem.user_id !== user_id)
          return {
            content: [
              {
                type: 'text',
                text: `Memory ${id} not found for user ${user_id}.`,
              },
            ],
          };
        const vecs = include_vectors ? await this.repo.getVectorsById(id) : [];
        const payload: any = {
          id: mem.id,
          content: mem.content,
          primary_sector: mem.primary_sector,
          salience: mem.salience,
          decay_lambda: mem.decay_lambda,
          created_at: mem.created_at,
          updated_at: mem.updated_at,
          last_seen_at: mem.last_seen_at,
          user_id: mem.user_id,
          tags: JSON.parse(mem.tags || '[]') as string[],
          metadata: JSON.parse(mem.meta || '{}') as Record<string, unknown>,
          sectors: include_vectors ? vecs.map((v) => v.sector) : undefined,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        };
      },
    );

    this.srv.registerTool(
      'reinforce',
      {
        title: 'Reinforce memory',
        description: 'Reinforce a memory trace',
        inputSchema: z.object({
          id: z.string().min(1).describe('Memory identifier to reinforce'),
          boost: z
            .number()
            .min(0.01)
            .max(1)
            .default(0.1)
            .optional()
            .describe('Salience boost amount (default 0.1)'),
        }),
      },
      async ({ id, boost }) => {
        const r = await this.memSvc.reinforce(id, boost);
        const ok = 'ok' in r;
        return {
          content: [
            {
              type: 'text',
              text: ok ? `Reinforced memory ${id}` : `Memory ${id} not found.`,
            },
          ],
        };
      },
    );
  }

  private registerResources() {
    this.srv.registerResource(
      'engramma-config',
      new ResourceTemplate('engramma://config', { list: undefined }),
      {
        title: 'Engramma Config',
        description: 'Runtime configuration snapshot',
      },
      async (uri) => {
        const stats = await this.db.all<{
          sector: string;
          count: number;
          avg_salience: number;
        }>(
          'select primary_sector as sector, count(*) as count, avg(salience) as avg_salience from memories group by primary_sector',
          [],
        );
        const pay = {
          mode: 'nest',
          stats,
          server: {
            name: 'AuthfyMemory',
            version: '2.1.0',
            protocol: '2025-06-18',
          },
          available_tools: ['query', 'store', 'reinforce', 'list', 'get'],
        };
        return {
          contents: [{ uri: uri.href, text: JSON.stringify(pay, null, 2) }],
        };
      },
    );
  }
}
