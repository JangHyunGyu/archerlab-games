"""Inspect every shipped character cell without modifying production art."""
from pathlib import Path
import argparse
import hashlib
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / 'assets/images'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {'sheets': [], 'cells': [], 'warnings': []}
    groups = {}
    for path in sorted(IMAGES.glob('*.png')):
        if path.name.startswith('character-'):
            cols, rows = 9, 1
            group = path.stem[:11]
        elif path.name.startswith('zombie-walk-'):
            cols, rows = 4, 4
            group = path.stem.replace('zombie-walk-', 'zombie-')
        elif path.name.startswith('zombie-death-'):
            with Image.open(path) as im:
                cols, rows = im.width // 512, im.height // 512
            group = path.stem.replace('zombie-death-', 'zombie-').replace('-sheet', '')
        elif path.name.startswith('zombie-corpse-'):
            cols, rows = 1, 1
            group = 'legacy-corpses'
        else:
            continue
        image = Image.open(path).convert('RGBA')
        if image.width % cols or image.height % rows:
            report['warnings'].append(f'{path.name}: nonintegral grid dimensions {image.size}; runtime floors cell sizes')
        cellw, cellh = image.width // cols, image.height // rows
        webp = Image.open(path.with_suffix('.webp')).convert('RGBA')
        alpha_equal = image.size == webp.size and image.getchannel('A').tobytes() == webp.getchannel('A').tobytes()
        runtime = path.name not in {'character-c.png', 'character-f.png', 'character-g.png',
                                    'character-h.png', 'zombie-death-normal-sheet.png'} and not path.name.startswith('zombie-corpse-')
        report['sheets'].append({'file': path.name, 'size': image.size, 'grid': [cols, rows],
                                 'runtime': runtime, 'png_webp_alpha_equal': alpha_equal,
                                 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        if not alpha_equal:
            report['warnings'].append(f'{path.name}: PNG/WebP alpha differs')
        for row in range(rows):
            previews = []
            for col in range(cols):
                cell = image.crop((col*cellw, row*cellh, (col+1)*cellw, (row+1)*cellh))
                alpha = cell.getchannel('A').point(lambda a: 255 if a > 8 else 0)
                box = alpha.getbbox()
                margins = [box[0], box[1], cellw-box[2], cellh-box[3]] if box else None
                record = {'sheet': path.name, 'runtime': runtime, 'row': row, 'col': col, 'bounds': box, 'margins': margins}
                report['cells'].append(record)
                if not box or min(margins) <= 1:
                    report['warnings'].append(f'{path.name} r{row} c{col}: empty or boundary contact {margins}')
                previews.append(cell)
            groups.setdefault(group, []).append((path.stem + f' / row {row}', previews))
    for group, strips in groups.items():
        tilew, tileh = (160, 230) if group.startswith('character') else (128, 156)
        cols = max(len(cells) for _, cells in strips)
        board = Image.new('RGB', (cols*tilew, len(strips)*(tileh+25)), '#24303a')
        draw = ImageDraw.Draw(board)
        for row, (label, cells) in enumerate(strips):
            y = row*(tileh+25)
            draw.text((4,y+3),label,fill='white')
            for col, cell in enumerate(cells):
                cell.thumbnail((tilew,tileh), Image.Resampling.LANCZOS)
                board.paste(cell,(col*tilew+(tilew-cell.width)//2,y+25+tileh-cell.height),cell)
                draw.line((col*tilew,y+25+tileh-1,(col+1)*tilew,y+25+tileh-1),fill='#526575')
        board.save(args.output / f'{group}.jpg', quality=94)
    (args.output / 'inventory.json').write_text(json.dumps(report, indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'sheets': len(report['sheets']), 'cells': len(report['cells']), 'warnings': report['warnings']}))

if __name__ == '__main__':
    main()
