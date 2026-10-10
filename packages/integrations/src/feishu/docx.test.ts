import { describe, expect, it } from 'vitest';
import { parseDocxBlocks } from './docx';
import type { DocxBlock } from './contracts';
const doc = 'documenttoken123';
const paragraph = (id: string, text: string): DocxBlock => ({ block_id: id, block_type: 2, text: { elements: [{ text_run: { content: text } }] } });
const parse = (blocks: DocxBlock[]) => parseDocxBlocks([{ block_id: doc, block_type: 1, children: blocks.map(b => b.block_id) }, ...blocks], doc);

describe('Docx structure preservation', () => {
  it('retains heading paths, paragraphs, lists and the final paragraph', () => {
    const result = parse([{ block_id: 'headingblock01', block_type: 3, heading1: { elements: [{ text_run: { content: '章节' } }] } },
      paragraph('paragraph0001', '完整正文'), { block_id: 'bulletblock001', block_type: 12, bullet: { elements: [{ text_run: { content: '第一项' } }] } }, paragraph('paragraph0002', '文末知识')]);
    expect(result.coverage).toBe('COMPLETE'); expect(result.text).toContain('# 章节'); expect(result.text).toContain('- 第一项'); expect(result.text.endsWith('文末知识')).toBe(true);
    expect(result.sections.at(-1)?.headingPath).toEqual(['章节']);
  });
  it('retains original safe hyperlinks as data without fetching them', () => {
    const result = parse([{ block_id: 'paragraph0001', block_type: 2, text: { elements: [{ text_run: { content: '参考', text_element_style: { link: { url: 'https://team.feishu.cn/wiki/wikiroottoken123' } } } }] } }]);
    expect(result.text).toContain('https://team.feishu.cn/wiki/wikiroottoken123');
  });
  it('drops executable or credential-bearing link targets', () => {
    const result = parse([{ block_id: 'paragraph0001', block_type: 2, text: { elements: [{ text_run: { content: '危险', text_element_style: { link: { url: 'javascript:alert(1)' } } } }] } }]);
    expect(result.text).toBe('危险'); expect(result.coverage).toBe('PARTIAL');
  });
  it('keeps table row/column order and cell contents', () => {
    const result = parseDocxBlocks([
      { block_id: doc, block_type: 1, children: ['tableblock0001'] },
      { block_id: 'tableblock0001', block_type: 31, table: { cells: ['tablecell00001', 'tablecell00002'], property: { row_size: 1, column_size: 2 } } },
      { block_id: 'tablecell00001', block_type: 32, children: ['paragraph0001'] }, paragraph('paragraph0001', '项目'),
      { block_id: 'tablecell00002', block_type: 32, children: ['paragraph0002'] }, paragraph('paragraph0002', '值'),
    ], doc);
    expect(result.text).toBe('| 项目 | 值 |'); expect(result.coverage).toBe('COMPLETE');
  });
  it('marks unsupported blocks and inline elements as partial', () => {
    const result = parse([{ block_id: 'imageblock0001', block_type: 27 }, { block_id: 'paragraph0001', block_type: 2, text: { elements: [{ mention_user: { user_id: 'secret' } }] } }]);
    expect(result.coverage).toBe('PARTIAL'); expect(result.unsupportedBlockIds).toHaveLength(2);
  });
  it('does not claim missing, orphaned, or unreadable blocks are complete', () => {
    const result = parseDocxBlocks([{ block_id: doc, block_type: 1, children: ['missingblock01'] }, paragraph('paragraph0001', '孤立内容')], doc);
    expect(result.coverage).toBe('PARTIAL'); expect(result.warnings).toHaveLength(2);
  });
  it('rejects cyclic trees', () => expect(() => parseDocxBlocks([{ block_id: doc, block_type: 1, children: [doc] }], doc)).toThrow());
  it('rejects duplicate block IDs', () => expect(() => parse([paragraph('paragraph0001', 'a'), paragraph('paragraph0001', 'b')])).toThrow());
  it('does not truncate over-budget text silently', () => expect(() => parse([paragraph('paragraph0001', '知'.repeat(300001))])).toThrow());
});
