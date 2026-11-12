# Browser demo assets and licensing

This static browser demo is an optional addition. It does not replace or alter the original Python + OpenCV + DeepFace implementation in the parent project.

## Face detection and expression model

- Runtime: [face-api.js 0.22.2](https://github.com/justadudewhohacks/face-api.js), distributed locally as `vendor/face-api.min.js`.
- Model manifests and weight shards: the Tiny Face Detector and Face Expression Recognition model files from the upstream [`weights/` directory](https://github.com/justadudewhohacks/face-api.js/tree/master/weights), stored under `models/`.
- The upstream repository declares the MIT License. Its license text is included as `vendor/FACE-API-LICENSE.txt`.
- The face-api.js browser bundle includes TensorFlow.js Core 1.7.0 (Apache-2.0) and tslib 1.11.1 (Apache-2.0); their license texts are included in `vendor/`.
- TensorFlow.js Core depends on seedrandom 2.4.3 (MIT); its license text is included as `vendor/SEEDRANDOM-LICENSE.txt`.
- The upstream project does not provide a separate model-card license in the weights directory. These files are distributed here with attribution to that repository; this notice is not a legal determination about model-training data rights.

The original project license in the parent directory is non-commercial. It remains applicable to the project and has not been replaced by the face-api.js MIT license. This demo is intended for non-commercial use under the original project terms. Review both licenses before redistribution or any other use.

## Privacy and interpretation

Inference runs in the browser using locally served JavaScript and model files. Camera frames are not sent to a server, uploaded, or stored. Session statistics exist only in page memory and reset on reload. Camera access requires user permission and a secure context (HTTPS or localhost).

Expression categories and confidence values are model predictions from visible facial patterns. They are not definitive measurements of emotion, intent, personality, or mental state.
