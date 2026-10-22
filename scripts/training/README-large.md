# Reproduce the three-source classifier

The Site uses a frozen ImageNet MobileNet V2 alpha=1.0 backbone, 1,280-dimensional
L2-normalized features, and newly fitted class-balanced multinomial logistic
regression heads for object categories and materials. This is transfer learning
of classification heads, not end-to-end backbone fine-tuning.

## Pinned sources and attribution

1. **Trashbox V2 Cleaned Waste Dataset**, Ghaniahmadzai, version 1,
   https://www.kaggle.com/datasets/ghaniahmadzai/trashbox-v2-cleaned-modified
   — CC BY 4.0. The download contains 160,664 supported image entries. We exclude
   73,498 nonspecific `not_food_waste` entries, cap the food class at 6,000, and
   reject unreadable/invalid images. Raw photos are not served by this Site.
2. **TriCascade WasteImage Dataset**, Salam035 et al., version 1,
   https://www.kaggle.com/datasets/salam035/waste-datasets — Kaggle metadata MIT.
   Cite Nahiduzzaman et al., *An Automated Waste Classification System Using
   Deep Learning Techniques: Toward Efficient Waste Recycling and Environmental
   Sustainability*, Knowledge-Based Systems (2025),
   https://doi.org/10.1016/j.knosys.2025.113028.
   The ZIP repeats 35,264 images over three hierarchy stages. Only
   `Dataset_ThirdStage/Dataset` is used; the other 70,528 entries are excluded.
   TriCascade itself combines TrashBox, waste_picture, Garbage Classification,
   and a dead-animal dataset. Overlap is deduplicated globally.
3. **Recyclable and Household Waste Classification**, Alistair King, version 1,
   https://www.kaggle.com/datasets/alistairking/recyclable-and-household-waste-classification
   — 15,000 supported images. Kaggle metadata says MIT; its description also
   specifies educational, research and noncommercial use. This application is
   an educational school-booth project. Reassess those terms before a commercial
   use. `default` and `real_world` are source folder names, not verified guarantees
   that every image is a real photograph or represents a Korean collection site.

These are three large inspected, usable public sources, not a proven exhaustive
ranking of the three largest datasets on all of Kaggle. PhenomSG's card claimed
30,000+ images, but inspecting its ZIP found approximately 2,900; it was rejected
from this three-source training run.

## Run

Use a temporary data directory with at least 30 GB available; original ZIPs alone
occupy approximately 22.5 GB. Python needs numpy, Pillow, scipy and scikit-learn.
The Node runtime needs @tensorflow/tfjs-node 4.22.0 and
@tensorflow-models/mobilenet 2.1.1. The extractor accepts `LOOP_TF_RUNTIME` as the
absolute path to that runtime's node_modules.

```bash
export LOOP_LARGE_TRAINING_DIR=/tmp/loop-large-training
export LOOP_TF_RUNTIME=/absolute/path/to/training-runtime/node_modules
python scripts/training/download-large.py
python scripts/training/prepare-large.py
node scripts/training/extract-large.cjs household
node scripts/training/extract-large.cjs tricascade
node scripts/training/extract-large.cjs trashbox
OPENBLAS_NUM_THREADS=4 OMP_NUM_THREADS=4 python scripts/training/train-large.py
```

Use one downloader at a time. It takes a file lock and checkpoints verified HTTP
range downloads. Run preparation only on finished archives. Original ZIP hashes,
counts, exclusions, source membership, split groups, training settings and held-out
metrics are recorded with the published coefficients. Do not commit raw images,
embeddings, user photos, credentials or temporary download state.

Exact source-file and normalized-pixel duplicates are removed. Conflicting labels
are removed, while compatible broad labels may retain a more specific annotation.
64-bit dHash neighbors at Hamming distance <=4 stay in one split. Regularization,
temperature calibration and abstention thresholds use validation only. Final test
data is not used for fitting. The previous model's exact known held-out hashes are
reserved where available. Related-image leakage cannot be completely excluded
without object identity annotations.

The app executes the same full-frame resize, model, normalization and exported
coefficients used for evaluation. A batch-versus-standard-backbone comparison and
Python-to-TypeScript coefficient parity check verify the serving implementation.
`verify-large.mjs` also checks split disjointness and (when supplied locally) the
five user screenshot image crops. Those crops are never training inputs or public
assets. They are a small regression check, not a field-accuracy estimate.

Class names describe objects/materials, not legal disposal destinations. Generic
glass images are not relabeled as beverage bottles. A plastic bottle does not
establish transparent beverage PET, a carton does not establish sterilized milk
versus aseptic packaging, and no image score establishes contamination or local
collection acceptance. Unsupported booth items and uncertain results request
appropriate manual confirmation.
