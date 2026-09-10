"""THROWAWAY builder: embeds the full blog-posts articles into the reading-room page.

Regenerate after editing articles or cards:
  python src/app/prototype/blog/build.py
Then open http://localhost:3000/prototype/blog
"""
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
POSTS = ROOT / "blog-posts" / "posts"
OUT = Path(__file__).resolve().parent / "index.html"

ORDER = [
    "auto-tag-intelligence",
    "extensions-v2-quiet-rebuild",
    "library-redesign-that-didnt-ship",
    "from-410-tests-to-56",
    "getting-ready-next-release",
    "component-library-trials",
    "performance-honesty",
    "auto-tag-second-week",
]


def inline_md(text: str) -> str:
    text = html.escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"`(.+?)`", r"<code>\1</code>", text)
    return text


def md_to_html(md: str) -> str:
    lines = md.splitlines()
    # strip frontmatter
    if lines and lines[0].strip() == "---":
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
        lines = lines[end + 1 :]
    out: list[str] = []
    in_list = False
    in_table = False
    para: list[str] = []

    def flush_para() -> None:
        nonlocal para
        if para:
            out.append("<p>" + inline_md(" ".join(para)) + "</p>")
            para = []

    def close_blocks() -> None:
        nonlocal in_list, in_table
        if in_list:
            out.append("</ul>")
            in_list = False
        if in_table:
            out.append("</tbody></table>")
            in_table = False

    for raw in lines:
        line = raw.strip()
        if not line:
            flush_para()
            close_blocks()
            continue
        if line.startswith("|"):
            flush_para()
            if in_list:
                out.append("</ul>")
                in_list = False
            cells = [inline_md(c.strip()) for c in line.strip("|").split("|")]
            if all(set(c.strip()) <= set("-:") for c in cells):
                continue  # separator row
            if not in_table:
                out.append('<table class="article-table"><tbody>')
                in_table = True
            tag = "th" if len(out) > 0 and out[-1].endswith("<tbody>") else "td"
            out.append(
                "<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in cells) + "</tr>"
            )
        elif line.startswith("## "):
            flush_para()
            close_blocks()
            out.append("<h3>" + inline_md(line[3:]) + "</h3>")
        elif line.startswith("- "):
            flush_para()
            if in_table:
                out.append("</tbody></table>")
                in_table = False
            if not in_list:
                out.append('<ul class="article-list">')
                in_list = True
            out.append("<li>" + inline_md(line[2:]) + "</li>")
        else:
            para.append(line)
    flush_para()
    close_blocks()
    return "\n".join(out)


def block(slug: str, article: str) -> str:
    return (
        "<details class=\"full-article\"><summary>Read the full article</summary>\n"
        f'<div class="article-body">\n{article}\n</div>\n</details>'
    )


def main() -> None:
    template = OUT.read_text(encoding="utf-8")
    rendered = {
        slug: block(
            slug, md_to_html((POSTS / slug / "index.md").read_text(encoding="utf-8"))
        )
        for slug in ORDER
    }
    if "<!--FULL:" in template:
        for slug in ORDER:
            marker = f"<!--FULL:{slug}-->"
            if marker not in template:
                raise SystemExit(f"marker {marker} missing from index.html")
            template = template.replace(marker, rendered[slug])
    else:
        # Idempotent: swap previously generated blocks in card order.
        parts = re.split(
            r'<details class="full-article">.*?</div>\n</details>',
            template,
            flags=re.DOTALL,
        )
        if len(parts) != len(ORDER) + 1:
            raise SystemExit(
                f"expected {len(ORDER)} article blocks, found {len(parts) - 1}"
            )
        template = parts[0] + "".join(
            rendered[slug] + parts[i + 1] for i, slug in enumerate(ORDER)
        )
    OUT.write_text(template, encoding="utf-8")
    print(f"wrote {OUT} ({len(template)} chars)")


if __name__ == "__main__":
    main()
