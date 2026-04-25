import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StubPanel } from "./StubPanel";
import { TestIds } from "../testIds";

describe("StubPanel", () => {
  it("renders the coming-soon placeholder inside a tagged section", () => {
    render(<StubPanel />);
    const panel = screen.getByTestId(TestIds.STUB_PANEL);
    expect(panel).toHaveTextContent(/coming soon/i);
    expect(panel).toHaveTextContent(/lands in a later PR/i);
  });

  it("does not emit its own heading so the dashboard header stays the page h1", () => {
    render(<StubPanel />);
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
