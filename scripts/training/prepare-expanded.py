"""Create globally deduplicated, grouped train/validation/test image catalogs."""
import concurrent.futures
from collections import Counter, defaultdict
import hashlib
import io
import json
import os
from pathlib import Path
import random
import warnings
import zipfile

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(os.environ.get('LOOP_LARGE_TRAINING_DIR', '/tmp/loop-expanded-training'))
PROJECT = Path(__file__).resolve().parents[2]
SEED = 20261022
SOURCES = ['tricascade','household','trashbox','drinking','garbage','warp','plastic']

# Labels describe photographed objects, never their legal disposal destination.
TRI = {
 'A_Foods':'food', 'B_Animal Dead Body':'animal-remains', 'C_Cardboard':'cardboard',
 'D_Newspaper':'paper', 'E_Paper Cups':'paper-cup', 'F_Papers':'paper',
 'G_Brown Glass':'glass-object', 'H_Porcelin':'ceramic', 'I_Green Glass':'glass-object',
 'J_White Glass':'glass-object', 'K_Beverage Cans':'drink-can', 'L_Construction Scrap':'construction',
 'M_Metal Containers':'metal-container', 'N_Plastic Bag':'plastic-bag', 'O_Plastic Bottle':'plastic-bottle',
 'Q_Plastic Containers':'plastic-container', 'R_Plastic Cups':'plastic-cup', 'S_Tetra Pak':'carton',
 'T_Clothes':'textile', 'U_Shoes':'shoe', 'V_Gloves':'glove', 'W_Masks':'mask', 'X_Bandai':'bandage',
 'Y_Medicine and Medicine Strip':'medicine', 'Z_A_A_Syringe':'syringe', 'Z_A_Diaper':'diaper',
 'Z_B_Electrical Cables':'cable', 'Z_C_Electronic Chips':'circuit', 'Z_D_Laptops':'laptop',
 'Z_E_Small Appliances':'small-appliance', 'Z_F_Smartphones':'phone', 'Z_G_Battery':'battery',
 'Z_H_Thermometer':'thermometer', 'Z_I_Cigarette Butt':'cigarette', 'Z_J_Pesticidebottle':'pesticide',
 'Z_K_Spray cans':'aerosol',
}
HOUSE = {
 'aerosol_cans':'aerosol', 'aluminum_food_cans':'food-can', 'aluminum_soda_cans':'drink-can',
 'cardboard_boxes':'cardboard', 'cardboard_packaging':'cardboard', 'clothing':'textile',
 'coffee_grounds':'food', 'disposable_plastic_cutlery':'plastic-small', 'eggshells':'food', 'food_waste':'food',
 'glass_beverage_bottles':'glass-bottle', 'glass_cosmetic_containers':'glass-container', 'glass_food_jars':'glass-container',
 'magazines':'paper', 'newspaper':'paper', 'office_paper':'paper', 'paper_cups':'paper-cup',
 'plastic_cup_lids':'plastic-small', 'plastic_detergent_bottles':'detergent-bottle',
 'plastic_food_containers':'plastic-container', 'plastic_shopping_bags':'plastic-bag',
 'plastic_soda_bottles':'plastic-bottle', 'plastic_straws':'plastic-small', 'plastic_trash_bags':'plastic-bag',
 'plastic_water_bottles':'plastic-bottle', 'shoes':'shoe', 'steel_food_cans':'food-can',
 'styrofoam_cups':'foam', 'styrofoam_food_containers':'foam', 'tea_bags':'food',
}
NAMES = {
 'food':'음식물', 'animal-remains':'동물 사체', 'cardboard':'골판지 상자', 'paper':'종이',
 'paper-cup':'종이컵', 'glass-bottle':'음료 유리병', 'glass-container':'유리 용기', 'glass-object':'유리 물품', 'ceramic':'도자기',
 'drink-can':'음료 캔', 'food-can':'식품 캔', 'construction':'건축 자재', 'metal-container':'금속 용기',
 'plastic-bag':'비닐·플라스틱 봉지', 'plastic-bottle':'플라스틱병', 'plastic-container':'플라스틱 용기',
 'plastic-cup':'플라스틱 컵', 'plastic-small':'작은 플라스틱 물품', 'detergent-bottle':'세제 플라스틱병',
 'carton':'종이팩·멸균팩', 'textile':'의류', 'shoe':'신발', 'glove':'장갑', 'mask':'마스크',
 'bandage':'밴드·붕대', 'medicine':'의약품·약 포장', 'syringe':'주사기', 'diaper':'기저귀',
 'cable':'전선', 'circuit':'전자 회로', 'laptop':'노트북', 'small-appliance':'소형 가전', 'phone':'휴대전화',
 'battery':'건전지·배터리', 'thermometer':'체온계', 'cigarette':'담배꽁초', 'pesticide':'농약 용기',
 'aerosol':'스프레이 캔', 'foam':'스티로폼',
}
COARSE = {}
for group, values in {
 'food':['food'], 'cardboard':['cardboard'], 'paper':['paper','paper-cup'],
 'glass':['glass-bottle','glass-container','glass-object'], 'ceramic':['ceramic'],
 'metal':['drink-can','food-can','metal-container','aerosol'],
 'plastic':['plastic-bottle','plastic-container','plastic-cup','plastic-small','detergent-bottle'],
 'vinyl':['plastic-bag'], 'carton':['carton'], 'textile':['textile'], 'shoe':['shoe'],
 'medical':['glove','mask','bandage','medicine','syringe','diaper','thermometer'],
 'electronics':['cable','circuit','laptop','small-appliance','phone'], 'battery':['battery'],
 'hazardous':['pesticide'], 'other':['cigarette','animal-remains','construction'], 'foam':['foam'],
}.items():
 for label in values: COARSE[label] = group
