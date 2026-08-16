// Direct port of backend/src/lib/food-candidate-labels.js's CANDIDATE_LABELS
// (ticket 011, Step 1). Source of truth is that backend file — it is
// hand-authored, not generated, so if the two ever need to change, update
// backend/src/lib/food-candidate-labels.js first and port the change here,
// or vice versa; either file changing without the other is drift.
//
// `key` is what everything downstream (nutrition lookup, `foodName`
// fallback, tests) uses. The model only ever sees `prompt` — a raw model
// output like "a photo of waffles" must NEVER reach `lookupNutritionByLabel`
// or the confirm screen's `foodName` field (see food-recognition-shared.ts,
// which matches a result back to its `key` by `prompt`, once, in one place).
//
// This exact 36-food + 3-anchor set is the same one ticket 010's backend
// ships (itself carried over from the CLIP spike,
// docs/outcomes/clip-zero-shot-spike-findings.md) — same labels, same
// "a photo of X" template for foods, same full-sentence anchors. Reusing the
// same candidate set (rather than a fresh list) means ticket 010's cited
// accuracy numbers describe the actual candidate set shipping here too, not
// a superficially similar one.
export type CandidateLabel = {
  key: string;
  prompt: string;
  isAnchor: boolean;
};

export const CANDIDATE_LABELS: CandidateLabel[] = [
  // Restaurant dishes (continuity with the earlier Food-101 attempt).
  { key: 'pizza', prompt: 'a photo of pizza', isAnchor: false },
  { key: 'sushi', prompt: 'a photo of sushi', isAnchor: false },
  { key: 'hamburger', prompt: 'a photo of a hamburger', isAnchor: false },
  { key: 'tiramisu', prompt: 'a photo of tiramisu', isAnchor: false },
  { key: 'tacos', prompt: 'a photo of tacos', isAnchor: false },
  { key: 'taco', prompt: 'a photo of a taco', isAnchor: false },
  { key: 'ramen', prompt: 'a photo of ramen', isAnchor: false },
  { key: 'glazed_donuts', prompt: 'a photo of glazed donuts', isAnchor: false },

  // Everyday whole foods Food-101 structurally excludes.
  { key: 'banana', prompt: 'a photo of a banana', isAnchor: false },
  { key: 'oatmeal_porridge', prompt: 'a photo of oatmeal porridge', isAnchor: false },
  { key: 'grilled_chicken_breast', prompt: 'a photo of grilled chicken breast', isAnchor: false },
  { key: 'mixed_green_salad', prompt: 'a photo of a mixed green salad', isAnchor: false },
  { key: 'pasta_salad', prompt: 'a photo of pasta salad', isAnchor: false },
  { key: 'protein_shake', prompt: 'a photo of a protein shake', isAnchor: false },
  { key: 'apple', prompt: 'a photo of an apple', isAnchor: false },
  { key: 'white_rice', prompt: 'a photo of white rice', isAnchor: false },
  { key: 'scrambled_eggs', prompt: 'a photo of scrambled eggs', isAnchor: false },
  { key: 'steak', prompt: 'a photo of steak', isAnchor: false },
  { key: 'french_fries', prompt: 'a photo of french fries', isAnchor: false },
  { key: 'fried_rice', prompt: 'a photo of fried rice', isAnchor: false },
  { key: 'waffles', prompt: 'a photo of waffles', isAnchor: false },
  { key: 'ice_cream', prompt: 'a photo of ice cream', isAnchor: false },
  { key: 'grilled_salmon', prompt: 'a photo of grilled salmon', isAnchor: false },
  { key: 'roasted_vegetables', prompt: 'a photo of roasted vegetables', isAnchor: false },
  { key: 'sandwich', prompt: 'a photo of a sandwich', isAnchor: false },
  { key: 'bowl_of_soup', prompt: 'a photo of a bowl of soup', isAnchor: false },
  { key: 'yogurt_with_granola', prompt: 'a photo of yogurt with granola', isAnchor: false },
  { key: 'smoothie', prompt: 'a photo of a smoothie', isAnchor: false },
  { key: 'avocado_toast', prompt: 'a photo of avocado toast', isAnchor: false },
  { key: 'burrito', prompt: 'a photo of a burrito', isAnchor: false },
  { key: 'chicken_curry', prompt: 'a photo of chicken curry', isAnchor: false },
  { key: 'plate_of_pasta', prompt: 'a photo of a plate of pasta', isAnchor: false },
  { key: 'grilled_shrimp', prompt: 'a photo of grilled shrimp', isAnchor: false },
  { key: 'fruit_bowl', prompt: 'a photo of a fruit bowl', isAnchor: false },
  { key: 'bagel', prompt: 'a photo of a bagel', isAnchor: false },
  { key: 'pancakes', prompt: 'a photo of pancakes', isAnchor: false },

  // Negative/reject anchors — never get a nutrition-reference row and are
  // never passed to lookupNutritionByLabel (filtered before lookup).
  { key: 'not_food', prompt: 'a photo that does not contain any food', isAnchor: true },
  {
    key: 'unclear_photo',
    prompt: 'an unclear photo where no specific food can be identified',
    isAnchor: true,
  },
  {
    key: 'random_object',
    prompt: 'a photo of a random object or scene, not food',
    isAnchor: true,
  },
];
