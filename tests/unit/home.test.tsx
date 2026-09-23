import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Home from "@/app/page";

afterEach(cleanup);

describe("Home (Stage 1 shell)", () => {
  it("renders the product name and stage marker", () => {
    render(<Home />);
    expect(
      screen.getByRole("heading", { level: 1, name: "LOCKED IN" }),
    ).toBeTruthy();
    expect(screen.getByText("Foundation ready.")).toBeTruthy();
    expect(screen.getByText("STAGE 1 / 10")).toBeTruthy();
  });
});