TRASH = {'Trash':'other','Vegetation':'vegetation','cardboard':'cardboard','clothes':'textile',
 'e-waste':'electronics','food_waste':'food','glass':'glass','medical':'medical',
 'metal':'metal','paper':'paper','plastic':'plastic','shoes':'shoe'}

def specifications(key, archive):
    candidates = []
    excluded = Counter()
    for entry in archive.infolist():
        if entry.is_dir() or not entry.filename.lower().endswith(('.jpg','.jpeg','.png','.webp','.bmp')):
            continue
        parts = entry.filename.split('/')
        fine = None
        if key == 'tricascade':
            if not entry.filename.startswith('Dataset_ThirdStage/Dataset/'):
                excluded['duplicate_hierarchy_stages'] += 1
                continue
            fine = TRI.get(parts[-2])
            if fine is None: raise ValueError('Unmapped TriCascade label: ' + parts[-2])
            coarse = COARSE[fine]
        elif key == 'household':
            fine = HOUSE[parts[-3]]
            coarse = COARSE[fine]
        elif key == 'drinking':
            if '/rawimgs/' not in entry.filename:
                excluded['duplicate_yolo_copy'] += 1; continue
            fine = {'AluCan':'drink-can','Glass':'glass-bottle','PET':'plastic-bottle','HDPEM':'plastic-bottle'}[parts[-2]]
            coarse = COARSE[fine]
        elif key == 'garbage':
            if not entry.filename.startswith('original/'):
                excluded['resized_duplicate_copy'] += 1; continue
            label=parts[-2]
            coarse={'battery':'battery','biological':'food','cardboard':'cardboard','clothes':'textile','glass':'glass','metal':'metal','paper':'paper','plastic':'plastic','shoes':'shoe','trash':'other'}[label]
            fine={'cardboard':'cardboard','clothes':'textile','paper':'paper','shoes':'shoe','battery':'battery'}.get(label)
        elif key == 'warp':
            if not entry.filename.startswith('Warp-C/'):
                excluded['non_classification_copy'] += 1; continue
            label=parts[-2]
            fine = ('plastic-bottle' if label.startswith('bottle-') else 'glass-bottle' if label.startswith('glass-') else 'carton' if label in ['juice-cardboard','milk-cardboard'] else 'drink-can' if label=='cans' else 'plastic-container' if label=='canister' else 'detergent-bottle' if label.startswith('detergent-') else None)
            if fine is None: raise ValueError('Unknown WaRP class '+label)
            coarse=COARSE[fine]
        elif key == 'plastic':
            label_path=str(Path(entry.filename.replace('/images/','/labels/')).with_suffix('.txt'))
            if label_path not in archive.namelist():
                excluded['missing_annotations']+=1; continue
            annotations=[line.split() for line in archive.read(label_path).decode().splitlines() if line.strip()]
            classes={int(a[0]) for a in annotations}
            if len(classes)!=1 or any(len(a)!=5 for a in annotations):
                excluded['mixed_or_invalid_annotations']+=1; continue
            fine={0:'plastic-bag',1:'plastic-bottle',2:'plastic-cup'}[next(iter(classes))]
            coarse=COARSE[fine]
        else:
            label = parts[-2]
            if label == 'not_food_waste':
                excluded['non_specific_negative_label'] += 1
                continue
            coarse = TRASH[label]
            fine = {'cardboard':'cardboard','clothes':'textile','shoes':'shoe','food_waste':'food'}.get(label)
        candidates.append((entry.filename, fine, coarse))
    # Food dominates this aggregate. A deterministic cap avoids spending almost
    # all feature-extraction time on one class; all other usable classes remain.
    if key == 'trashbox':
        foods = [x for x in candidates if x[2] == 'food']
        random.Random(SEED).shuffle(foods)
        chosen = set(x[0] for x in foods[:6000])
        excluded['food_class_balance_cap'] += max(0, len(foods)-6000)
        candidates = [x for x in candidates if x[2] != 'food' or x[0] in chosen]
    return candidates, excluded

