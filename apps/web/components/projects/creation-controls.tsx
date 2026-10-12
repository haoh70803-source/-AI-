"use client";
import type { CreationOptions } from "@/lib/contracts/creation";
export function CreationControls({ value, onChange, style, onStyleChange, onSave, disabled }: { value: CreationOptions; onChange: (value: CreationOptions) => void; style: string; onStyleChange: (value: string) => void; onSave: (clear: boolean) => void; disabled: boolean }) {
  const field = (key: keyof CreationOptions, label: string, choices: Array<[string, string]>) => <label>{label}<select aria-label={label} value={value[key]} disabled={disabled} onChange={event => onChange({ ...value, [key]: event.target.value })}>{choices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
  return <section className="agent-creation-controls" aria-label="创作参数">
    <div>{field("task", "任务类型", [["AUTO", "自动识别"], ["QA", "问答"], ["TOPIC", "选题"], ["SCRIPT", "口播 / 脚本"], ["MOMENTS", "朋友圈"], ["MESSAGE", "私信"], ["PLAN", "策划"], ["ANALYSIS", "分析"], ["EDIT", "修改"]])}
      {field("mode", "创作模式", [["AUTO", "自动"], ["EXPLORE", "探索角度"], ["EXECUTE", "完成稿件"]])}
      {field("depth", "回答深度", [["AUTO", "按任务"], ["BRIEF", "简短"], ["STANDARD", "完整"], ["DEEP", "深入"]])}</div>
    <details><summary>表达与身份</summary><div>{field("naturalness", "表达方式", [["AUTO", "按任务"], ["SPOKEN", "自然口语"], ["BALANCED", "自然书面"], ["PROFESSIONAL", "专业严谨"]])}{field("divergence", "发散程度", [["FOCUSED", "聚焦"], ["BALANCED", "适中"], ["WIDE", "多角度"]])}</div>
      <label>账号或人物身份<input aria-label="账号或人物身份" maxLength={160} disabled={disabled} value={value.persona} placeholder="例如：面向家长沟通的校长" onChange={event => onChange({ ...value, persona: event.target.value })} /></label>
      <label>我的表达偏好<input aria-label="我的表达偏好" maxLength={1000} disabled={disabled} value={style} placeholder="例如：直接讲具体问题，保留专业术语，不用招生口号" onChange={event => onStyleChange(event.target.value)} /></label>
      <small>保存后用于当前工作区中的我的创作；本轮要求优先。身份是表达角色，不能据此编造履历。</small>
      <div><button type="button" disabled={disabled} onClick={() => onSave(false)}>保存身份与偏好</button><button type="button" disabled={disabled} onClick={() => onSave(true)}>清除保存的身份与偏好</button></div>
    </details>
  </section>;
}
