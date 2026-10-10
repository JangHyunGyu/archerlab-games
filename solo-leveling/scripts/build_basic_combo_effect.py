"""Install the authored six-stage dagger cut with a +X forward axis."""
import re
import install_higgsfield_combat_20261010 as extractor

ROOT = extractor.vfx.ROOT
NAME = 'shadow_dagger_cut'

def main():
    extractor.SOURCE = ROOT / 'assets/effects/source/basic_combo_20261010'
    # The reference-matched revision already curves toward +X. Preserve its
    # asymmetric filament sweep and authored growth/dissipation unchanged.
    frames = extractor.extract(NAME)
    target = ROOT / 'assets/effects/basic_attacks'
    for i, frame in enumerate(frames):
        extractor.vfx.save_pair(frame, target / 'frames' / f'{NAME}_{i}.png')
    peak = frames[2]
    extractor.vfx.save_pair(peak, target / f'{NAME}.png')
    bounds = peak.getchannel('A').point(lambda a:255 if a>=12 else 0).getbbox()
    left, top, right, bottom = bounds
    line = f"    'basic_attack_{NAME}': Object.freeze({{ left: {left}, top: {top}, right: {right}, bottom: {bottom}, width: {right-left}, height: {bottom-top} }}),"
    file = ROOT / 'js/utils/CombatVfxMetrics.js'
    text = file.read_text(encoding='utf-8')
    text = re.sub(r"^    'basic_attack_shadow_dagger_cut'.*\n", '', text, flags=re.M)
    text = text.replace('export const COMBAT_VFX_VISIBLE_BOUNDS = Object.freeze({', 'export const COMBAT_VFX_VISIBLE_BOUNDS = Object.freeze({\n'+line)
    file.write_text(text, encoding='utf-8')
    print('Dagger cut: six authored frames + peak; visible bounds', bounds)

if __name__ == '__main__':
    main()