def catalog(key):
    target = ROOT / ('catalog-' + key + '.json')
    if target.exists():
        cached=json.loads(target.read_text())
        for row in cached['rows']:
            if key=='tricascade':row['fine']=TRI[row['original'].split('/')[-2]]
            elif key=='household':row['fine']=HOUSE[row['original'].split('/')[-3]]
            if row['fine']:row['coarse']=COARSE[row['fine']]
        return cached
    while not (ROOT / (key + '.zip')).exists():
        import time
        time.sleep(5)
    archive = zipfile.ZipFile(ROOT / (key + '.zip'))
    candidates, excluded = specifications(key, archive)
    out = ROOT / 'images'; out.mkdir(exist_ok=True)
    def decode(spec):
        name, fine, coarse = spec
        try:
            raw = archive.read(name)
            digest = hashlib.sha256(raw).hexdigest()
            with warnings.catch_warnings():
                warnings.simplefilter('error', Image.DecompressionBombWarning)
                im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
                if min(im.size)<24 or im.width*im.height>50_000_000:
                    return None, 'invalid_dimensions'
                im.thumbnail((384,384), Image.Resampling.LANCZOS)
                a = np.asarray(im.convert('L').resize((9,8), Image.Resampling.BILINEAR))
                dhash = 0
                for value in (a[:,1:] > a[:,:-1]).flat: dhash = (dhash<<1)|int(value)
                pixel = hashlib.sha256(im.resize((64,64), Image.Resampling.BILINEAR).tobytes()).hexdigest()
                path = out / (digest+'.jpg')
                if not path.exists(): im.save(path, 'JPEG', quality=95)
            return dict(path=str(path),sha256=digest,pixelHash=pixel,dhash=f'{dhash:016x}',
                        fine=fine,coarse=coarse,source=key,original=name), None
        except Exception as error:
            return None, 'unreadable_image'
    rows = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for i, (row, error) in enumerate(pool.map(decode,candidates)):
            if row: rows.append(row)
            else: excluded[error] += 1
            if i%2000 == 0: print(key, 'prepared', i+1, '/', len(candidates), flush=True)
    result = dict(rows=rows, excluded=dict(excluded), selectedBeforeDedup=len(rows))
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(',',':')))
    print(key, 'catalog ready', len(rows), dict(excluded), flush=True)
    return result

