# Seven-source expansion (2026-10-23)

This is an expansion of the existing three-source model, not a claim to have
found or used every dataset on Kaggle. `README-large.md` documents the three
original sources, their licenses and the frozen MobileNet V2 backbone.

Additional pinned Kaggle sources:

- Arkadiy Serezhkin, Drinking Waste Classification, v2, CC0; contains contributions
  from Gary Thung / Mindy Yang's MIT TrashNet. Only `rawimgs` is used; its YOLO
  mirror is excluded. https://www.kaggle.com/datasets/arkadiyhacks/drinking-waste-classification
- Garbage Dataset, sumn2u, v12, MIT. Only `original` is used; 256px / 384px copies
  are excluded. https://www.kaggle.com/datasets/sumn2u/garbage-classification-v2
  Dataset paper: https://journals-sol.sbc.org.br/index.php/jbcs/article/view/7774
- WaRP, v3, CC0. Classification crops only. Ambiguous `detergent-box` labels are excluded. Crop families from a parent frame stay
  together; supplied test crops remain held out. Yudin et al., *Hierarchical waste
  detection with weakly supervised segmentation in images from recycling plants*,
  Engineering Applications of Artificial Intelligence 128 (2024), 107542.
  https://www.kaggle.com/datasets/parohod/warp-waste-recycling-plant-dataset
- Plastic Waste Image Dataset, yadavmohit04, v1. Kaggle metadata states MIT, but
  the included data.yaml credits Roboflow engineer-bi8td/plastic-multiclass v4,
  CC BY 4.0. Retain that attribution and CC BY 4.0 terms. Images containing labels
  for more than one class are excluded from single-object classification.
  Roboflow `.rf.` variants share one split; supplied test/validation remain held out.
  https://www.kaggle.com/datasets/yadavmohit04/plastic-multiclass-dataset
  https://universe.roboflow.com/engineer-bi8td/plastic-multiclass/dataset/4

`prepare-expanded.py` removes exact files / normalized pixel duplicates and
incompatible labels globally. Compatible broad labels can inherit a more specific
annotation. Source-frame families and dHash distance <=4 components are indivisible.
Old v2 test hashes remain in test, and validation hashes cannot enter training.
Duplicate aliases retain their split restrictions. Splits may be imbalanced
because respecting large related-image groups takes precedence over target ratios.
The existing Trashbox food cap (6000) and exclusion of `not_food_waste` are retained.

## Reproduction

Use Python numpy, scipy, scikit-learn, Pillow; Node tfjs-node 4.22.0 and MobileNet
2.1.1. Set `LOOP_LARGE_TRAINING_DIR` and `LOOP_TF_RUNTIME` to absolute scratch paths.
Run `python scripts/training/run-expanded.py` from the checkout. The runner deletes
finished source ZIPs only after their catalog has been persisted, to fit the disk.
Do not run two owners for the same download/extraction output. If resuming an
interrupted download, first resume `download-large.py`'s `download((key,ref,version))`
for that source; the orchestrator waits when it sees an active `.part` file.

The runner fits new fine/coarse linear heads; the backbone is unchanged. Validation
alone selects C, calibration and abstention thresholds. `compare-expanded.py`
compares both versions on the same unchanged, available v2 test image hashes and
labels. Do not repeatedly tune against this comparison. Publish only after reviewing
it and running `node scripts/training/verify-expanded.mjs` for coefficient parity,
unique hashes, grouping and reserved-test assertions. This is an internal dataset
evaluation; it does not establish Korean field accuracy or correct local disposal.

Raw photos, credentials, feature caches and user uploads must not be committed or
served. The reproducible scripts, source manifests, metrics and trained coefficients
are the durable artifacts. Do not infer verified beverage PET, content, contamination
or local collection eligibility from these visual labels.
