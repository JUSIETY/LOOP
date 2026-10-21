# Reproduce Kaggle material classifier

Data: https://www.kaggle.com/datasets/asdasdasasdas/garbage-classification, version 2.
Original TrashNet: Gary Thung and Mindy Yang, https://github.com/garythung/trashnet.
Kaggle identifies the license as “Data files © Original Authors”; the original
repository supplies MIT license. Preserve public/models/kaggle-waste/LICENSE-TrashNet.txt.
Original photos are not served by this app. Dataset hash and split membership
are recorded alongside the trained coefficients in public/models/kaggle-waste.

Set LOOP_TRAINING_DIR to an absolute temporary directory. Install numpy, Pillow,
scikit-learn in your Python environment and run:

    python scripts/training/download.py
    python scripts/training/prepare.py
    npm install --prefix "$LOOP_TRAINING_DIR/runtime" @tensorflow/tfjs-node@4.22.0 @tensorflow-models/mobilenet@2.1.1 sharp@0.35.4
    TF_NUM_INTRAOP_THREADS=2 TF_NUM_INTEROP_THREADS=2 OMP_NUM_THREADS=2 node scripts/training/extract.cjs
    OPENBLAS_NUM_THREADS=2 OMP_NUM_THREADS=2 python scripts/training/train.py

The frozen embedding extractor matches lib/vision.ts (inputRange [0,1],
MobileNet infer(image,true), L2 normalization). Only the six-class linear head
is newly trained. Exact duplicates are removed; dHash groups stay in one split.
Hyperparameter C and acceptance threshold use validation only. Final test images
are never used for fitting or choosing thresholds. No Korean disposal labels
are inferred from these six material labels. Source dataset is mostly single
objects on white backgrounds; field/domain accuracy and OOD detection are not
established. Reproducing can vary slightly with library versions/CPU kernels.
