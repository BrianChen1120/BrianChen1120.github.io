"""
CI build script: strip comments from HTML/JS/CSS files and copy to dist/.
Used by GitHub Actions to produce a clean deployment.
"""

import shutil
import re
import sys
from pathlib import Path

SKIP_DIRS = {'.git', '.github', 'node_modules', 'upload', '測試的一些東西', '__pycache__'}
TARGET_EXTS = {'.html', '.htm', '.js', '.css'}


def remove_js_comments(code: str) -> str:
    result = []
    i = 0
    n = len(code)
    in_single_line = False
    in_multi_line = False
    in_single_quote = False
    in_double_quote = False
    in_backtick = False
    escape = False

    while i < n:
        ch = code[i]
        nxt = code[i + 1] if i + 1 < n else ''

        if in_single_line:
            if ch == '\n':
                in_single_line = False
                result.append(ch)
            i += 1
            continue

        if in_multi_line:
            if ch == '*' and nxt == '/':
                in_multi_line = False
                i += 2
            else:
                i += 1
            continue

        if in_single_quote:
            result.append(ch)
            if not escape and ch == "'":
                in_single_quote = False
            escape = (ch == '\\' and not escape)
            i += 1
            continue

        if in_double_quote:
            result.append(ch)
            if not escape and ch == '"':
                in_double_quote = False
            escape = (ch == '\\' and not escape)
            i += 1
            continue

        if in_backtick:
            result.append(ch)
            if not escape and ch == '`':
                in_backtick = False
            escape = (ch == '\\' and not escape)
            i += 1
            continue

        if ch == '/' and nxt == '/':
            in_single_line = True
            i += 2
            continue

        if ch == '/' and nxt == '*':
            in_multi_line = True
            i += 2
            continue

        if ch == "'":
            in_single_quote = True
            escape = False
            result.append(ch)
            i += 1
            continue

        if ch == '"':
            in_double_quote = True
            escape = False
            result.append(ch)
            i += 1
            continue

        if ch == '`':
            in_backtick = True
            escape = False
            result.append(ch)
            i += 1
            continue

        result.append(ch)
        i += 1

    return ''.join(result)


def remove_css_comments(code: str) -> str:
    result = []
    i = 0
    n = len(code)
    in_multi_line = False
    in_single_quote = False
    in_double_quote = False
    escape = False

    while i < n:
        ch = code[i]
        nxt = code[i + 1] if i + 1 < n else ''

        if in_multi_line:
            if ch == '*' and nxt == '/':
                in_multi_line = False
                i += 2
            else:
                i += 1
            continue

        if in_single_quote:
            result.append(ch)
            if not escape and ch == "'":
                in_single_quote = False
            escape = (ch == '\\' and not escape)
            i += 1
            continue

        if in_double_quote:
            result.append(ch)
            if not escape and ch == '"':
                in_double_quote = False
            escape = (ch == '\\' and not escape)
            i += 1
            continue

        if ch == '/' and nxt == '*':
            in_multi_line = True
            i += 2
            continue

        if ch == "'":
            in_single_quote = True
            escape = False
            result.append(ch)
            i += 1
            continue

        if ch == '"':
            in_double_quote = True
            escape = False
            result.append(ch)
            i += 1
            continue

        result.append(ch)
        i += 1

    return ''.join(result)


def remove_html_comments(html: str) -> str:
    return re.sub(r'<!--.*?-->', '', html, flags=re.DOTALL)


def process_html(text: str) -> str:
    no_html = remove_html_comments(text)

    def _script_replacer(m):
        return f"{m.group(1)}{remove_js_comments(m.group(2))}{m.group(3)}"

    processed = re.sub(
        r'(<script\b[^>]*>)(.*?)(</script>)',
        _script_replacer, no_html, flags=re.IGNORECASE | re.DOTALL
    )

    def _style_replacer(m):
        return f"{m.group(1)}{remove_css_comments(m.group(2))}{m.group(3)}"

    processed = re.sub(
        r'(<style\b[^>]*>)(.*?)(</style>)',
        _style_replacer, processed, flags=re.IGNORECASE | re.DOTALL
    )
    return processed


def process_file(text: str, ext: str) -> str:
    if ext in ('.html', '.htm'):
        return process_html(text)
    elif ext == '.js':
        return remove_js_comments(text)
    elif ext == '.css':
        return remove_css_comments(text)
    return text


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
    root = root.resolve()
    dist = root / 'dist'

    if dist.exists():
        shutil.rmtree(dist)

    for item in root.iterdir():
        if item.name in SKIP_DIRS or item.name == 'dist' or item.name == 'clear_code.py':
            continue
        dest = dist / item.name
        if item.is_dir():
            shutil.copytree(item, dest)
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, dest)

    count = 0
    for path in dist.rglob('*'):
        if not path.is_file():
            continue
        ext = path.suffix.lower()
        if ext not in TARGET_EXTS:
            continue
        try:
            text = path.read_text(encoding='utf-8')
            cleaned = process_file(text, ext)
            path.write_text(cleaned, encoding='utf-8')
            count += 1
        except UnicodeDecodeError:
            print(f"[SKIP] {path.relative_to(dist)}")

    print(f"[OK] Processed {count} files -> dist/")


if __name__ == '__main__':
    main()
