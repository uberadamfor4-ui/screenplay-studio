import json
import urllib.request
import zipfile
from pathlib import Path

BASE = 'https://cultivatingframes.top/portal/'
metadata = json.loads(Path('.github/release-tools/android-release.json').read_text(encoding='utf-8'))
version = metadata['version']
apk = f'Screenplay-Studio-Android-{version}.apk'
guide = f'Screenplay-Studio-Android-{version}-Guide-zh-CN.pdf'
with urllib.request.urlopen(BASE + 'release.json', timeout=45) as response:
    manifest = json.load(response)
assert manifest['androidVersion'] == version
files = [entry for entry in manifest['downloads'] if entry['file'] == apk] + [manifest['androidGuide']]
assert len(files) == 2
Path('packages').mkdir()
for entry in files:
    assert entry['file'] in [apk, guide]
    assert 100000 < entry['bytes'] < 64 * 1024 * 1024
    with urllib.request.urlopen(BASE + 'downloads/' + entry['file'], timeout=90) as response:
        data = response.read(entry['bytes'] + 1)
    assert len(data) == entry['bytes']
    Path('packages', entry['file']).write_bytes(data)
with zipfile.ZipFile('incoming/app-release-unsigned.apk') as original, zipfile.ZipFile(Path('packages', apk)) as signed:
    assert original.testzip() is None and signed.testzip() is None
    for name in original.namelist():
        assert original.read(name) == signed.read(name), name
    assert all(name in original.namelist() or name.startswith('META-INF/') for name in signed.namelist())
    manifest = signed.read('AndroidManifest.xml')
    for marker in ['AcceptanceDocumentsProvider', 'AcceptanceInputMethod', 'acceptance_input_method']:
        assert marker.encode('utf-8') not in manifest and marker.encode('utf-16le') not in manifest
        assert all(marker.encode('utf-8') not in signed.read(name) for name in signed.namelist() if name.endswith('.dex'))
assert Path('packages', guide).read_bytes().startswith(b'%PDF-')
print('Original APK payload, ZIP CRC, signed delivery and guide structure verified without file hashing.')
