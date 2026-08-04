# Screenplay CJK Font Modification Notice

`ScreenplayCJK-Regular.otf` and `ScreenplayCJK-Bold.otf` are modified
versions of Noto Sans CJK SC Regular and Bold.

The primary family and PostScript names were changed to
`Screenplay CJK Unicode` / `ScreenplayCJKUnicode-*`. Unicode cmap entries
for CJK Radicals Supplement and Kangxi Radicals (U+2E80 through U+2FDF)
were removed. Those aliases shared glyphs with canonical CJK Unified
Ideographs and caused Chromium PDF exports to map copied text to radical
code points. Glyph outlines, advances, kerning, and weight data were not
changed.

The modified fonts are distributed under the SIL Open Font License 1.1
in `OFL.txt`. Upstream project:
https://github.com/notofonts/noto-cjk
