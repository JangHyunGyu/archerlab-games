# Initial answer catalog review

Date: 2026-10-28

The server-only catalog is `server/twenty-questions/seed-catalog.mjs`. It exports `SEED_CATALOG` and a default export. It must be bundled only into the API Worker and excluded from the public static site. The frontend must receive an answer's identity and card only after the session ends.

## Coverage

There are 200 concepts: 40 animals, 20 plants, 35 foods, 65 objects, 20 natural objects or phenomena, 10 transport concepts, 6 musical instruments, and 4 places. Each record includes a stable semantic ID, Korean and English display names, explicit aliases, a category, and six English fact sentences.

Cards use ordinary distinguishing properties: organism or manufactured object, body parts, material, setting, purpose, movement, food, and physical form. Broad concepts use qualifiers where species or product variants differ. The model must return an unknown/unsupported decision when a question is not established by the card; a high model probability does not fill missing evidence.

This is a hand-authored seed catalog, not the output of a claimed live fact-checking service. Primary-source spot checks are listed below. These checks do not imply that every sentence in all 200 cards has been independently reviewed by an external fact checker. Live Korean/English decision-model evaluation remains a separate release check.

## Semantic review

- Replaced the pear entry with plum so Korean `배` does not identify both a fruit and a ship within the seed catalog.
- Used `chipmunk` for `다람쥐`, with explicit stripes and cheek pouches, rather than pairing that Korean label with an unrestricted squirrel concept.
- Used flamingo and parrot entries instead of conflating eagle/vulture or different owl names across languages.
- Kept rice plants (`벼`) separate from cooked rice (`쌀밥`).
- Kept blue whale aliases specific and omitted the broader `whale` label.
- Removed broad aliases such as `알로에` for the specific aloe vera concept and `수저` for spoon.
- Disambiguated homonyms in fact cards, including mouse, cloud, drum, snow, and physical keys.
- Avoided named people, brands, fictional characters, and changing product specifications.

## Korean wording scope

Read the installed `humanize-korean` skill and the local `im-not-ai` quick rules before authoring. Korean fields are noun labels and exact-name aliases rather than dialogue, narration, logs, or prose prompts. They are protected content under the skill's Do-NOT rule. Their review covered natural spelling, semantic identity, duplicate meanings, and accidental broad aliases. No stylistic rewrite was applied or claimed; the English fact cards were reviewed as factual content. Any future Korean fact-card prose or result narration needs the full humanize procedure and SCENARIO synchronization.

## Primary sources consulted

- [NOAA: penguins cannot fly](https://oceanservice.noaa.gov/facts/penguinsfly.html) supports the penguin card's flight distinction.
- [Monterey Bay Aquarium: cephalopods](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/cephalopods) supports eight arms, suckers, and the octopus's soft invertebrate body.
- [San Diego Zoo: parrots](https://animals.sandiegozoo.org/animals/parrot) supports the curved bill, grasping feet, varied diet, and exceptions to flight.
- [San Diego Zoo: flamingos](https://animals.sandiegozoo.org/animals/flamingo?qt-animals_page_content_tabs=1) supports long legs, filter feeding, adult pink plumage, flight, and eggs.
- [National Park Service: squirrels and chipmunks](https://home.nps.gov/romo/learn/nature/squirrel_chipmunk.htm) supports chipmunk face/back stripes and cheek pouches.
- [NASA: Moon facts](https://science.nasa.gov/moon/facts/) and [Moon questions](https://science.nasa.gov/moon/top-moon-questions/) support Earth's natural satellite and reflected sunlight.
- [NASA: Mars moons](https://science.nasa.gov/mars/moons/) supports the Mars card's two moons.

## Validation

`node --test twenty-questions/tests/catalog.test.mjs` checks total count, ID format and uniqueness, bilingual names, normalized cross-concept alias collisions, card size and sentence coverage, and selected specificity regressions. The test does not certify natural-language model accuracy or the correctness of every factual statement.
