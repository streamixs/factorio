// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FactorioServer } from "@factorio/shared";

const mocks = vi.hoisted(() => ({ createServer: vi.fn() }));

vi.mock("@/lib/api", () => ({ createServer: mocks.createServer }));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    variant,
    size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: ReactNode;
    variant?: string;
    size?: string;
  }) => {
    void variant;
    void size;
    return <button {...props}>{children}</button>;
  },
  buttonVariants: () => "",
}));

interface MockSelectItem {
  value: string;
  label: string;
}

interface MockSelectProps {
  items?: MockSelectItem[];
  value?: string;
  onValueChange?: (value: string) => void;
  children?: ReactNode;
}

vi.mock("@/components/ui/select", () => ({
  Select: ({ items = [], value, onValueChange }: MockSelectProps) => (
    <select
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
}));

import { CreateServerForm } from "./create-server-form";

type User = ReturnType<typeof userEvent.setup>;

async function renderForm() {
  const onCreated = vi.fn();
  const onError = vi.fn();
  const user = userEvent.setup();

  render(
    <CreateServerForm
      versions={[]}
      storageClasses={[]}
      onCreated={onCreated}
      onError={onError}
    />,
  );

  return { user, onCreated, onError };
}

async function reachResourcesStep(user: User) {
  await user.type(screen.getByLabelText("Nom technique"), "ui-test");
  await user.click(screen.getByRole("button", { name: /Continuer/ }));
  await screen.findByLabelText("Seed");
  await user.click(screen.getByRole("button", { name: /Continuer/ }));
  await screen.findByText("Preset de ressources");
}

async function waitForCreateButton() {
  const button = screen.getByRole("button", { name: "Créer le serveur" });
  await waitFor(() => {
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
  return button;
}

describe("CreateServerForm", () => {
  beforeEach(() => {
    mocks.createServer.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not advance from the identity step with an invalid name", async () => {
    const { user } = await renderForm();

    await user.type(screen.getByLabelText("Nom technique"), "Bad Name");
    await user.click(screen.getByRole("button", { name: /Continuer/ }));

    expect(screen.getByRole("alert").textContent).toContain("minuscules");
    expect(screen.queryByLabelText("Seed")).toBeNull();
  });

  it("does not create on a form submit or Enter at the resources step", async () => {
    const { user } = await renderForm();
    await reachResourcesStep(user);

    const storage = screen.getByLabelText("Stockage");
    await user.clear(storage);
    await user.type(storage, "20Gi");

    const form = document.querySelector("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    await user.keyboard("{Enter}");

    expect(mocks.createServer).not.toHaveBeenCalled();
    expect(screen.getByText("Preset de ressources")).toBeTruthy();
  });

  it("creates only from the explicit button and resets afterwards", async () => {
    mocks.createServer.mockResolvedValue({
      metadata: { name: "ui-test" },
      spec: {},
    } as FactorioServer);

    const { user, onCreated } = await renderForm();
    await reachResourcesStep(user);

    const create = await waitForCreateButton();
    await user.click(create);

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });

    expect(mocks.createServer).toHaveBeenCalledTimes(1);
    expect(mocks.createServer.mock.calls[0][0]).toMatchObject({
      name: "ui-test",
    });
    expect(
      (screen.getByLabelText("Nom technique") as HTMLInputElement).value,
    ).toBe("");
    expect(screen.queryByText("Preset de ressources")).toBeNull();
  });

  it("keeps the entered values when creation fails", async () => {
    mocks.createServer.mockRejectedValue(new Error("name exists"));

    const { user, onError } = await renderForm();
    await reachResourcesStep(user);

    const storage = screen.getByLabelText("Stockage");
    await user.clear(storage);
    await user.type(storage, "20Gi");

    const create = await waitForCreateButton();
    await user.click(create);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("name exists");
    });

    expect(screen.getByText("Preset de ressources")).toBeTruthy();
    expect((screen.getByLabelText("Stockage") as HTMLInputElement).value).toBe(
      "20Gi",
    );
  });
});
