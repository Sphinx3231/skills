# Spike findings: CLIP zero-shot (`Xenova/clip-vit-base-patch32`) as a fix for the out-of-vocabulary rejection problem

Related: [docs/outcomes/on-device-food-recognition-outcome.md](on-device-food-recognition-outcome.md) —
the prior spike that found `onnx-community/swin-finetuned-food101-ONNX` (closed-set,
101-way Food-101 classifier) landed 3/5 out-of-vocabulary probes as
confidently-wrong, including one indistinguishable score-wise from a true
positive (chicken breast → grilled_salmon at 99.1%/98.7%).

This is a throwaway research spike only. No product code was written, no
route changes, no client changes. `@huggingface/transformers` was installed
into `backend/` only long enough to run this spike, then uninstalled again.
`git status`/`git diff` in this worktree show no tracked-file changes
(aside from this new doc and a pre-existing untracked doc from the prior
spike that was not created by this task).

## Verdict up front

**Partial fix, with a new and arguably worse failure mode.** Supplying your
own candidate labels does trivially solve the specific complaint from the
prior spike — "the model has no slot for a banana/oatmeal/chicken
breast/pasta salad/protein shake" — because you can just add those labels
to the candidate set, and once added they score correctly (4 of 5 landed
correctly with margins ≥ 0.33; see table). That is not a deep result: it
is definitionally true that a zero-shot classifier will do better on a
class if you tell it the class exists. The one OOV case that stayed wrong
even after being added to the candidate set (grilled chicken breast →
"roasted vegetables", 56.6%) shows the underlying visual-similarity
confusion from the prior spike didn't fully go away either.

The real news is on **non-food rejection**, which this spike set out to
fix with explicit negative-anchor labels: **it got worse, not better.**
The prior closed-set model correctly showed low confidence on all 4/4
non-food photos (scores 0.08–0.18). Under CLIP zero-shot with 3 negative
anchor sentences competing against 36 food labels, only 2/4 non-food
photos were correctly rejected by a negative anchor (desk, brick wall).
**The dog photo scored 56.3% for "a photo of waffles" and the cat photo
scored 41.5% for "a photo of waffles"** — both higher than several
genuinely-correct in-vocabulary food predictions in this same run (e.g.
french fries: 34.6%, ice cream: 48.1%). A downstream `MIN_ACCEPT_SCORE`
threshold tuned to accept correct-but-modest food predictions would also
accept "dog photo confidently identified as waffles" — the exact
"threshold can't structurally separate this" failure the prior spike
flagged, now showing up on the non-food side instead of the OOV-food side.

**In-vocabulary accuracy** was good on this run: 11/12 (91.7%), better
than both the prior spike's 67% real-photo result and the original
Food-101 model card's curated 92.1% benchmark. Some caution warranted here
since the photos are not identical to the prior spike's set (Wikimedia
sources dry up / rate-limit; see Methodology) and 12 photos is a small
sample, but there's no sign CLIP zero-shot is worse at in-vocab accuracy.

## Methodology / substitutions

The prior spike's 21 source URLs were not recorded in its outcome doc
(only category names + labels), so this spike re-sourced from Wikimedia
Commons by category using the Commons API search endpoint, matching the
prior spike's exact category list (12 in-vocab dishes, 5 OOV real foods,
4 non-food). All 21 are freshly pulled Wikimedia Commons photos, same
categories, same sourcing method (not necessarily byte-identical files to
whatever the prior spike happened to grab). Wikimedia's API rate-limited
aggressively under back-to-back requests (`429`/robot-policy errors) —
worked around with a `User-Agent` header and ~5–10s spacing between
requests; several images had to be re-fetched after 429s or one dead
thumbnail URL (404, substituted with a different photo from the same
search, still "office desk" category).

