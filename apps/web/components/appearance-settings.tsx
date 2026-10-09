"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { DEFAULT_APPEARANCE, getAppearance, setAppearance, subscribeAppearance, type Appearance } from "@/lib/appearance";

const options = [
  { value: "light", label: "浅色模式", description: "浅底与清晰的数据对比", Icon: Sun },
  { value: "black-titanium", label: "深色模式", description: "深蓝底与柔和的图表配色", Icon: Moon },
] as const;

export function AppearanceSync() {
  useEffect(() => subscribeAppearance(() => {}), []);
  return null;
}

export function AppearanceSettings() {
  const appearance = useSyncExternalStore(subscribeAppearance, getAppearance, () => DEFAULT_APPEARANCE);
  const [message, setMessage] = useState("");
  function choose(value: Appearance, label: string) {
    const saved = setAppearance(value);
    setMessage(saved ? `已切换至${label}` : `已切换至${label}。浏览器未允许保存，刷新后将恢复深色模式。`);
  }

  return <section className="settings-appearance" aria-labelledby="appearance-title">
    <h2 id="appearance-title">外观</h2>
    <p id="appearance-description">保留相同的布局和内容，选择适合你的显示方式。偏好保存在当前浏览器。</p>
    <fieldset className="appearance-options" aria-describedby="appearance-description">
      <legend className="sr-only">显示模式</legend>
      {options.map(({ value, label, description, Icon }) => <label key={value} className="appearance-option">
        <input type="radio" name="appearance" value={value} checked={appearance === value} onChange={() => choose(value, label)} />
        <span className="appearance-preview" data-preview={value} aria-hidden="true"><i/><span><b/><em/><em/></span></span>
        <span className="appearance-label"><Icon size={16} aria-hidden="true"/><strong>{label}</strong></span>
        <small>{description}</small>
      </label>)}
    </fieldset>
    <p className="appearance-status" role="status" aria-live="polite">{message}</p>
  </section>;
}
