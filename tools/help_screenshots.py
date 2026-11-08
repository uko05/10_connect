# help_screenshots.py — 「あそびかた」(public/scripts/helpGuide.js)で使うスクショを撮り直す
#
# 使い方:
#   1. 10_connect フォルダで  python -m http.server 8123 --bind 127.0.0.1
#   2. 別の画面で            python tools/help_screenshots.py
#   → public/help/*.jpg が上書きされる。撮った元画像は tools/_help_raw/ に残る(コミット不要)
#   赤枠・補足の文字だけ直すときは  python tools/help_screenshots.py --build (撮り直さない)
#   補足の文字が入った画像は、日本語版(xxx.jpg)と英語版(xxx_en.jpg)を作る
#
# Playwright(Python) と Chrome を使う。localhost なので全キャラ解放扱いになる。
# 開くたびに新しい匿名ユーザーが Firestore に作られる(テストデータ)。
import asyncio, json, os, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'tools', '_help_raw')
DST = os.path.join(ROOT, 'public', 'help')
B = 'http://127.0.0.1:8123/'
VP = {'width': 1366, 'height': 768}
RED = (220, 30, 36)
FONT = 'C:/Windows/Fonts/meiryob.ttc'

# 赤枠と赤文字の補足(説明文に出てくるボタンや表示)。boxes.json に保存して build() で描く
# 1項目 = (セレクタ または [まとめて1枠にするセレクタ...], 日本語の補足, 英語の補足, 補足の位置)
# セレクタの頭に ~ を付けると、要素の幅ではなく中の文字の幅で囲む
# 補足の位置: above-l / above-r / below-l / below-r / below-c / left / right / in-br / in-r / in-tc。補足なしは ''
BOXES = {}
RECT_JS = """(groups)=>groups.map(g=>{let r=null;
  for(const sel of g){const el=document.querySelector(sel.replace(/^~/,''));if(!el)continue;
    let b=el.getBoundingClientRect();
    if(sel[0]==='~'){const rg=document.createRange();rg.selectNodeContents(el);b=rg.getBoundingClientRect();}
    if(!b.width||!b.height)continue;
    r=r?[Math.min(r[0],b.left),Math.min(r[1],b.top),Math.max(r[2],b.right),Math.max(r[3],b.bottom)]:[b.left,b.top,b.right,b.bottom];}
  return r;})"""


async def mark(pg, name, items):
    sels = [it[0] if isinstance(it[0], list) else [it[0]] for it in items]
    rects = await pg.evaluate(RECT_JS, sels)
    BOXES[name] = [{'r': r, 'ja': it[1], 'en': it[2], 'pos': it[3]} for r, it in zip(rects, items) if r]
    missing = [it[0] for r, it in zip(rects, items) if not r]
    if missing:
        print('枠の場所が見つからない:', name, missing)


