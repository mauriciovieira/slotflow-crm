import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StubPanel } from "./StubPanel";
import { TestIds } from "../testIds";

describe("StubPanel", () => {
  it("renders the title prop inside the titled element", () => {
    render(<StubPanel title="Opportunities" />);
    const title = screen.getByTestId(TestIds.STUB_PANEL_TITLE);
    expect(title).toHaveTextContent("Opportunities");
  });

  it("renders an accessible heading", () => {
    render(<StubPanel title="Resumes" />);
    const heading = screen.getByRole("heading", { name: "Resumes" });
    expect(heading).toBeVisible();
  });
});
