import { FeishuError } from './policy';
import type { DocxBlock, ParsedDocx, DocxSection } from './contracts';

const textFields: Record<number, string> = {
  1: 'page', 2: 'text', 3: 'heading1', 4: 'heading2', 5: 'heading3',
  6: 'heading4', 7: 'heading5', 8: 'heading6', 9: 'heading7', 10: 'heading8',
  11: 'heading9', 12: 'bullet', 13: 'ordered', 14: 'code', 15: 'quote', 17: 'todo',
};
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function safeLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/** Parse the remote block tree as data; never execute or fetch embedded links. */
export function parseDocxBlocks(blocks: DocxBlock[], documentId: string): ParsedDocx {
  const byId = new Map<string, DocxBlock>();
  for (const block of blocks) {
    if (byId.has(block.block_id)) throw new FeishuError(502, '飞书返回重复的文档块', 'PROTOCOL');
    byId.set(block.block_id, block);
  }
  const root = byId.get(documentId);
  if (!root || root.block_type !== 1) throw new FeishuError(502, '飞书未返回完整的文档根节点', 'PROTOCOL');
  const seen = new Set<string>(), active = new Set<string>(), unsupported = new Set<string>();
  const warnings = new Set<string>(), sections: DocxSection[] = [], headings: string[] = [];
  let renderedChars = 0;
  function emit(block: DocxBlock, text: string) {
    renderedChars += text.length;
    if (renderedChars > 600000) throw new FeishuError(413, '文档超过结构化解析预算', 'LIMIT');
    if (text) sections.push({ blockId: block.block_id, type: block.block_type, headingPath: [...headings], text });
    return text;
  }
  function elements(block: DocxBlock, value: unknown) {
    const items = record(value).elements;
    if (!Array.isArray(items)) {
      warnings.add('部分文字块缺少元素，未完整解析'); unsupported.add(block.block_id); return '';
    }
    return items.map(item => {
      const element = record(item), run = record(element.text_run);
      if (typeof run.content === 'string') {
        const linkValue = record(record(run.text_element_style).link).url;
        const link = safeLink(linkValue);
        if (linkValue && !link) warnings.add('已忽略不安全或无法解析的内嵌链接');
        return link ? `${run.content} (${link})` : run.content;
      }
      const mention = record(element.mention_doc), link = safeLink(mention.url);
      if (typeof mention.title === 'string') return link ? `${mention.title} (${link})` : mention.title;
      const equation = record(element.equation);
      if (typeof equation.content === 'string') return equation.content;
      unsupported.add(block.block_id); warnings.add('部分内嵌元素暂不支持，正文为部分解析');
      return '[未解析的内嵌元素]';
    }).join('');
  }
  function visit(id: string, depth = 0): string {
    if (depth > 100) throw new FeishuError(413, '文档嵌套超过读取预算', 'LIMIT');
    if (active.has(id)) throw new FeishuError(502, '飞书文档块存在循环引用', 'PROTOCOL');
    const block = byId.get(id);
    if (!block) { warnings.add('部分文档块不可见或缺失'); return '[未读取的文档块]'; }
    if (seen.has(id)) throw new FeishuError(502, '飞书文档块被重复引用', 'PROTOCOL');
    seen.add(id); active.add(id);
    let own = '', children = block.children ?? [];
    const field = textFields[block.block_type];
    if (field) {
      const text = block.block_type === 1 ? '' : elements(block, block[field]);
      if (block.block_type >= 3 && block.block_type <= 11) {
        const level = block.block_type - 2;
        headings.length = Math.min(headings.length, level - 1);
        headings.push(text); own = `${'#'.repeat(level)} ${text}`;
      } else if (block.block_type === 12) own = `${'  '.repeat(depth > 0 ? depth - 1 : 0)}- ${text}`;
      else if (block.block_type === 13) own = `${'  '.repeat(depth > 0 ? depth - 1 : 0)}1. ${text}`;
      else if (block.block_type === 15) own = `> ${text}`;
      else if (block.block_type === 17) own = `- [${record(block.todo).done ? 'x' : ' '}] ${text}`;
      else if (block.block_type === 14) own = `\`\`\`\n${text}\n\`\`\``;
      else own = block.block_type === 1 ? '' : text;
      // Page elements are the title; metadata supplies it separately.
      if (block.block_type === 1) unsupported.delete(block.block_id);
    } else if (block.block_type === 31) {
      const table = record(block.table), property = record(table.property);
      const cells = Array.isArray(table.cells) ? table.cells.filter((v): v is string => typeof v === 'string') : children;
      const columns = Number(property.column_size), rows = Number(property.row_size);
      if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1 || cells.length !== columns * rows) {
        warnings.add('表格结构不完整，未保证行列覆盖'); unsupported.add(id);
      }
      if (Array.isArray(property.merge_info) && property.merge_info.some(v => Number(record(v).row_span) > 1 || Number(record(v).col_span) > 1)) {
        warnings.add('合并单元格已展开为文字，未保留完整合并布局'); unsupported.add(id);
      }
      const width = Number.isInteger(columns) && columns > 0 ? columns : Math.max(1, cells.length);
      const values = cells.map(cell => visit(cell, depth + 1).replace(/\n/g, ' / ').replace(/\|/g, '\\|'));
      const lines: string[] = [];
      for (let i = 0; i < values.length; i += width) lines.push('| ' + values.slice(i, i + width).join(' | ') + ' |');
      own = lines.join('\n'); children = [];
    } else if (block.block_type === 22) own = '---';
    else if (![19, 24, 25, 32].includes(block.block_type)) {
      unsupported.add(id); warnings.add(`存在未支持的文档块类型 ${block.block_type}`);
      own = `[未解析的文档块：类型 ${block.block_type}]`;
    }
    if (block.block_type === 19) { unsupported.add(id); warnings.add('高亮块样式未完整解析'); }
    const output = [emit(block, own), ...children.map(child => visit(child, depth + 1))].filter(Boolean).join('\n\n');
    active.delete(id); return output;
  }
  const text = visit(documentId);
  if (text.length > 300000) throw new FeishuError(413, '文档结构化正文超过30万字符', 'LIMIT');
  if (seen.size !== blocks.length) warnings.add('存在未连接到正文树的文档块，未保证全文覆盖');
  return { text, sections, coverage: warnings.size || unsupported.size ? 'PARTIAL' : 'COMPLETE', warnings: [...warnings], unsupportedBlockIds: [...unsupported] };
}
