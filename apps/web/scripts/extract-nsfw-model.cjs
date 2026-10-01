/**
 * nsfwjs ships its models as large JS files. Bundling them breaks the Next.js
 * minifier and bloats the JS, so we write the MobileNetV2 model out as a plain
 * TensorFlow.js model (model.json + binary weights) under public/ instead.
 */
const fs = require('node:fs');
const path = require('node:path');

const out = path.join(__dirname, '..', 'public', 'models', 'nsfw');
const modelFile = path.join(out, 'model.json');
const src = path.join(fs.realpathSync(path.join(__dirname, '..', 'node_modules', 'nsfwjs')), 'dist', 'models', 'mobilenet_v2');

if (fs.existsSync(modelFile)) process.exit(0);

const unwrap = (m) => (m && m.default ? m.default : m);
const model = unwrap(require(path.join(src, 'model.min.js')));
const weights = unwrap(require(path.join(src, 'group1-shard1of1.min.js')));
if (!model?.modelTopology || typeof weights !== 'string') throw new Error('Unexpected nsfwjs model format');

fs.mkdirSync(out, { recursive: true });
const shard = model.weightsManifest[0].paths[0];
fs.writeFileSync(path.join(out, shard), Buffer.from(weights, 'base64'));
fs.writeFileSync(modelFile, JSON.stringify(model));
console.log(`[nsfw] wrote ${path.relative(process.cwd(), out)} (${(fs.statSync(path.join(out, shard)).size / 1e6).toFixed(1)} MB)`);
