import re
from pathlib import Path


def main() -> None:
    path = Path("src/utils/financeDashboardResponse.js")
    text = path.read_text(encoding="utf-8")

    # Replace the remainder loop to skip export-related helper tiles.
    pattern = re.compile(
        r"for\s*\(\s*const\s+k\s+of\s+Array\.from\(keys\)\.sort\(\)\)\s*\{\s*\r?\n"
        r"(\s*)const\s+slot\s*=\s*formatControlCentreTile\(k,\s*tiles\[k\]\);\s*\r?\n"
        r"\1if\s*\(\s*slot\s*\)\s*ordered\.push\(slot\);\s*\r?\n"
        r"\s*\}",
        re.MULTILINE,
    )

    # Note: we avoid regex replacement here because of CRLF/indentation differences.

    # Safer second approach: direct string replacement on the exact current block.
    old = (
        "for (const k of Array.from(keys).sort()) {"
        "\r\n"
        "    const slot = formatControlCentreTile(k, tiles[k]);"
        "\r\n"
        "    if (slot) ordered.push(slot);"
        "\r\n"
        "  }"
    )
    if old not in text:
        # Try with spaces (as seen in read output).
        old = (
            "for (const k of Array.from(keys).sort()) {\r\n"
            "    const slot = formatControlCentreTile(k, tiles[k]);\r\n"
            "    if (slot) ordered.push(slot);\r\n"
            "  }"
        )

    if old in text:
        new = (
            "for (const k of Array.from(keys).sort()) {\r\n"
            "    // Some server payloads include helper fields like exported statement labels.\r\n"
            "    // These shouldn't render as dashboard KPI tiles.\r\n"
            "    if (k && typeof k === 'string' && k.toLowerCase().includes('export')) continue;\r\n"
            "    const slot = formatControlCentreTile(k, tiles[k]);\r\n"
            "    if (slot) ordered.push(slot);\r\n"
            "  }"
        )
        path.write_text(text.replace(old, new), encoding="utf-8")
        return

    # Fallback: regex-based replacement (works even if indentation differs).
    text2, n = pattern.subn(
        lambda m: (
            "for (const k of Array.from(keys).sort()) {\r\n"
            f"{m.group(1)}// Some server payloads include helper fields like exported statement labels.\r\n"
            f"{m.group(1)}// These shouldn't render as dashboard KPI tiles.\r\n"
            f"{m.group(1)}if (k && typeof k === 'string' && k.toLowerCase().includes('export')) continue;\r\n"
            f"{m.group(1)}const slot = formatControlCentreTile(k, tiles[k]);\r\n"
            f"{m.group(1)}if (slot) ordered.push(slot);\r\n"
            "  }"
        ),
        text,
    )
    if n == 0:
        raise SystemExit("Could not locate tiles remainder loop to patch.")
    path.write_text(text2, encoding="utf-8")


if __name__ == "__main__":
    main()

