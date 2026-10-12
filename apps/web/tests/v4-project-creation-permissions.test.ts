import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => {
  const state = { role: "EDITOR", memberDisabled: false, userDisabled: false, workspaceDisabled: false, missing: false, revokedInTransaction: false };
  const findMember = (transaction: boolean) => vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    if (state.missing || (transaction && state.revokedInTransaction)) return null;
    if (where.workspaceId !== "workspace" || where.userId !== "user") return null;
    if (where.disabledAt === null && state.memberDisabled) return null;
    if (where.user && state.userDisabled) return null;
    if (where.workspace && state.workspaceDisabled) return null;
    return { role: state.role };
  });
  const projectCreate = vi.fn(async () => ({ id: "project", title: "新项目" }));
  const findUniqueMember = () => vi.fn(async ({ where }: { where: { workspaceId_userId: { workspaceId: string; userId: string } } }) =>
    state.missing || where.workspaceId_userId.workspaceId !== "workspace" || where.workspaceId_userId.userId !== "user" ? null : { role: state.role });
  const tx = {
    workspaceMember: { findFirst: findMember(true), findUnique: findUniqueMember() },
    creatorProfile: { findUnique: vi.fn(async () => null) },
    iPContextVersion: { findFirst: vi.fn(async () => null) },
    contentProject: { create: projectCreate, update: vi.fn(async () => ({})) },
    draftBranch: { create: vi.fn(async () => ({ id: "branch" })) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const db = {
    ...tx,
    workspaceMember: { findFirst: findMember(false), findUnique: findUniqueMember() },
    contentProject: { ...tx.contentProject, findFirst: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  return { state, db, tx, projectCreate };
});
vi.mock("server-only", () => ({}));
vi.mock("@content-center/db", () => ({ db: fixture.db, findProjectForUser: vi.fn() }));
vi.mock("../server/creation/models", () => ({ CreationInputError: class extends Error {}, validateCreationModel: vi.fn() }));
vi.mock("../server/creation/sources", () => ({ loadCreationSources: vi.fn() }));

import { createBasicProject } from "../server/sidebar/basic-project";
import { createProject } from "../server/project-service";

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(fixture.state, { role: "EDITOR", memberDisabled: false, userDisabled: false, workspaceDisabled: false, missing: false, revokedInTransaction: false });
});

for (const [name, create] of [["sidebar", createBasicProject], ["composer", createProject]] as const) {
  describe(`${name} service permission boundary (mock database, LOCAL_TEST)`, () => {
    const input = { workspaceId: "workspace", userId: "user", title: "新项目" };
    for (const field of ["memberDisabled", "userDisabled", "workspaceDisabled", "missing", "revokedInTransaction"] as const) {
      it(`rejects ${field} before writing a project`, async () => {
        fixture.state[field] = true;
        await expect(create(input)).rejects.toMatchObject({ code: expect.stringMatching(/FORBIDDEN/) });
        expect(fixture.projectCreate).not.toHaveBeenCalled();
      });
    }
    it("rejects VIEWER writes", async () => {
      fixture.state.role = "VIEWER";
      await expect(create(input)).rejects.toMatchObject({ code: expect.stringMatching(/FORBIDDEN/) });
      expect(fixture.projectCreate).not.toHaveBeenCalled();
    });
    it("rejects another workspace and another user", async () => {
      await expect(create({ ...input, workspaceId: "foreign" })).rejects.toMatchObject({ code: expect.stringMatching(/FORBIDDEN/) });
      await expect(create({ ...input, userId: "foreign" })).rejects.toMatchObject({ code: expect.stringMatching(/FORBIDDEN/) });
      expect(fixture.projectCreate).not.toHaveBeenCalled();
    });
    it("preserves active editor creation and the initial branch", async () => {
      await expect(create(input)).resolves.toMatchObject({ id: "project", primaryDraftBranchId: "branch" });
      expect(fixture.projectCreate).toHaveBeenCalledOnce();
    });
  });
}

it("does not return an idempotent project to a disabled caller", async () => {
  fixture.state.memberDisabled = true;
  fixture.db.contentProject.findFirst.mockResolvedValueOnce({ id: "existing", title: "新项目", description: null, goal: null, audience: null, sources: [], primaryDraftBranchId: "branch" } as never);
  await expect(createProject({ workspaceId: "workspace", userId: "user", title: "新项目", clientRequestId: "retry" })).rejects.toMatchObject({ code: "PROJECT_FORBIDDEN" });
  expect(fixture.projectCreate).not.toHaveBeenCalled();
});
