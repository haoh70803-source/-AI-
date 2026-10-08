import { PageHeader } from "@/components/page";
import { SettingsDiagnostics } from "@/components/settings-diagnostics";
export default function DiagnosticsPage() { return <><PageHeader title="连接与诊断" description="检查服务状态，收集安全的排查信息。"/><SettingsDiagnostics/></>; }