| # | truth label | category | file (local) |
|---|---|---|---|
| 1 | pizza | in-vocab | White slice and supreme slice.jpg |
| 2 | sushi | in-vocab | Sushi platter.jpg |
| 3 | hamburger | in-vocab | NCI Visuals Food Hamburger.jpg |
| 4 | tiramisu | in-vocab | Dessert Tiramisu.jpg |
| 5 | ice cream | in-vocab | Ice Cream Dessert.JPG |
| 6 | donuts | in-vocab | Glazed-Donut.jpg |
| 7 | tacos | in-vocab | Tacos 2.jpg |
| 8 | fried rice | in-vocab | Koh Mak, Thailand, Fried rice with seafood.jpg |
| 9 | waffles | in-vocab | Belgian waffles & fruit - Brewhouse & Kitchen.jpg |
| 10 | steak | in-vocab | Perfectly grilled steak.jpg |
| 11 | french fries | in-vocab | French Fried Potatoes (Matchstick).jpg |
| 12 | ramen | in-vocab | Ramen Bowl 2.jpg |
| 13 | banana | OOV food | Cavendish banana from Maracaibo.jpg |
| 14 | oatmeal | OOV food | Oatmeal porridge 1-minute with additional ingredients.jpg |
| 15 | grilled chicken breast (w/ pesto & zucchini) | OOV food | Pesto Chicken and Grilled Zucchini.jpg |
| 16 | pasta salad | OOV food | Bowtie pasta salad bowl.jpg |
| 17 | protein shake | OOV food | Mixing a protein shake in a kitchen.jpg |
| 18 | desk | non-food | Top Workspace Office.jpg |
| 19 | brick wall | non-food | Red brick wall texture.JPG |
| 20 | dog | non-food | Dog, portrait, yard, outdoor chair (Fortepan 358).jpg |
| 21 | cat | non-food | Sleeping cat on her back.jpg |

## Candidate label set (39 labels: 36 food + 3 negative anchors)

Restaurant dishes (continuity with prior spike): pizza, sushi, hamburger,
tiramisu, tacos, ramen, taco, glazed donuts.

Everyday whole foods Food-101 excludes (includes all 5 OOV test items by
design, per the task): banana, oatmeal porridge, grilled chicken breast,
mixed green salad, pasta salad, protein shake, apple, white rice, scrambled
eggs, steak, french fries, fried rice, waffles, ice cream, grilled salmon,
roasted vegetables, sandwich, bowl of soup, yogurt with granola, smoothie,
avocado toast, burrito, chicken curry, plate of pasta, grilled shrimp,
fruit bowl, bagel, pancakes.

Negative anchors (full-sentence, per the task's guidance that CLIP
zero-shot favors sentence-like prompts):
- "a photo that does not contain any food"
- "an unclear photo where no specific food can be identified"
- "a photo of a random object or scene, not food"

All food labels used the `"a photo of X"` template; the 3 anchors were
written as complete sentences per the task brief.

## Full per-photo results

Score = top-1 CLIP zero-shot probability (softmax over all 39 candidates).
Margin = top-1 score minus top-2 score.

**In-vocabulary (12 photos):**

| photo | top-1 | score | top-2 | margin | correct? |
|---|---|---|---|---|---|
| pizza | pizza | 0.776 | (not food) | 0.642 | yes |
| sushi | sushi | 0.932 | (not food) | 0.910 | yes |
| hamburger | hamburger | 0.878 | sandwich | 0.832 | yes |
| tiramisu | tiramisu | 0.9999 | (not food) | 0.9999 | yes |
| ice cream | ice cream | 0.481 | tiramisu | 0.189 | yes (low confidence) |
| donuts | glazed donuts | 0.996 | bagel | 0.993 | yes |
| tacos | tacos | 0.746 | a taco | 0.601 | yes |
| fried rice | fried rice | 0.727 | white rice | 0.559 | yes |
| waffles | pancakes | 0.473 | fruit bowl | 0.216 | **no** — visually adjacent breakfast-food confusion, same failure family as prior spike's tiramisu→french_toast miss |
| steak | steak | 0.980 | roasted vegetables | 0.975 | yes |
| french fries | french fries | 0.346 | plate of pasta | 0.138 | yes (low confidence, low margin) |
| ramen | ramen | 0.881 | bowl of soup | 0.794 | yes |

In-vocab accuracy: **11/12 (91.7%)**.

**Out-of-vocabulary real foods (5 photos) — now included as candidate labels:**

| photo | top-1 | score | top-2 | margin | correct? |
|---|---|---|---|---|---|
| banana | banana | 0.966 | fruit bowl | 0.953 | yes |
| oatmeal | oatmeal porridge | 0.990 | yogurt with granola | 0.982 | yes |
| chicken breast (grilled, pesto+zucchini) | roasted vegetables | 0.566 | grilled salmon | 0.328 | **no** — true label ("grilled chicken breast") didn't even place top-2; same underlying confusion the prior spike hit (grilled protein ↔ other grilled-protein/veg labels), now at "medium" confidence instead of prior's "99% high confidence," which is an improvement in degree but not in kind |
| pasta salad | pasta salad | 0.737 | plate of pasta | 0.523 | yes |
| protein shake | protein shake | 0.995 | smoothie | 0.993 | yes |

