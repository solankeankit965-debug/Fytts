"use client";
import { useId, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { suggestBrands } from "../lib/brands";
export default function BrandInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId(),
    [focused, setFocused] = useState(false),
    [dismissed, setDismissed] = useState(false),
    [active, setActive] = useState(-1);
  const suggestions = suggestBrands(value),
    open = focused && !dismissed && value.trim().length > 0;
  function choose(name: string) {
    onChange(name);
    setDismissed(true);
    setActive(-1);
  }
  return (
    <div className="brand-field">
      <label htmlFor={id}>Brand</label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? id + "-list" : undefined}
        aria-activedescendant={
          open && active >= 0 && suggestions[active]
            ? id + "-option-" + active
            : undefined
        }
        autoComplete="off"
        required
        maxLength={80}
        placeholder="Start typing a brand…"
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setActive(-1);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setDismissed(false);
          setActive(-1);
        }}
        onKeyDownCapture={(e) => {
          if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setDismissed(true);
            setActive(-1);
          } else if (
            (e.key === "ArrowDown" || e.key === "ArrowUp") &&
            suggestions.length
          ) {
            e.preventDefault();
            setDismissed(false);
            setActive((i) =>
              e.key === "ArrowDown"
                ? (i + 1) % suggestions.length
                : i <= 0
                  ? suggestions.length - 1
                  : i - 1,
            );
          } else if (
            e.key === "Enter" &&
            open &&
            active >= 0 &&
            suggestions[active]
          ) {
            e.preventDefault();
            choose(suggestions[active]);
          }
        }}
      />
      {open && (
        <div className="brand-dropdown">
          <div role="listbox" id={id + "-list"} aria-label="Brand suggestions">
            {suggestions.map((name, i) => (
              <button
                key={name}
                id={id + "-option-" + i}
                role="option"
                aria-selected={i === active}
                type="button"
                tabIndex={-1}
                className={i === active ? "highlighted" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(name)}
              >
                <span>{name}</span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
          <p role="status">
            {suggestions.length
              ? "Choose a suggestion or keep your own brand name."
              : "No matching brand. You can keep the name you typed."}
          </p>
        </div>
      )}
    </div>
  );
}
