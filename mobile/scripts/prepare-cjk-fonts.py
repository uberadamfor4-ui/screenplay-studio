"""Build Android fonts with distinct glyph IDs for distinct Unicode characters."""
import argparse
import copy
import json
from collections import defaultdict
from pathlib import Path
from fontTools import subset
from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'mobile/src/assets/fonts'

def outline(glyphs, glyph):
    pen = RecordingPen()
    glyphs[glyph].draw(pen)
    return pen.value

def validate(source, target):
    old = TTFont(source, recalcTimestamp=False)
    new = TTFont(target, recalcTimestamp=False)
    before, after = old.getBestCmap(), new.getBestCmap()
    assert before.keys() == after.keys(), 'Unicode coverage changed'
    assert len(set(after.values())) == len(after), 'Unicode glyph aliases remain'
    assert len(new.getGlyphOrder()) <= 65535
    groups = defaultdict(list)
    for code, glyph in before.items():
        groups[glyph].append(code)
    aliases = [code for codes in groups.values() if len(codes) > 1 for code in codes]
    for code in before:
        for table in ['hmtx', 'vmtx']:
            assert old[table].metrics[before[code]] == new[table].metrics[after[code]], (code, table)
    old_glyphs, new_glyphs = old.getGlyphSet(), new.getGlyphSet()
    for code in aliases + [0x4E2D, 0x6587, 0x80F6, 0xFF0C]:
        assert outline(old_glyphs, before[code]) == outline(new_glyphs, after[code]), code
    return {'coverage': len(after), 'glyphs': len(new.getGlyphOrder()), 'aliasCharactersOutlineChecked': len(aliases), 'aliasesRemaining': 0, 'allAdvancesPreserved': True}

def build(source, target, weight):
    font = TTFont(source, recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=list(font.getBestCmap()))
    worker.subset(font)
    top = font['CFF '].cff.topDictIndex[0]
    strings = top.CharStrings
    order = font.getGlyphOrder()[:]
    groups = defaultdict(list)
    for code, glyph in font.getBestCmap().items():
        groups[glyph].append(code)
    free = (f'cid{index:05d}' for index in range(1, 65535) if f'cid{index:05d}' not in strings.charStrings)
    replacements = {}
    for glyph, codes in groups.items():
        for code in codes[1:]:
            name = next(free)
            charstring, selector = strings.getItemAndSelector(glyph)
            if strings.charStringsAreIndexed:
                strings.charStrings[name] = len(strings.charStringsIndex)
                strings.charStringsIndex.append(copy.copy(charstring))
                top.FDSelect.gidArray.append(selector)
            else:
                strings.charStrings[name] = copy.copy(charstring)
            order.append(name)
            for table in ['hmtx', 'vmtx']:
                font[table].metrics[name] = font[table].metrics[glyph]
            if glyph in font['VORG'].VOriginRecords:
                font['VORG'].VOriginRecords[name] = font['VORG'].VOriginRecords[glyph]
            replacements[code] = name
    top.charset = order
    font.setGlyphOrder(order)
    for table in font['cmap'].tables:
        if table.isUnicode() and hasattr(table, 'cmap'):
            for code, glyph in replacements.items():
                if code in table.cmap:
                    table.cmap[code] = glyph
    family = 'Screenplay CJK Mobile'
    postscript = f'ScreenplayCJKMobile-{weight}'
    names = {1: family, 2: weight, 3: f'1037Film:{postscript}:1.1', 4: f'{family} {weight}', 6: postscript, 16: family, 17: weight}
    for record in font['name'].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    font['CFF '].cff.fontNames = [postscript]
    top.FamilyName, top.FullName = family, f'{family} {weight}'
    target.parent.mkdir(parents=True, exist_ok=True)
    font.save(target)
    return validate(source, target)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    reports = {}
    for weight in ['Regular', 'Bold']:
        source = ROOT / f'src/assets/fonts/ScreenplayCJK-{weight}.otf'
        target = DEST / f'ScreenplayCJKMobile-{weight}.otf'
        reports[weight] = validate(source, target) if args.verify else build(source, target, weight)
    print(json.dumps({'passed': True, 'fonts': reports}))
