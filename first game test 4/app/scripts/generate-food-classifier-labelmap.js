const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'assets', 'models', 'food_classifier_labelmap.csv');
const outPath = path.join(__dirname, '..', 'src', 'lib', 'food-classifier-labelmap.ts');

// Each row is `id,label`. The label field is almost always a bare,
// unquoted string, but a handful of rows in the source CSV wrap the label
// in double quotes (RFC4180-style) because the label itself contains a
// literal `"` character — e.g. `1126,"""Peanut butter"`. Naive
// `line.slice(line.indexOf(',') + 1)` comma-splitting leaves those stray
// quote characters in place instead of unescaping them, so parse the
// second field properly: if it's wrapped in a leading/trailing `"`, strip
// the wrapping quotes and unescape any internal `""` back to a single `"`.
function parseLabelField(line) {
  const idx = line.indexOf(',');
  const field = line.slice(idx + 1);
  if (field.length >= 2 && field.startsWith('"') && field.endsWith('"')) {
    return field.slice(1, -1).replace(/""/g, '"');
  }
  return field;
}

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function run() {
  const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const rows = lines.slice(1);
  const names = rows.map(parseLabelField);

  const body = names.map((n) => `  '${esc(n)}',`).join('\n');

  const header = `// Auto-generated from app/assets/models/food_classifier_labelmap.csv (ticket 016)
// via app/scripts/generate-food-classifier-labelmap.js — do not hand-edit. Index N here corresponds
// EXACTLY to output class index N of the bundled food_classifier.tflite
// model's softmax output (2,024 classes: index 0 is the model's own
// \`__background__\` non-food class, indices 1-2023 are real food/dish
// names) — this ordering is load-bearing. If the CSV ever changes, re-run
// the generator script rather than hand-editing either file out of sync
// with the other.
export const FOOD_CLASSIFIER_LABELS: readonly string[] = [
`;

  const footer = `] as const;

// The model's own dedicated non-food/no-detection class (id 0 in the source
// labelmap). A top-1 prediction landing here is treated the same way
// food-recognition-shared.ts's CLIP anchors are: never surfaced as a named
// food, always routed to the low-confidence/"couldn't identify" path.
export const BACKGROUND_CLASS_INDEX = 0;
`;

  fs.writeFileSync(outPath, header + body + '\n' + footer);
  console.log(`wrote ${names.length} labels to ${outPath}`);
}

if (require.main === module) {
  run();
}

module.exports = { parseLabelField };