async def shoot():
    os.makedirs(RAW, exist_ok=True)
    async with async_playwright() as p:
        br = await p.chromium.launch(channel='chrome')
        ctx = await br.new_context(viewport=VP)
        pg = await ctx.new_page()

        # トップ
        await pg.goto(B + 'index.html'); await pg.wait_for_timeout(3500)
        await pg.screenshot(path=f'{RAW}/hub.png')
        await mark(pg, 'hub', [
            ('#goMatchButton', 'オンラインで対戦（ランク戦）', 'Play online (ranked)', 'left'),
            ('#goCpuButton', 'CPUと練習・キャラの解放', 'Practice & unlock characters', 'left'),
            ('#goPlayerInfoButton', 'ランク・戦績・設定など', 'Rank, records, settings', 'left'),
            ('#hubNewsButton', 'お知らせ', 'News', 'left')])

        # キャラ選択(CPU): 2番目のキャラを選ぶ → 挑戦モードに切り替え
        await pg.goto(B + 'select.html?mode=cpu'); await pg.wait_for_timeout(3500)
        th = await pg.query_selector_all('#thumbnailContainer > *')
        await th[1].click(); await pg.wait_for_timeout(800)
        await pg.fill('#playerName', 'うーこ')
        await pg.mouse.move(5, 400); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{RAW}/sel_chosen.png')
        await mark(pg, 'select', [
            (['.chara-ct-label', '#characterCharge'], '石1つでたまるゲージ', 'Gauge per stone', 'above-r'),
            ('.info-item-tate', '必殺技の名前と効果', 'Ultimate name & effect', 'in-br')])
        await mark(pg, 'cpu', [('#cpuDifficultySelector', '', '', ''), ('#cpuOpponentPicker', '', '', '')])
        await pg.click('#soloModeNext'); await pg.wait_for_timeout(800)
        await pg.mouse.move(5, 400); await pg.screenshot(path=f'{RAW}/sel_challenge1.png')
        await mark(pg, 'challenge1', [('#soloModePrev', '', '', ''), ('#soloModeNext', '', '', ''), ('#soloModeInfo', '', '', '')])

        # キャラ選択(マッチング)
        await pg.goto(B + 'select.html?mode=match'); await pg.wait_for_timeout(3500)
        th = await pg.query_selector_all('#thumbnailContainer > *')
        await th[5].click(); await pg.wait_for_timeout(800)
        await pg.mouse.move(5, 400); await pg.screenshot(path=f'{RAW}/sel_match_chosen.png')
        await mark(pg, 'match', [
            ('#matchButton', '押すと相手を探す', 'Press to find an opponent', 'above-r'),
            (['#roomMatching', '#matchModeBlock .info-item-yoko .label'], '友達と遊ぶときに入力', 'For playing with friends', 'below-r')])

        # 設定・プレイヤー情報(アチーブメントのタブ)
        await pg.goto(B + 'playerInfo.html'); await pg.wait_for_timeout(3500)
        await pg.click('[data-pi-tab="ach"]'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{RAW}/pi_ach.png')
        await mark(pg, 'playerinfo', [
            ('.pi-tabs', 'タブで切り替え', 'Switch tabs', 'in-r'),
            ('.new-char-badge', '解放すると新キャラが使える', 'Unlocks a new character', 'left')])

        # CPU戦: ナヴィア(004, 1ターン目から必殺技可) vs マダム・ヘルタ(006)。盤面はテスト用の __soloDebug で並べる
        await pg.evaluate("()=>{sessionStorage.setItem('soloPlayerCharaID','004');sessionStorage.setItem('soloCpuCharaID','006');sessionStorage.setItem('soloPlayerName','うーこ');}")
        await pg.goto(B + 'solo.html'); await pg.wait_for_timeout(3000)
        for _ in range(60):
            if 'あなた' in (await pg.evaluate("()=>document.getElementById('turnLabel').textContent")): break
            await pg.wait_for_timeout(500)
        await pg.wait_for_timeout(2500)
        await pg.evaluate("""()=>{const D=window.__soloDebug;const P=D.PLAYER_COLOR(),C=D.CPU_COLOR();
          const s={};const put=(c,list)=>list.forEach((v,i)=>{s[c+'_'+(5-i)]=v==='p'?P:C;});
          put(1,['c']);put(2,['p','c']);put(3,['p','p','c','p']);put(4,['c','p','c']);put(5,['c','c']);put(6,['p']);
          D.stones=s;D.setCharge(160);}""")
        cv = await pg.query_selector('#connect4Canvas'); bb = await cv.bounding_box()
        await pg.mouse.move(bb['x'] + bb['width'] * 3.5 / 7, bb['y'] + bb['height'] * 0.3)  # 真ん中の列を光らせる
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=f'{RAW}/b_board.png')
        await mark(pg, 'battle', [
            ('~#player1_win', '取ったポイント', 'Points', 'right'),
            ('~#player2_win', '取ったポイント', 'Points', 'left')])
        col = [bb['x'] + bb['width'] * 3 / 7, bb['y'], bb['x'] + bb['width'] * 4 / 7, bb['y'] + bb['height']]
        BOXES['battle'].append({'r': col, 'ja': 'クリックした列に落ちる', 'en': 'Drops in the column you click', 'pos': 'in-tc'})
        await pg.click('#thumbnailContainerP1'); await pg.wait_for_timeout(1000)
        await pg.screenshot(path=f'{RAW}/b_standby.png')
        await mark(pg, 'standby', [
            ('#thumbnailContainerP1', '①自分の番にクリック', '1. Click on your turn', 'below-l'),
            (['#playerGauge1', '#chargeGageNow_1', '#chargeGageMax_1'], '150以上で使える', 'Ready at 150+', 'right'),
            ('#specialMoveButton', '②押すと発動', '2. Press to use', 'below-c')])
        await pg.click('#specialMoveButton'); await pg.wait_for_timeout(1000)
        await pg.screenshot(path=f'{RAW}/b_cutin.png')
        await br.close()
    with open(f'{RAW}/boxes.json', 'w', encoding='utf-8') as f:
        json.dump(BOXES, f, ensure_ascii=False, indent=1)


