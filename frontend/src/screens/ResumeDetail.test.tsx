import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { ResumeDetail } from "./ResumeDetail";
import type { BaseResume, ResumeVersion } from "../lib/resumesHooks";
import { ApiError } from "../lib/api";
import { TestIds } from "../testIds";

vi.mock("../lib/resumesHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/resumesHooks")>(
    "../lib/resumesHooks",
  );
  return {
    ...actual,
    useResume: vi.fn(),
    useResumeVersions: vi.fn(),
    useCreateResumeVersion: vi.fn(),
    useImportResumeVersion: vi.fn(),
    useArchiveResume: vi.fn(),
  };
});

import {
  useArchiveResume,
  useCreateResumeVersion,
  useImportResumeVersion,
  useResume,
  useResumeVersions,
} from "../lib/resumesHooks";

const useResumeMock = vi.mocked(useResume);
const useResumeVersionsMock = vi.mocked(useResumeVersions);
const useCreateResumeVersionMock = vi.mocked(useCreateResumeVersion);
const useImportResumeVersionMock = vi.mocked(useImportResumeVersion);
const useArchiveResumeMock = vi.mocked(useArchiveResume);

const FIXED_ID = "11111111-1111-1111-1111-111111111111";

function fixture(overrides: Partial<BaseResume> = {}): BaseResume {
  return {
    id: FIXED_ID,
    workspace: "ws-1",
    name: "Senior Eng",
    created_by: { id: 1, username: "alice" },
    created_at: "2026-04-25T00:00:00Z",
    updated_at: "2026-04-25T00:00:00Z",
    archived_at: null,
    latest_version: null,
    ...overrides,
  };
}

function versionFixture(overrides: Partial<ResumeVersion> = {}): ResumeVersion {
  return {
    id: "v1",
    base_resume: FIXED_ID,
    version_number: 1,
    document: { basics: { name: "Alice" } },
    document_hash: "x",
    notes: "",
    created_by: null,
    created_at: "2026-04-25T00:00:00Z",
    updated_at: "2026-04-25T00:00:00Z",
    ...overrides,
  };
}

function setResumeQuery(state: Partial<ReturnType<typeof useResume>>) {
  useResumeMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    isError: false,
    isSuccess: false,
    isPending: false,
    status: "success",
    ...state,
  } as unknown as ReturnType<typeof useResume>);
}

function setVersionsQuery(state: Partial<ReturnType<typeof useResumeVersions>>) {
  useResumeVersionsMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    isError: false,
    isSuccess: false,
    isPending: false,
    status: "success",
    ...state,
  } as unknown as ReturnType<typeof useResumeVersions>);
}

