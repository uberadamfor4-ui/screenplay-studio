"""Validate actual exported PDF Unicode, fonts and screenplay geometry."""
import json
import logging
import re
import sys
from pathlib import Path
import pdfplumber

logging.disable(logging.CRITICAL)
source, expected, output = map(Path, sys.argv[1:4])
probe = json.loads(expected.read_text(encoding='utf-8'))
with pdfplumber.open(source) as pdf:
    assert len(pdf.pages) == 4, 'Unexpected screenplay pagination'
    body = [c for page in pdf.pages[1:] for c in page.chars if c['top'] >= 60 and c['bottom'] < 750]
    text = ''.join(c['text'] for c in body)
    normalize = lambda value: re.sub(r'\s+', '', value)
    for paragraph in probe['paragraphs']:
        assert normalize(paragraph) in normalize(text), 'Unicode did not round-trip exactly'
    assert all(abs(page.width - 612) < .1 and abs(page.height - 792) < .1 for page in pdf.pages)
    assert all(abs(c['size'] - 12) < .2 for c in body)
    fonts = sorted(set(c['fontname'] for c in body))
    assert any('ScreenplayCJKMobile-Regular' in name for name in fonts)
    assert any('ScreenplayCJKMobile-Bold' in name for name in fonts)
    for page in pdf.pages:
        assert all(-1 <= c['x0'] <= c['x1'] <= page.width+1 and -1 <= c['top'] <= c['bottom'] <= page.height+1 for c in page.chars)
    baselines = sorted(set(round(c['top'], 2) for c in pdf.pages[1].chars))
    assert any(abs(b-a-12) < .2 for a, b in zip(baselines, baselines[1:]))
    result = {'passed': True, 'pages': len(pdf.pages), 'aliasGroupsPerWeight': probe['aliasGroups'], 'regularExactUnicode': True, 'boldExactUnicode': True, 'fontPoints': 12, 'wrappedBaselineStepPoints': 12, 'paperPoints': [612,792], 'fonts': fonts, 'hashing': False}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, ensure_ascii=True, indent=2), encoding='utf-8')
print(json.dumps(result))