OOV-food accuracy once the correct label is added to the candidate set:
**4/5 (80%)**. Important caveat: this does not test "reject unknown" — it
tests "does the label exist," which is trivially true once you add it. It
does **not** show CLIP zero-shot can detect foods you *didn't* think to
add a label for; that scenario was not tested here (would require a food
absent from all 36 food labels, scored against only the 3 negative
anchors — not attempted, out of scope for reusing the prior spike's exact
5 photos).

**Non-food (4 photos) — the actual reject-unknown test:**

| photo | top-1 | score | top-2 | margin | correctly rejected? |
|---|---|---|---|---|---|
| desk | "a photo of a random object or scene, not food" | 0.438 | apple | 0.134 | **yes** |
| brick wall | "a photo of a random object or scene, not food" | 0.232 | avocado toast | 0.061 | yes, but weak — margin over the nearest food label is only 6 points |
| dog | **"a photo of waffles"** | 0.564 | "does not contain any food" | 0.394 | **no — confidently misclassified as food.** 56.4% for waffles is higher than several genuinely-correct in-vocab predictions in this same run (french fries 34.6%, ice cream 48.1%) |
| cat | **"a photo of waffles"** | 0.415 | pancakes | 0.289 | **no** — again a breakfast-food label wins over any negative anchor, and the top-2 is also a food label, not a negative anchor |

Non-food correct-rejection rate: **2/4 (50%)** — worse than the prior
closed-set spike's 4/4, where all non-food images scored low confidence
across the board.

## What this means for the go/no-go question

The prior spike's blocking finding was: *no score/margin threshold can
structurally separate "confidently wrong" from "confidently right,"
because the classifier has no way to express "none of this."* Adding
negative-anchor labels was meant to give CLIP exactly that "none of this"
option. It partially works (2/4 non-food images correctly triggered a
negative anchor) but **it did not solve the structural problem — it moved
it.** Two of four non-food photos scored a specific, wrong food label
(waffles, twice) at confidence levels indistinguishable from genuinely
correct predictions elsewhere in the same candidate set and same run. A
`MIN_ACCEPT_SCORE`/margin threshold still cannot separate "dog confidently
called waffles" from "french fries correctly identified at 34.6%" — the
same non-fixable-by-threshold failure mode as before, just now hitting
non-food inputs instead of OOV-food inputs.

**This is not a clean go.** It also is not simply "back to square one" —
the specific complaint about foods missing from a fixed 101-class list is
addressed (you can add classes cheaply at inference time with no
retraining), which is a real and useful property CLIP has that the
closed-set model doesn't. But the deeper problem — an image the model
should say "I don't know" about instead confidently naming a real class —
persists and, in this small sample, got worse for the non-food case
specifically.

## New problems this approach introduces

1. **Negative-anchor wording sensitivity (untested but flagged as a real
   risk, not exercised in this spike):** only one phrasing set was tried
   for the 3 anchors. Given the dog/cat failures came down to "waffles"
   simply scoring higher than any of the 3 anchor sentences, it's very
   plausible that different anchor wording, more anchors, or anchors
   templated the same way as food labels (`"a photo of X"` vs. full
   sentences) shifts these particular results substantially. That means
   any real implementation would need its own prompt-engineering
   iteration loop, not a one-time tuning pass — a maintenance burden the
   closed-set model didn't have.
2. **Candidate-set completeness is now an ongoing content problem, not a
   one-time model choice.** Every food this system should recognize has to
   be explicitly enumerated in the candidate list ahead of time. The prior
   model's problem ("only 101 classes, no bananas") is replaced by "however
   many classes you remembered to list, plus 3 sentences you have to hope
   outscore every mistake." This is arguably a more maintainable failure
   mode (add a label vs. retrain a model) but it is not a solved problem —
   it's a shifted, ongoing one.
