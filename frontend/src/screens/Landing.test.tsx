import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Landing } from "./Landing";

describe("Landing", () => {
  it("renders the Slotflow lockup and hero tagline", () => {
    render(<Landing />);
    expect(screen.getByRole("img", { name: /slotflow/i })).toBeInTheDocument();
    expect(
      screen.getByText(/a crm for the job hunt that doesn't forget the follow-up/i),
    ).toBeInTheDocument();
  });

  it("has a 'Get started' call to action", () => {
    render(<Landing />);
    expect(screen.getByRole("link", { name: /get started/i })).toBeInTheDocument();
  });
});
