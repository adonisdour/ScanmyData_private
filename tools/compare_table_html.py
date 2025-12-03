import json
import pandas as pd
import difflib
from pathlib import Path

DATA_JSON = Path(__file__).parents[1] / 'data' / 'tony' / '802576637_invoices.json'


def build_full_table_html(df: pd.DataFrame) -> str:
    df2 = df.copy()
    # mimic full-page behavior
    df2 = df2.fillna("")
    df2 = df2.astype(str)
    drop_cols = [col for col in ["ΦΠΑ_ΑΝΑΛΥΣΗ", "Α/Α", "ΦΠΑ_ΚΑΤΗΓΟΡΙΑ"] if col in df2.columns]
    if drop_cols:
        df2 = df2.drop(columns=drop_cols)
    # include MARK value in checkbox as full page does
    if 'MARK' in df2.columns:
        checkboxes = df2['MARK'].apply(lambda v: f'<input type="checkbox" name="delete_mark" value="{str(v)}">')
        df2.insert(0, "✓", checkboxes)
    table_html = df2.to_html(classes="summary-table", index=False, escape=False)
    table_html = table_html.replace(
        "<th>✓</th>",
        '<th><input type="checkbox" id="selectAll" title="Επιλογή όλων"></th>'
    )
    table_html = table_html.replace("<td>", '<td><div class="cell-wrap">').replace("</td>", "</div></td>")
    return table_html


def build_fragment_table_html(df: pd.DataFrame) -> str:
    df2 = df.copy()
    df2 = df2.fillna("")
    df2 = df2.astype(str)
    drop_cols = [col for col in ["ΦΠΑ_ΑΝΑΛΥΣΗ", "Α/Α", "ΦΠΑ_ΚΑΤΗΓΟΡΙΑ"] if col in df2.columns]
    if drop_cols:
        df2 = df2.drop(columns=drop_cols)
    # fragment should match full-page exactly
    if 'MARK' in df2.columns:
        checkboxes = df2['MARK'].apply(lambda v: f'<input type="checkbox" name="delete_mark" value="{str(v)}">')
        df2.insert(0, "✓", checkboxes)
    table_html = df2.to_html(classes="summary-table", index=False, escape=False)
    table_html = table_html.replace(
        "<th>✓</th>",
        '<th><input type="checkbox" id="selectAll" title="Επιλογή όλων"></th>'
    )
    table_html = table_html.replace("<td>", '<td><div class="cell-wrap">').replace("</td>", "</div></td>")
    return table_html


def main():
    if not DATA_JSON.exists():
        print('Missing JSON:', DATA_JSON)
        return
    data = json.loads(DATA_JSON.read_text(encoding='utf-8'))
    df = pd.DataFrame(data)
    full = build_full_table_html(df)
    frag = build_fragment_table_html(df)

    if full == frag:
        print('OK: HTML strings are identical')
        return

    print('HTML differ — showing unified diff (first 200 lines):')
    a = full.splitlines(keepends=True)
    b = frag.splitlines(keepends=True)
    diff = difflib.unified_diff(a, b, fromfile='full', tofile='fragment')
    for i, line in enumerate(diff):
        print(line.rstrip())
        if i > 200:
            print('...diff truncated...')
            break


if __name__ == '__main__':
    main()
