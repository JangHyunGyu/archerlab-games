/**
 * Solo Leveling - AI Sprite Generator
 * Imagen 4로 캐릭터 스프라이트 + 던전 배경 생성
 *
 * Usage: node generate_sprites.mjs
 */
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_KEY = fs.readFileSync(path.join(__dirname, '../../.env.txt'), 'utf-8')
    .split('\n').find(l => l.startsWith('GEMINI_API_KEY='))
    ?.split('=')[1]?.trim();

if (!API_KEY) { console.error('GEMINI_API_KEY not found in .env.txt'); process.exit(1); }

const ai = new GoogleGenAI({ apiKey: API_KEY });
const PLAYER_DIR = path.join(__dirname, 'assets', 'player');
const BG_DIR = path.join(__dirname, 'assets', 'background');
fs.mkdirSync(PLAYER_DIR, { recursive: true });
fs.mkdirSync(BG_DIR, { recursive: true });

const CHAR_DESC = 'a young Korean man with messy spiky black hair swept to the side, intense glowing blue eyes with luminous glow effect, wearing a long dark navy-black hunter trench coat with high standing collar and subtle dark shoulder armor pieces, dark pants tucked into black combat boots, lean athletic build, dark fantasy hunter aesthetic';

async function generateImagen(prompt, filename, aspectRatio = '3:4') {
    console.log(`  Generating: ${filename}...`);
    try {
        const result = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt,
            config: { numberOfImages: 1, aspectRatio },
        });
        const bytes = result.generatedImages[0].image.imageBytes;
        const outPath = path.join(filename.includes('bg_') ? BG_DIR : PLAYER_DIR, filename);
        fs.writeFileSync(outPath, Buffer.from(bytes, 'base64'));
        console.log(`  ✓ Saved: ${outPath}`);
        return bytes;
    } catch (e) {
        console.error(`  ✗ Failed: ${filename} - ${e.message}`);
        return null;
    }
}

async function generateGeminiVariation(refImageBase64, prompt, filename) {
    console.log(`  Generating variation: ${filename}...`);
    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { mimeType: 'image/png', data: refImageBase64 } },
                    { text: prompt },
                ],
            }],
            config: { responseModalities: ['TEXT', 'IMAGE'] },
        });
        for (const part of result.response.candidates[0].content.parts) {
            if (part.inlineData) {
                const outPath = path.join(PLAYER_DIR, filename);
                fs.writeFileSync(outPath, Buffer.from(part.inlineData.data, 'base64'));
                console.log(`  ✓ Saved: ${outPath}`);
                return part.inlineData.data;
            }
        }
        console.error(`  ✗ No image in response: ${filename}`);
        return null;
    } catch (e) {
        console.error(`  ✗ Failed: ${filename} - ${e.message}`);
        return null;
    }
}

async function main() {
    console.log('═══════════════════════════════════════');
    console.log(' Solo Leveling Sprite Generator');
    console.log('═══════════════════════════════════════\n');

    // ── Step 1: Player Character Base (Idle) ──
    console.log('[1/4] Player idle sprite (Imagen 4)');
    const basePrompt = `2D game character sprite, full body front-facing view, standing idle pose with arms slightly away from body, ${CHAR_DESC}, anime cel-shaded art style inspired by Solo Leveling manhwa Sung Jin-Woo, dark fantasy atmosphere, clean outlines with detailed shading, centered on canvas, solid bright green background #00FF00 for easy chroma key removal, no text no watermark no logo, game asset quality, high detail`;
    const baseImage = await generateImagen(basePrompt, 'player_idle.png');

    // ── Step 2: Walk Frames via Gemini (using base as reference) ──
    if (baseImage) {
        console.log('\n[2/4] Player walk frames (Gemini + reference)');
        const walkPrompts = [
            'Generate the EXACT same character in a walking pose with left leg stepping forward and right arm swinging forward. Keep identical art style, colors, clothing design, and character proportions. 2D game sprite, full body, front-facing view, solid bright green background #00FF00, centered on canvas, no text.',
            'Generate the EXACT same character in a walking pose with right leg stepping forward and left arm swinging forward. Keep identical art style, colors, clothing design, and character proportions. 2D game sprite, full body, front-facing view, solid bright green background #00FF00, centered on canvas, no text.',
        ];
        for (let i = 0; i < walkPrompts.length; i++) {
            await generateGeminiVariation(baseImage, walkPrompts[i], `player_walk_${i}.png`);
        }
    }

    // ── Step 3: Dungeon Floor Background ──
    console.log('\n[3/4] Dungeon floor background (Imagen 4)');
    await generateImagen(
        'Seamless tileable dark dungeon stone floor texture, top-down view, ancient cracked stone tiles with subtle moss and cracks, dark purple-blue ambient lighting from edges, mysterious rune engravings barely visible, dark fantasy RPG dungeon aesthetic, no text no watermark, game texture asset, 2D tile, moody atmospheric lighting',
        'bg_dungeon_floor.png',
        '1:1'
    );

    // ── Step 4: Dungeon Wall/Edge Background ──
    console.log('\n[4/4] Dungeon atmosphere overlay (Imagen 4)');
    await generateImagen(
        'Dark dungeon environment background for top-down 2D game, ancient stone walls with torches casting warm orange light, fog and mist on floor, dark shadows, purple crystal formations on walls, dark fantasy atmosphere, no characters, no text no watermark, game background asset, moody and atmospheric',
        'bg_dungeon_atmosphere.png',
        '16:9'
    );

    console.log('\n═══════════════════════════════════════');
    console.log(' Generation Complete!');
    console.log('═══════════════════════════════════════');
    console.log(`Player sprites: ${PLAYER_DIR}`);
    console.log(`Backgrounds: ${BG_DIR}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
