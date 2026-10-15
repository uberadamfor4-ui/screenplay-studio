import json
import urllib.request
import zipfile
from pathlib import Path

BASE = 'https://cultivatingframes.top/portal/'
with urllib.request.urlopen(BASE + 'release.json', timeout=45) as response:
    manifest = json.load(response)
assert manifest['androidVersion'] == '0.1.0'
files = [entry for entry in manifest['downloads'] if entry['file'] == 'Screenplay-Studio-Android-0.1.0.apk'] + [manifest['androidGuide']]
assert len(files) == 2
Path('packages').mkdir()
for entry in files:
    assert entry['file'] in ['Screenplay-Studio-Android-0.1.0.apk', 'Screenplay-Studio-Android-0.1.0-Guide-zh-CN.pdf']
    assert 100000 < entry['bytes'] < 64 * 1024 * 1024
    with urllib.request.urlopen(BASE + 'downloads/' + entry['file'], timeout=90) as response:
        data = response.read(entry['bytes'] + 1)
    assert len(data) == entry['bytes']
    Path('packages', entry['file']).write_bytes(data)
with zipfile.ZipFile('incoming/app-release-unsigned.apk') as original, zipfile.ZipFile('packages/Screenplay-Studio-Android-0.1.0.apk') as signed:
    assert original.testzip() is None and signed.testzip() is None
    for name in original.namelist():
        assert original.read(name) == signed.read(name), name
    assert all(name in original.namelist() or name.startswith('META-INF/') for name in signed.namelist())
assert Path('packages/Screenplay-Studio-Android-0.1.0-Guide-zh-CN.pdf').read_bytes().startswith(b'%PDF-')
print('Original APK payload, ZIP CRC, signed delivery and guide structure verified without file hashing.')
