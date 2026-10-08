import { PageHeader } from "@/components/page";
import packageInfo from "../../../../package.json";
const { version } = packageInfo;
export default function AboutPage() {return <><PageHeader title="关于" description="鑫世界工作台"/><div className="settings-info-table"><div><span>当前版本</span><strong>{version}</strong></div><div><span>账号方式</span><strong>公司管理员创建</strong></div><div><span>API 配置</span><strong>公司独立配置 · 加密保存</strong></div></div><p className="settings-footnote">项目、资料、研究与 AI 协作。账号设置管理的是鑫世界登录身份，创作者平台账号由对应业务模块管理。</p></>;}
