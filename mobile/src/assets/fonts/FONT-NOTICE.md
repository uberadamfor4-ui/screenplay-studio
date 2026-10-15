# Android CJK Font Modification Notice

These SIL Open Font License 1.1 fonts derive from the project's modified
Noto Sans CJK SC fonts. The Android family is named Screenplay CJK Mobile.

All 44,481 encoded Unicode characters are retained. Unreachable glyphs
are removed with fontTools layout closure, then 220 shared Unicode aliases
receive distinct glyph IDs with identical outlines and horizontal/vertical
metrics. This prevents Chromium PDF ToUnicode maps from choosing another
character that shares the same visible glyph, including U+80F6 and U+3B35.
Characters are not rewritten or normalized in the manuscript or PDF.

The reproducible build and coverage/outline/advance checks are in
mobile/scripts/prepare-cjk-fonts.py (fontTools 4.67.0).
The original project font notice and SIL license remain bundled.
Upstream: https://github.com/notofonts/noto-cjk
