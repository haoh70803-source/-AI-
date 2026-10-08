import type { ConfigurableIntegrationProvider } from "./schemas";

export type IntegrationTestResult = {
  supported: false;
  status: "UNSUPPORTED_UNTIL_PROVIDER_STAGE" | "LIVE_API_TEST_NOT_AVAILABLE";
  message: string;
};

export interface IntegrationTester {
  testConnection(provider: ConfigurableIntegrationProvider): Promise<IntegrationTestResult>;
}

export class UnsupportedIntegrationTester implements IntegrationTester {
  async testConnection(_provider: ConfigurableIntegrationProvider): Promise<IntegrationTestResult> {
    if (_provider === "REDFOX" || _provider === "DOUBAO_ASR") {
      return {
        supported: false,
        status: "LIVE_API_TEST_NOT_AVAILABLE",
        message: _provider === "REDFOX"
          ? "配置格式可校验；RedFox 未公开无需作品链接的轻量连接测试。"
          : "配置格式可校验；豆包极速版没有轻量健康端点，真实可用性由首次转写验证。",
      };
    }
    return {
      supported: false,
      status: "UNSUPPORTED_UNTIL_PROVIDER_STAGE",
      message: "Provider 尚未接入",
    };
  }
}
