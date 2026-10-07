import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { cents } from "@/domain/money";
import type { Cents } from "@/domain/types";

import { applyKeypadKey } from "./keypad";
import { MoneyInput } from "./MoneyInput";
import { NumericKeypad } from "./NumericKeypad";

const MoneyField = ({
  initial = null,
  onValue,
  allowNegative = false,
}: {
  readonly initial?: Cents | null;
  readonly onValue?: (value: Cents | null) => void;
  readonly allowNegative?: boolean;
}) => {
  const [value, setValue] = useState<Cents | null>(initial);
  return (
    <MoneyInput
      aria-label="Importe"
      value={value}
      allowNegative={allowNegative}
      onValueChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
};

describe("MoneyInput", () => {
  it("guarda céntimos enteros al escribir con coma", async () => {
    const onValue = vi.fn();
    render(<MoneyField onValue={onValue} />);
    await userEvent.type(screen.getByLabelText("Importe"), "12,5");
    expect(onValue).toHaveBeenLastCalledWith(1250);
    expect(Number.isInteger(onValue.mock.lastCall?.[0])).toBe(true);
  });

  it("normaliza el texto al salir del campo", async () => {
    render(<MoneyField />);
    const input = screen.getByLabelText("Importe");
    await userEvent.type(input, "1234,5");
    expect(input).toHaveValue("1234,5");
    await userEvent.tab();
    expect(input).toHaveValue("1234,50");
  });

  it("acepta el punto como separador decimal y los miles en español", async () => {
    const onValue = vi.fn();
    render(<MoneyField onValue={onValue} />);
    const input = screen.getByLabelText("Importe");
    await userEvent.type(input, "9.99");
    expect(onValue).toHaveBeenLastCalledWith(999);
    await userEvent.clear(input);
    await userEvent.type(input, "1.234,56");
    expect(onValue).toHaveBeenLastCalledWith(123456);
  });

  it("ignora las letras y avisa de un campo vacío con null", async () => {
    const onValue = vi.fn();
    render(<MoneyField initial={cents(500)} onValue={onValue} />);
    const input = screen.getByLabelText("Importe");
    expect(input).toHaveValue("5,00");
    await userEvent.type(input, "abc");
    expect(input).toHaveValue("5,00");
    await userEvent.clear(input);
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it("no admite negativos salvo que se pida", async () => {
    const onValue = vi.fn();
    const { unmount } = render(<MoneyField onValue={onValue} />);
    await userEvent.type(screen.getByLabelText("Importe"), "-5");
    expect(onValue).toHaveBeenLastCalledWith(null);
    unmount();

    render(<MoneyField allowNegative onValue={onValue} />);
    await userEvent.type(screen.getByLabelText("Importe"), "-5");
    expect(onValue).toHaveBeenLastCalledWith(-500);
  });

  it("muestra el valor que llega de fuera cuando no tiene el foco", () => {
    const { rerender } = render(
      <MoneyInput aria-label="Importe" value={cents(1000)} onValueChange={() => undefined} />,
    );
    expect(screen.getByLabelText("Importe")).toHaveValue("10,00");
    rerender(<MoneyInput aria-label="Importe" value={null} onValueChange={() => undefined} />);
    expect(screen.getByLabelText("Importe")).toHaveValue("");
  });
});

describe("NumericKeypad", () => {
  const Keypad = ({ digitsOnly = false }: { readonly digitsOnly?: boolean }) => {
    const [text, setText] = useState("");
    return (
      <>
        <output aria-label="Importe tecleado">{text}</output>
        <NumericKeypad
          digitsOnly={digitsOnly}
          onKey={(key) => setText((current) => applyKeypadKey(current, key))}
        />
      </>
    );
  };

  it("tiene doce teclas con nombre accesible", () => {
    render(<Keypad />);
    const keypad = screen.getByRole("group", { name: "Teclado numérico" });
    expect(keypad.querySelectorAll("button")).toHaveLength(12);
    expect(screen.getByRole("button", { name: "Coma decimal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Borrar" })).toBeInTheDocument();
  });

  it("compone un importe: dígitos, una sola coma, dos decimales y borrar", async () => {
    render(<Keypad />);
    const press = (name: string) => userEvent.click(screen.getByRole("button", { name }));
    for (const key of ["1", "2", "Coma decimal", "Coma decimal", "5", "0", "9"]) await press(key);
    expect(screen.getByLabelText("Importe tecleado")).toHaveTextContent("12,50");
    await press("Borrar");
    expect(screen.getByLabelText("Importe tecleado")).toHaveTextContent("12,5");
  });

  it("empezar por la coma escribe «0,»", async () => {
    render(<Keypad />);
    await userEvent.click(screen.getByRole("button", { name: "Coma decimal" }));
    expect(screen.getByLabelText("Importe tecleado")).toHaveTextContent("0,");
  });

  it("en modo PIN no hay coma", () => {
    render(<Keypad digitsOnly />);
    expect(screen.queryByRole("button", { name: "Coma decimal" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(11);
  });

  it("desactivado no emite teclas", async () => {
    const onKey = vi.fn();
    render(<NumericKeypad disabled onKey={onKey} />);
    await userEvent.click(screen.getByRole("button", { name: "7" }));
    expect(onKey).not.toHaveBeenCalled();
  });
});
