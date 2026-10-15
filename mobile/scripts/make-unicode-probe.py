import json
import unicodedata
from collections import defaultdict
from pathlib import Path
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[2]
font = TTFont(root / 'src/assets/fonts/ScreenplayCJK-Regular.otf')
groups = defaultdict(list)
for code, glyph in font.getBestCmap().items():
    groups[glyph].append(code)
pairs = [codes for codes in groups.values() if len(codes) > 1 and all(unicodedata.category(chr(c))[0] in 'LNPS' and c not in [0x1160, 0x3164, 0xFFA0] for c in codes)]
text = '|'.join(''.join(chr(c) for c in codes) for codes in pairs)
project = json.loads((root / 'tests/fixtures/document-import/last-bus-final.ssproj').read_text(encoding='utf-8'))
for weight in ['regular', 'bold']:
    project['elements'].append({'id': 'unicode-copy-' + weight, 'type': 'action', 'text': 'COPY-' + weight.upper() + '|' + text + '|END-' + weight.upper(), 'textStyle': {'bold': weight == 'bold', 'fontFamily': 'Screenplay CJK'}})
destination = root / 'mobile/android/app/src/androidTest/assets'
destination.mkdir(parents=True, exist_ok=True)
(destination / 'unicode-copy.ssproj').write_text(json.dumps(project, ensure_ascii=False), encoding='utf-8')
(destination / 'unicode-copy-expected.json').write_text(json.dumps({'aliasGroups': len(pairs), 'paragraphs': [x['text'] for x in project['elements'][-2:]]}, ensure_ascii=False), encoding='utf-8')
print(json.dumps({'groups': len(pairs), 'charactersPerWeight': len(text)}))
