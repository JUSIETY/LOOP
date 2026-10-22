"""Download three pinned public Kaggle datasets; retain provenance and raw ZIPs.

Run with LOOP_LARGE_TRAINING_DIR pointing at a scratch directory.
Images are training inputs only and must not be published with the Site.
"""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.request
import zipfile

ROOT = Path(os.environ.get('LOOP_LARGE_TRAINING_DIR', '/tmp/loop-large-training'))
SOURCES = [
    ('tricascade', 'salam035/waste-datasets', 1),
    ('trashbox', 'ghaniahmadzai/trashbox-v2-cleaned-modified', 1),
    ('household', 'alistairking/recyclable-and-household-waste-classification', 1),
]

def download(source):
    key, ref, version = source
    ROOT.mkdir(parents=True, exist_ok=True)
    metadata_path = ROOT / (key + '-metadata.json')
    with urllib.request.urlopen('https://www.kaggle.com/api/v1/datasets/view/' + ref, timeout=30) as response:
        metadata = json.load(response)
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
    if metadata.get('currentVersionNumber') != version:
        raise RuntimeError(f'{ref}: inspect new dataset version before proceeding')
    target = ROOT / (key + '.zip')
    if target.exists() and zipfile.is_zipfile(target):
        print(key, 'using existing ZIP', target.stat().st_size, flush=True)
    else:
        temporary = target.with_suffix('.part')
        url = 'https://www.kaggle.com/api/v1/datasets/download/' + ref + '?datasetVersionNumber=' + str(version)
        with urllib.request.urlopen(urllib.request.Request(url, headers={'Range': 'bytes=0-0'}), timeout=60) as response:
            total = int(response.headers['Content-Range'].split('/')[-1])
            signed_url = response.url  # session memory only
        started = last = time.monotonic()
        progress_path = ROOT / (key + '-ranges.json')
        if progress_path.exists():
            progress = json.loads(progress_path.read_text())
            if progress['total'] != total: raise RuntimeError('Source ZIP size changed')
        else:
            prefix = temporary.stat().st_size if temporary.exists() else 0
            progress = dict(total=total, prefix=prefix, done=[])
            progress_path.write_text(json.dumps(progress))
        prefix = progress['prefix']
        chunks = [(start, min(total, start+128*1024*1024)-1)
                  for start in range(prefix, total, 128*1024*1024)]
        pending = [(start,end) for start,end in chunks if start not in progress['done']]
        fd = os.open(temporary, os.O_CREAT | os.O_RDWR, 0o600)
        def fetch_range(bounds):
            start,end=bounds
            for attempt in range(4):
                try:
                    request=urllib.request.Request(signed_url, headers={'Range':f'bytes={start}-{end}'})
                    with urllib.request.urlopen(request,timeout=60) as response:
                        if not response.headers.get('Content-Range','').startswith(f'bytes {start}-'):
                            raise RuntimeError('Unexpected HTTP range')
                        block=response.read()
                    if len(block)!=end-start+1: raise RuntimeError('Incomplete HTTP range')
                    offset=0
                    while offset<len(block): offset+=os.pwrite(fd,block[offset:],start+offset)
                    return start
                except Exception:
                    if attempt==3: raise
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as workers:
                for future in concurrent.futures.as_completed([workers.submit(fetch_range,b) for b in pending]):
                    progress['done'].append(future.result())
                    state_temp=progress_path.with_suffix('.tmp')
                    state_temp.write_text(json.dumps(progress));state_temp.replace(progress_path)
                    size=prefix+sum(end-start+1 for start,end in chunks if start in progress['done'])
                    if time.monotonic()-last>15:
                        print(key,'downloaded',round(size/1e6),'/',round(total/1e6),'MB',flush=True)
                        last=time.monotonic()
        finally:
            os.close(fd)
        if not zipfile.is_zipfile(temporary):
            raise RuntimeError(f'{ref}: incomplete ZIP')
        temporary.rename(target)
        progress_path.unlink(missing_ok=True)
    digest = hashlib.file_digest(target.open('rb'), 'sha256').hexdigest()
    with zipfile.ZipFile(target) as archive:
        images = [i for i in archive.infolist() if not i.is_dir() and i.filename.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.bmp'))]
        from collections import Counter
        folders = Counter(str(Path(i.filename).parent) for i in images)
        manifest = dict(key=key, ref=ref, version=version, url='https://www.kaggle.com/datasets/' + ref,
                        title=metadata.get('title'), license=metadata.get('licenseName'),
                        archiveSha256=digest, archiveBytes=target.stat().st_size,
                        rawImageEntries=len(images), folders=dict(folders), retrievedAt='2026-10-22')
        (ROOT / (key + '-manifest.json')).write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
        print(json.dumps({k: v for k, v in manifest.items() if k != 'folders'}, ensure_ascii=False), flush=True)
    return key

if __name__ == '__main__':
    # A single owner prevents two resumed jobs appending to the same ZIP.
    import fcntl
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT/'download.lock').open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            for key in pool.map(download, SOURCES):
                print(key, 'ready', flush=True)