def prepare():
    catalogs = {}
    # Household is small and normally finishes downloading first.
    for key in SOURCES: catalogs[key] = catalog(key)
    unique = {}; pixels = {}; duplicates = 0; conflicts = set()
    for key in SOURCES:
        for row in catalogs[key]['rows']:
            stem=Path(row['original']).stem
            row['parentKeys']=[key+':'+(stem.rsplit('_',1)[0] if key=='warp' else stem.split('.rf.')[0])] if key in ['warp','plastic'] else []
            row['allHashes']=[row['sha256']]
            row['sourceTest']=(key=='warp' and '/test_crops/' in row['original']) or (key=='plastic' and row['original'].startswith('test/'))
            row['sourceVal']=key=='plastic' and row['original'].startswith('valid/')
            oldkey = row['sha256'] if row['sha256'] in unique else pixels.get(row['pixelHash'])
            if oldkey:
                old = unique[oldkey]
                related = any({old['coarse'],row['coarse']} <= family for family in [
                    {'paper','cardboard','carton'}, {'plastic','vinyl','foam'}, {'battery','electronics'}])
                if old['coarse'] != row['coarse'] and not (related and (bool(old['fine']) != bool(row['fine']))):
                    conflicts.add(oldkey)
                elif old['fine'] and row['fine'] and old['fine'] != row['fine']:
                    conflicts.add(oldkey)
                elif not old['fine'] and row['fine']:
                    old['fine'] = row['fine']
                    old['coarse'] = row['coarse']
                old['sources'] = sorted(set(old['sources']+[key]))
                for field in ['parentKeys','allHashes']:old[field]=sorted(set(old[field]+row[field]))
                old['sourceTest']=old['sourceTest'] or row['sourceTest']
                old['sourceVal']=old['sourceVal'] or row['sourceVal']
                duplicates += 1
            else:
                row['sources'] = [key]
                unique[row['sha256']] = row
                pixels[row['pixelHash']] = row['sha256']
    rows = [row for key,row in unique.items() if key not in conflicts]
    parents = list(range(len(rows)))
    def find(i):
        while parents[i]!=i:
            parents[i]=parents[parents[i]]; i=parents[i]
        return i
    source_groups={}
    for i,row in enumerate(rows):
        for group_key in row['parentKeys']:
            if group_key in source_groups: parents[find(i)]=find(source_groups[group_key])
            else: source_groups[group_key]=i
    buckets = [defaultdict(list) for _ in range(5)]
    hash_representatives = {}
    for i,row in enumerate(rows):
        h=int(row['dhash'],16)
        if h in hash_representatives:
            parents[find(i)]=find(hash_representatives[h]); continue
        hash_representatives[h]=i
        neighbors = set()
        for b in range(5): neighbors.update(buckets[b][(h>>(b*13))&8191])
        for j in neighbors:
            if (h^int(rows[j]['dhash'],16)).bit_count()<=4: parents[find(i)]=find(j)
        for b in range(5): buckets[b][(h>>(b*13))&8191].append(i)
        if i%10000==0: print('Grouped near duplicates',i,'/',len(rows),flush=True)
    groups=defaultdict(list)
    for i,row in enumerate(rows): groups[find(i)].append(row)
    previous=json.loads((PROJECT/'public/models/kaggle-waste-v2/split-manifest.json').read_text())
    oldtest={r['sha256'] for r in previous if r['split']=='test'}
    oldval={r['sha256'] for r in previous if r['split']=='validation'}
    strata=defaultdict(list)
    for group in groups.values():
        label=next((r['fine'] for r in group if r['fine']),group[0]['coarse'])
        strata[label].append(group)
    rng=random.Random(SEED)
    for label,gs in sorted(strata.items()):
        rng.shuffle(gs)
        for i,group in enumerate(gs):
            shas={h for r in group for h in r['allHashes']}
            source_test=any(r['sourceTest'] for r in group)
            source_val=any(r['sourceVal'] for r in group)
            split='test' if shas&oldtest or source_test else 'validation' if shas&oldval or source_val else 'train' if i<len(gs)*.70 else 'validation' if i<len(gs)*.85 else 'test'
            gid=hashlib.sha256('|'.join(sorted(shas)).encode()).hexdigest()[:20]
            for row in group:row['split']=split;row['group']=gid
    rows.sort(key=lambda r:r['sha256'])
    (ROOT/'large-split.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
    summary=dict(seed=SEED,uniqueImages=len(rows),duplicatesRemoved=duplicates,labelConflictsRemoved=len(conflicts),
                 groups=len(groups),splitCounts=dict(Counter(r['split'] for r in rows)),
                 fineClasses=dict(Counter(r['fine'] for r in rows if r['fine'])),
                 coarseClasses=dict(Counter(r['coarse'] for r in rows)),
                 sources={k:{name:value for name,value in v.items() if name!='rows'} for k,v in catalogs.items()},
                 names=NAMES,coarseMapping=COARSE)
    (ROOT/'preparation.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in summary.items() if k not in ['names','coarseMapping']},ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__': prepare()
