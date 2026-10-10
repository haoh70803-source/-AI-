import 'server-only';
import { db } from '@content-center/db';
import { decryptSecret, parseMasterEncryptionKey, FeishuClient, FeishuError, feishuBrowseInput, feishuMember, feishuExternalCallsAllowed, parseFeishuUrl } from '@content-center/integrations';
import type { z } from 'zod';

type BrowseClient = Pick<FeishuClient, 'listSpaces' | 'listNodes' | 'getWikiNode' | 'readStructured'>;
type Actor = { workspaceId: string; userId: string };

/** Discovery is admin-only: app-visible documents have not been granted to all workspace members. */
export async function browseFeishuWiki(actor: Actor, input: z.infer<typeof feishuBrowseInput>, signal?: AbortSignal,
  create: (appId: string, secret: string, signal?: AbortSignal) => BrowseClient = (appId, secret, abort) =>
    new FeishuClient(appId, secret, fetch, { signal: abort, log: event => console.info('FEISHU_REQUEST', event) })) {
  await feishuMember(actor, true);
  // Parse locally; a pasted URL is never used as an upstream request destination.
  const link = input.action === 'resolve' ? parseFeishuUrl(input.url) : null;
  if (link && link.kind !== 'wiki') throw new FeishuError(400, '请填写飞书 Wiki 页面链接，普通 Docx 链接无法定位知识空间');
  if (!feishuExternalCallsAllowed()) throw new FeishuError(503, '当前环境已关闭飞书外部调用', 'OFFLINE');
  const connection = await db.feishuConnection.findUnique({ where: { workspaceId: actor.workspaceId } });
  if (!connection?.enabled) throw new FeishuError(400, '请先配置并启用飞书连接');
  const client = create(connection.appId, decryptSecret(connection.encryptedSecret, parseMasterEncryptionKey(process.env.INTEGRATION_ENCRYPTION_KEY)), signal);
  let result;
  if (input.action === 'spaces') result = { type: 'spaces', ...await client.listSpaces(input.pageToken) };
  else if (input.action === 'nodes') result = { type: 'nodes', ...await client.listNodes(input.spaceId, input.parentToken, input.pageToken) };
  else if (input.action === 'resolve' && link) {
    const node = await client.getWikiNode(link.token);
    if (!node.space_id) throw new FeishuError(502, '飞书未返回节点所属空间，无法可靠定位，请检查节点访问权限', 'INCOMPLETE_RESPONSE');
    result = { type: 'scope', spaceId: node.space_id, node, originalUrl: link.url };
  }
  else {
    if (input.action !== 'document') throw new FeishuError(400, '无效的读取操作');
    const node = await client.getWikiNode(input.nodeToken);
    result = node.obj_type === 'docx'
      ? { type: 'document', node, status: 'READ', document: await client.readStructured(node.obj_token) }
      : { type: 'document', node, status: 'UNSUPPORTED', document: null, message: `暂不支持读取 ${node.obj_type}，没有建立正文索引` };
  }
  // Recheck local membership and connection identity after potentially slow upstream reads.
  await feishuMember(actor, true);
  const current = await db.feishuConnection.findFirst({ where: { id: connection.id, workspaceId: actor.workspaceId, enabled: true, revision: connection.revision }, select: { id: true } });
  if (!current) throw new FeishuError(409, '飞书连接已变化，已丢弃本次读取结果');
  return { ...result, connectionVersion: `${connection.id}:${connection.revision}` };
}