3. **Per-request cost scales with candidate count.** This run scored every
   image against all 39 labels every time (CLIP encodes the image once and
   compares against all text embeddings — the ~1.1–2.0s per-image latency
   observed here already reflects that 39-way comparison, not a per-label
   cost that grows linearly in wall-clock the way it might in a naive
   implementation). Latency did not blow up at 39 labels, but there is no
   data here on how it degrades at, say, 150+ labels needed for real menu
   coverage; not tested.
4. **The "roasted vegetables" / "grilled salmon" grilled-protein confusion
   from the prior spike is still present**, just at lower confidence
   (56.6% vs. the prior spike's 99.1%). Whether 56.6% is "low enough" to
   treat as a rejection depends entirely on where a future
   `MIN_ACCEPT_SCORE` gets set — and that's exactly the same knob the
   prior spike proved doesn't work, because a correct in-vocab prediction
   in this same run scored as low as 34.6% (french fries) and 47.3%
   (waffles, incorrectly).

## Latency, memory, model size

- **Model download**: `Xenova/clip-vit-base-patch32`'s default (fp32, no
  dtype/variant specified) `model.onnx` is **578 MB** — larger than the
  prior spike's Swin-Food101 model (337 MB). Total `.cache` footprint
  under `node_modules/@huggingface/transformers/.cache`: 580 MB. A
  quantized variant was not tried (out of scope; the spike's purpose was
  the accuracy/rejection question, not size optimization).
- **Model load time**: 36.5 s (comparable to the prior spike's 34.5 s for
  the Swin model). RSS rose from 55 MB → 724 MB during load.
- **Per-image inference latency across 21 photos**: min 1097 ms, max
  2030 ms, average 1365 ms — in the same ballpark as the prior spike's
  Swin classifier (1007–1956 ms, avg 1496 ms), despite scoring against 39
  text labels per image instead of a fixed 101-way softmax head. Not a
  latency regression.
- **Peak RSS during the run**: 881 MB (vs. prior spike's 1440 MB peak) —
  lower peak memory than the closed-set Swin model in this run, though not
  a like-for-like comparison (different candidate/label-embedding
  workload, single run each, not stress-tested).

## What was left unchanged

- `backend/package.json` and `backend/package-lock.json` were modified
  temporarily to install `@huggingface/transformers@4.2.0` (which pulled
  in `onnxruntime-node@1.24.3`, `sharp@0.34.5`, `@huggingface/jinja`, and
  required `npm approve-scripts` for `better-sqlite3`, `onnxruntime-node`,
  `protobufjs`, `sharp` — same install-script gate behavior as the prior
  spike), then reverted via
  `git checkout -- backend/package.json backend/package-lock.json`.
- The downloaded model weights and the heavy native deps
  (`onnxruntime-node`, `sharp`, `@huggingface/*`) were removed from
  `node_modules` after the spike (not git-tracked either way, but cleaned
  up to avoid leaving ~1 GB of unused install behind in this worktree).
- The throwaway spike script (`backend/_clip_spike_tmp.mjs`) was deleted
  after the run; it was never committed.
- `git status` in this worktree shows no tracked-file changes from this
  spike other than this new outcome doc. (A pre-existing untracked
  `docs/outcomes/on-device-food-recognition-outcome.md` and an untracked
  `../docs/` path were already present before this spike started — not
  created or modified by this task.)

## Recommendation

Do not proceed straight to an implementation plan around
`Xenova/clip-vit-base-patch32` + negative-anchor labels as a drop-in fix.
It trades one known failure mode (OOV foods misidentified as a wrong
Food-101 dish) for a related one (non-food images misidentified as a
specific food, at confidence levels that overlap with genuinely correct
predictions) — net effect on the core "can we trust a threshold" question
is roughly a wash on this small sample, possibly worse for the
specific non-food case. Before investing in an implementation plan, the
open questions that would need answering are: (1) does better anchor
prompt engineering (more anchors, different wording/templates, an
ensemble of anchor phrasings) meaningfully close the dog/cat gap — this
would need its own small spike, since anchor wording wasn't varied here;
(2) does a larger/different CLIP variant (openai/clip-vit-large,
laion's variants) behave differently on the same 21 photos; (3) is a
two-stage approach still worth considering (a cheap food/non-food binary
gate — which could itself be a CLIP zero-shot call with just 2 candidates,
"a photo of food" vs. "a photo that is not food" — ahead of the
fine-grained dish classifier), since a binary framing might be less prone
to a specific wrong food label winning by chance than a 36-vs-3 crowded
field is.
