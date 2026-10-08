import { RedFoxClient } from "./client";
import type { DiscoveryPlatform, ExternalAccount, ExternalContent, ExternalResultPage } from "./discovery";
import { normalizeAccountPage, normalizeContentPage, normalizeExternalAccount, normalizeExternalContent } from "./discovery-normalize";

export class ContentSearchAdapter {
  constructor(private readonly client: RedFoxClient) {}

  async search(input: { platform: DiscoveryPlatform; keyword: string; offset?: number; sortType?: string }): Promise<ExternalResultPage<ExternalContent>> {
    const response = await this.client.searchContent(input);
    return { ...normalizeContentPage(input.platform, response.data), providerRequestId: response.providerRequestId };
  }
}

export class AccountSearchAdapter {
  constructor(private readonly client: RedFoxClient) {}

  async search(input: { platform: DiscoveryPlatform; keyword: string; offset?: number; sortType?: string }): Promise<ExternalResultPage<ExternalAccount>> {
    const response = await this.client.searchAccounts(input);
    return { ...normalizeAccountPage(input.platform, response.data), providerRequestId: response.providerRequestId };
  }
}

export class AccountDetailAdapter {
  constructor(private readonly client: RedFoxClient) {}

  async get(input: { platform: DiscoveryPlatform; accountId: string; userId?: string }): Promise<{ item: ExternalAccount; providerRequestId?: string }> {
    const response = await this.client.getAccountDetail(input);
    return { item: normalizeExternalAccount(input.platform, response.data), providerRequestId: response.providerRequestId };
  }
}

export class AccountWorksAdapter {
  constructor(private readonly client: RedFoxClient) {}

  async list(input: { platform: DiscoveryPlatform; accountId: string; offset?: number; sortType?: string }): Promise<ExternalResultPage<ExternalContent>> {
    const response = await this.client.getAccountWorks(input);
    return { ...normalizeContentPage(input.platform, response.data), providerRequestId: response.providerRequestId };
  }
}

export class WorkDetailAdapter {
  constructor(private readonly client: RedFoxClient) {}

  async get(input: { platform: DiscoveryPlatform; externalId?: string; url?: string }): Promise<{ item: ExternalContent; providerRequestId?: string }> {
    const response = await this.client.getWorkDetail(input);
    return { item: normalizeExternalContent(input.platform, response.data), providerRequestId: response.providerRequestId };
  }
}

export class RedFoxDiscoveryProvider {
  readonly contentSearch: ContentSearchAdapter;
  readonly accountSearch: AccountSearchAdapter;
  readonly accountDetail: AccountDetailAdapter;
  readonly accountWorks: AccountWorksAdapter;
  readonly workDetail: WorkDetailAdapter;

  constructor(client: RedFoxClient) {
    this.contentSearch = new ContentSearchAdapter(client);
    this.accountSearch = new AccountSearchAdapter(client);
    this.accountDetail = new AccountDetailAdapter(client);
    this.accountWorks = new AccountWorksAdapter(client);
    this.workDetail = new WorkDetailAdapter(client);
  }
}
