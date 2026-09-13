// Work in CSS pixels so typography and hit targets keep their physical size.
export function getShadowMenuLayout(width, height, hasSave = false) {
    const portrait = height > width;
    const short = !portrait && height <= 620;
    const margin = portrait ? 24 : Math.max(28, Math.min(width * .085, 140));
    const contentW = portrait ? Math.min(width - 48, 430) : Math.min(width * .43, 530);
    const x = portrait ? (width - contentW) / 2 : margin;
    const buttonH = short ? 50 : (height < 650 ? 64 : 72);
    const gap = short || height < 650 ? 10 : 14;
    const stackH = (hasSave ? 3 : 2) * buttonH + (hasSave ? 2 : 1) * gap;
    const actionsY = portrait ? height - stackH - 28 : Math.min(height - stackH - (short ? 18 : 30), height * .61);
    const top = portrait ? 76 : (short ? 66 : height * .19);
    const titleSize = portrait ? Math.min(68, width * .135) : (short ? Math.min(42, height * .11, (actionsY - top - 10) / 2.2) : Math.min(88, width * .061));
    const heroTop = top + titleSize * 2.2 + 14;
    const heroBottom = actionsY - 72;
    const heroSize = portrait ? Math.min(width * .65, height * .255, Math.max(64, heroBottom - heroTop)) : Math.min(width * .37, height * .57, 510);
    const heroX = portrait ? width / 2 : width * .755;
    const heroY = portrait ? (heroTop + heroBottom) / 2 : height * .49;
    return { portrait, short, x, top, contentW, buttonH, gap, actionsY, titleSize, heroSize, heroX, heroY };
}
