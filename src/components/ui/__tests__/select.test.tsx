import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Option, Select } from "../primitives";

describe("Select", () => {
  it("opens the listbox and commits a value on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Select value="a" onChange={onChange} aria-label="Pick one">
        <Option value="a">Alpha</Option>
        <Option value="b">Beta</Option>
      </Select>
    );

    const trigger = screen.getByRole("button", { name: "Pick one" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("does not open when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Select value="a" onChange={onChange} disabled aria-label="Pick one">
        <Option value="a">Alpha</Option>
      </Select>
    );

    await user.click(screen.getByRole("button", { name: "Pick one" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
