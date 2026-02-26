import re

with open('templates/search.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Track unclosed try blocks
stack = []

for i, line in enumerate(lines, 1):
    # Simple regex  - just look for try { and catch/finally
    try_match = re.search(r'\btry\s*\{', line)
    catch_match = re.search(r'\}\s*catch\s*[\(\w]', line)
    finally_match = re.search(r'\}\s*finally', line)
    
    if try_match:
        stack.append((i, line.strip()[:80]))
    elif (catch_match or finally_match):
        if stack:
            popped = stack.pop()

print(f"Unclosed try blocks: {len(stack)}")
if stack:
    for line_no, text in stack:
        print(f"\nLine {line_no}: {text}")
        # Show context
        start = max(0, line_no - 5)
        end = min(len(lines), line_no + 15)
        for j in range(start, end):
            marker = ">>> " if j+1 == line_no else "    "
            print(f"{marker}{j+1}: {lines[j].rstrip()[:100]}")
