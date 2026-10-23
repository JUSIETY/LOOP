"""Resumable seven-source training. Run in a scratch directory with 27+ GB free.
Downloads and extracts one large archive at a time; raw ZIPs are deleted only
AFTER a verified catalog is persisted. Keep manifest hashes for provenance.
"""
import importlib.util,os,subprocess,time,json
from pathlib import Path
SCRIPTS=Path(__file__).resolve().parent
ROOT=Path(os.environ.get('LOOP_LARGE_TRAINING_DIR','/tmp/loop-expanded-training'))
os.environ['LOOP_LARGE_TRAINING_DIR']=str(ROOT)
SOURCES=[('household','alistairking/recyclable-and-household-waste-classification',1),('drinking','arkadiyhacks/drinking-waste-classification',2),('garbage','sumn2u/garbage-classification-v2',12),('warp','parohod/warp-waste-recycling-plant-dataset',3),('plastic','yadavmohit04/plastic-multiclass-dataset',1),('tricascade','salam035/waste-datasets',1),('trashbox','ghaniahmadzai/trashbox-v2-cleaned-modified',1)]
def module(name):
 s=importlib.util.spec_from_file_location(name,SCRIPTS/(name+'.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
prep=module('prepare-expanded');down=module('download-large')
for key,ref,version in SOURCES:
 if not (ROOT/f'catalog-{key}.json').exists():
  # Existing supervised jobs may own an in-progress download; do not duplicate it.
  if (ROOT/f'{key}.part').exists():
   print('Waiting for active download:',key,flush=True)
   while not (ROOT/f'{key}.zip').exists():time.sleep(10)
  else:down.download((key,ref,version))
  prep.catalog(key)
 (ROOT/f'{key}.zip').unlink(missing_ok=True)
 print('Catalog complete:',key,flush=True)
prep.prepare()
env=os.environ.copy();env.update(TF_NUM_INTRAOP_THREADS='4',TF_NUM_INTEROP_THREADS='1',OMP_NUM_THREADS='4',OPENBLAS_NUM_THREADS='4')
for key,_,_ in SOURCES:
 rows=json.loads((ROOT/f'catalog-{key}.json').read_text())['rows'];target=ROOT/f'{key}-embeddings.f32'
 subprocess.run(['node',str(SCRIPTS/'extract-expanded.cjs'),key],env=env,check=True)
subprocess.run(['python',str(SCRIPTS/'train-expanded.py')],env=env,check=True)
subprocess.run(['python',str(SCRIPTS/'compare-expanded.py')],env=env,check=True)
print('Expanded training and fixed-test comparison complete',flush=True)