def save(name, im, width=None):
    im = im.convert('RGB')
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(os.path.join(DST, name + '.jpg'), quality=84, optimize=True)
    print(name, im.size)


def boxed(im, items, lang, width=4, size=16, clip=None, pad=4):
    """元画像(撮ったときの座標)に赤枠と補足を描く。width と size は縮小後の見た目に合わせて渡す"""
    im = im.convert('RGB')
    d = ImageDraw.Draw(im)
    font = ImageFont.truetype(FONT, size)
    cx0, cy0, cx1, cy1 = clip or (0, 0, im.width, im.height)
    for it in items:
        x0, y0, x1, y1 = it['r']
        x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
        d.rounded_rectangle((x0, y0, x1, y1), radius=6, outline=RED, width=width)
        text = it.get(lang)
        if not text:
            continue
        l, t, r, b = d.textbbox((0, 0), text, font=font)
        mx, my = round(size * 0.45), round(size * 0.25)
        w, h = r - l + mx * 2, b - t + my * 2
        g = width + 3  # 枠と補足のすき間
        pos = it['pos']
        if pos == 'left':
            x, y = x0 - g - w, (y0 + y1 - h) / 2
        elif pos == 'right':
            x, y = x1 + g, (y0 + y1 - h) / 2
        elif pos.startswith('above'):
            x, y = (x0 if pos == 'above-l' else x1 - w), y0 - g - h
        elif pos.startswith('below'):
            x = x0 if pos == 'below-l' else (x1 - w if pos == 'below-r' else (x0 + x1 - w) / 2)
            y = y1 + g
        elif pos == 'in-br':
            x, y = x1 - g - w, y1 - g - h
        elif pos == 'in-r':
            x, y = x1 - g - w, (y0 + y1 - h) / 2
        else:  # in-tc
            x, y = (x0 + x1 - w) / 2, y0 + g + 4
        x = min(max(x, cx0 + 2), cx1 - w - 2)
        y = min(max(y, cy0 + 2), cy1 - h - 2)
        d.rounded_rectangle((x, y, x + w, y + h), radius=round(h / 3), fill=(255, 255, 255))
        d.text((x + mx - l, y + my - t), text, font=font, fill=RED)
    return im


def build():
    o = lambda f: Image.open(os.path.join(RAW, f))
    with open(os.path.join(RAW, 'boxes.json'), encoding='utf-8') as f:
        bx = json.load(f)
    TALL = (60, 36, 462, 752)
    PI = (329, 60, 1069, 768)
    SB = (0, 0, 1100, 300)
    for lang in ('ja', 'en'):
        sfx = '' if lang == 'ja' else '_en'
        # 横長の画像は 1366→1100 に縮むので、枠と文字は少し大きめに描く
        save('hub' + sfx, boxed(o('hub.png'), bx['hub'], lang, 4, 28), 1100)
        save('battle_ui' + sfx, boxed(o('b_board.png'), bx['battle'], lang, 4, 28), 1100)
        # 必殺技のページはアイコン・ゲージ・ボタンのある左上だけを大きく見せる
        save('standby' + sfx, boxed(o('b_standby.png'), bx['standby'], lang, 4, 24, SB).crop(SB))
        save('select' + sfx, boxed(o('sel_chosen.png'), bx['select'], lang, 3, 15, TALL).crop(TALL))
        save('match' + sfx, boxed(o('sel_match_chosen.png'), bx['match'], lang, 3, 15, TALL).crop(TALL))
        save('playerinfo' + sfx, boxed(o('pi_ach.png'), bx['playerinfo'], lang, 3, 16, PI).crop(PI))
    save('battle', o('b_board.png'), 1100)  # 1ページ目(全体の紹介)は枠なし
    # CPU対戦の設定部分と、挑戦モードに切り替えた部分をつなげる(枠だけ。補足の文字を置く場所がない)
    a = boxed(o('sel_chosen.png'), bx['cpu'], 'ja', 2).crop((60, 566, 462, 716))
    b = boxed(o('sel_challenge1.png'), bx['challenge1'], 'ja', 2).crop((60, 566, 462, 662))
    im = Image.new('RGB', (a.width, a.height + 14 + b.height), (255, 255, 255))
    im.paste(a, (0, 0)); im.paste(b, (0, a.height + 14))
    save('challenge', im.resize((im.width * 3 // 2, im.height * 3 // 2), Image.LANCZOS))


if __name__ == '__main__':
    if '--build' not in sys.argv:  # --build なら撮影せず、前回撮った画像から作り直す
        asyncio.run(shoot())
    build()