function setCreateVersion(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useCreateResumeVersionMock.mockReturnValue({
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useCreateResumeVersion>);
}

function setArchive(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useArchiveResumeMock.mockReturnValue({
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useArchiveResume>);
}

function setImportVersion(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useImportResumeVersionMock.mockReturnValue({
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useImportResumeVersion>);
}

function renderDetail() {
  return renderWithProviders(<ResumeDetail />, {
    path: "/dashboard/resumes/:resumeId",
    initialEntries: [`/dashboard/resumes/${FIXED_ID}`],
    extraRoutes: [{ path: "/dashboard/resumes", element: <p>list placeholder</p> }],
  });
}

describe("ResumeDetail", () => {
  // The import hook is new and not exercised by every test; default it to
  // a no-op so existing cases don't need to set it explicitly. Tests that
  // need to assert calls override via `setImportVersion`.
  beforeEach(() => setImportVersion(vi.fn()));
  it("renders the loading state", () => {
    setResumeQuery({ isLoading: true, status: "pending" });
    setVersionsQuery({ data: [], isSuccess: true, status: "success" });
    setCreateVersion(vi.fn());
    setArchive(vi.fn());
    renderDetail();
    expect(screen.getByText(/loading resume/i)).toBeVisible();
  });

  it("renders not-found branch on 404", () => {
    setResumeQuery({
      error: new ApiError(404, "Not found"),
      isError: true,
      status: "error",
    });
    setVersionsQuery({ data: [], isSuccess: true, status: "success" });
    setCreateVersion(vi.fn());
    setArchive(vi.fn());
    renderDetail();
    expect(screen.getByTestId(TestIds.RESUME_DETAIL_NOT_FOUND)).toBeVisible();
  });

  it("renders the versions loading branch", () => {
    setResumeQuery({ data: fixture(), isSuccess: true, status: "success" });
    setVersionsQuery({ isLoading: true, status: "pending" });
    setCreateVersion(vi.fn());
    setArchive(vi.fn());
    renderDetail();
    expect(screen.getByTestId(TestIds.RESUME_DETAIL_VERSIONS_LOADING)).toBeVisible();
  });

  it("renders the versions error branch with retry", () => {
    setResumeQuery({ data: fixture(), isSuccess: true, status: "success" });
    setVersionsQuery({
      error: new Error("network down"),
      isError: true,
      status: "error",
    });
    setCreateVersion(vi.fn());
    setArchive(vi.fn());
    renderDetail();
    expect(screen.getByTestId(TestIds.RESUME_DETAIL_VERSIONS_ERROR)).toBeVisible();
  });

  it("renders heading + empty versions placeholder", () => {
    setResumeQuery({ data: fixture(), isSuccess: true, status: "success" });
    setVersionsQuery({ data: [], isSuccess: true, status: "success" });
    setCreateVersion(vi.fn());
    setArchive(vi.fn());
    renderDetail();
    expect(screen.getByTestId(TestIds.RESUME_DETAIL_HEADING)).toHaveTextContent("Senior Eng");
    expect(screen.getByTestId(TestIds.RESUME_DETAIL_VERSIONS_EMPTY)).toBeVisible();
  });

  it("renders one row per version", () => {
    setResumeQuery({ data: fixture(), isSuccess: true, status: "success" });
    setVersionsQuery({
      data: [versionFixture({ id: "v2", version_number: 2 }), versionFixture()],
      isSuccess: true,
      status: "success",
    });
    setCreateVersion(vi.fn());
    setArchive(vi.fn());
    renderDetail();
    expect(screen.getByTestId(TestIds.RESUME_DETAIL_VERSIONS_LIST)).toBeVisible();
    expect(screen.getByTestId(`${TestIds.RESUME_DETAIL_VERSION_ROW}-v2`)).toHaveTextContent("v2");
    expect(screen.getByTestId(`${TestIds.RESUME_DETAIL_VERSION_ROW}-v1`)).toHaveTextContent("v1");
  });

  it("renders a 'View HTML' link per version pointing at the render endpoint", () => {
    setResumeQuery({ data: fixture(), isSuccess: true, status: "success" });
    setVersionsQuery({
      data: [versionFixture()],
      isSuccess: true,
      status: "success",
    });
    setCreateVersion(vi.fn());
    setArchive(vi.fn());
    renderDetail();
    const link = screen.getByTestId(
      `${TestIds.RESUME_DETAIL_VERSION_RENDER_LINK}-v1`,
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      `/api/resumes/${FIXED_ID}/versions/v1/render/`,
    );
    // `noopener` and `target="_blank"` together stop the new tab from
    // touching `window.opener` and from leaking the source URL via Referer.
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("submits a new version with parsed JSON document", async () => {
    setResumeQuery({ data: fixture(), isSuccess: true, status: "success" });
    setVersionsQuery({ data: [], isSuccess: true, status: "success" });
    const mutateAsync = vi.fn().mockResolvedValueOnce(versionFixture());
    setCreateVersion(mutateAsync);
    setArchive(vi.fn());
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_TOGGLE));
    fireEvent.change(screen.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_DOCUMENT), {
      target: { value: '{"basics":{"name":"Alice"}}' },
    });
    fireEvent.submit(screen.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_FORM));

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      document: { basics: { name: "Alice" } },
    });
  });

  it("shows an inline error when document is not valid JSON", async () => {
    setResumeQuery({ data: fixture(), isSuccess: true, status: "success" });
    setVersionsQuery({ data: [], isSuccess: true, status: "success" });
    const mutateAsync = vi.fn();
    setCreateVersion(mutateAsync);
    setArchive(vi.fn());
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_TOGGLE));
    fireEvent.change(screen.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_DOCUMENT), {
      target: { value: "not json" },
    });
    fireEvent.submit(screen.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_FORM));

    expect(await screen.findByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_ERROR)).toHaveTextContent(
      /not valid json/i,
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows an inline error when document is a JSON array (not an object)", async () => {
    setResumeQuery({ data: fixture(), isSuccess: true, status: "success" });
    setVersionsQuery({ data: [], isSuccess: true, status: "success" });
    const mutateAsync = vi.fn();
    setCreateVersion(mutateAsync);
    setArchive(vi.fn());
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_TOGGLE));
    fireEvent.change(screen.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_DOCUMENT), {
      target: { value: "[1,2,3]" },
    });
    fireEvent.submit(screen.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_FORM));

    expect(await screen.findByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_ERROR)).toHaveTextContent(
      /must be a json object/i,
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("archives after inline confirm and navigates to list", async () => {
    setResumeQuery({ data: fixture(), isSuccess: true, status: "success" });
    setVersionsQuery({ data: [], isSuccess: true, status: "success" });
    setCreateVersion(vi.fn());
    const archive = vi.fn().mockResolvedValueOnce(null);
    setArchive(archive);
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByTestId(TestIds.RESUME_DETAIL_ARCHIVE));
    await user.click(screen.getByTestId(TestIds.RESUME_DETAIL_ARCHIVE_CONFIRM));
    await screen.findByText("list placeholder");
    expect(archive).toHaveBeenCalledTimes(1);
  });

  it("import form posts a File on submit", async () => {
    setResumeQuery({ data: fixture(), isSuccess: true, status: "success" });
    setVersionsQuery({ data: [], isSuccess: true, status: "success" });
    setCreateVersion(vi.fn());
    setArchive(vi.fn());
    const mutateAsync = vi.fn().mockResolvedValueOnce(versionFixture());
    setImportVersion(mutateAsync);
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByTestId(TestIds.RESUME_DETAIL_IMPORT_TOGGLE));
    const file = new File(['{"basics":{"name":"Alice"}}'], "resume.json", {
      type: "application/json",
    });
    await user.upload(screen.getByTestId(TestIds.RESUME_DETAIL_IMPORT_FILE), file);
    fireEvent.submit(screen.getByTestId(TestIds.RESUME_DETAIL_IMPORT_FORM));

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const [arg] = mutateAsync.mock.calls[0];
    expect(arg.file).toBe(file);
  });

  it("import form blocks submit with no file picked", async () => {
    setResumeQuery({ data: fixture(), isSuccess: true, status: "success" });
    setVersionsQuery({ data: [], isSuccess: true, status: "success" });
    setCreateVersion(vi.fn());
    setArchive(vi.fn());
    const mutateAsync = vi.fn();
    setImportVersion(mutateAsync);
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByTestId(TestIds.RESUME_DETAIL_IMPORT_TOGGLE));
    fireEvent.submit(screen.getByTestId(TestIds.RESUME_DETAIL_IMPORT_FORM));

    expect(await screen.findByTestId(TestIds.RESUME_DETAIL_IMPORT_ERROR)).toHaveTextContent(
      /pick a json file/i,
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("import form disables Cancel while the mutation is pending", async () => {
    setResumeQuery({ data: fixture(), isSuccess: true, status: "success" });
    setVersionsQuery({ data: [], isSuccess: true, status: "success" });
    setCreateVersion(vi.fn());
    setArchive(vi.fn());
    // Mark the import as pending so we can assert Cancel is locked.
    setImportVersion(vi.fn(), true);
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByTestId(TestIds.RESUME_DETAIL_IMPORT_TOGGLE));
    const cancel = screen.getByTestId(
      TestIds.RESUME_DETAIL_IMPORT_CANCEL,
    ) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
  });

  it("import form renders inline error when API rejects", async () => {
    setResumeQuery({ data: fixture(), isSuccess: true, status: "success" });
    setVersionsQuery({ data: [], isSuccess: true, status: "success" });
    setCreateVersion(vi.fn());
    setArchive(vi.fn());
    const mutateAsync = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("file: Invalid JSON."), { name: "ApiError" }));
    setImportVersion(mutateAsync);
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByTestId(TestIds.RESUME_DETAIL_IMPORT_TOGGLE));
    const file = new File(["not json"], "resume.json");
    await user.upload(screen.getByTestId(TestIds.RESUME_DETAIL_IMPORT_FILE), file);
    fireEvent.submit(screen.getByTestId(TestIds.RESUME_DETAIL_IMPORT_FORM));

    expect(await screen.findByTestId(TestIds.RESUME_DETAIL_IMPORT_ERROR)).toHaveTextContent(
      /invalid json/i,
    );
  });
});
