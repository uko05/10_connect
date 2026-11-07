# help_screenshots.py — 「あそびかた」(public/scripts/helpGuide.js)で使うスクショを撮り直す
#
# 使い方:
#   1. 10_connect フォルダで  python -m http.server 8123 --bind 127.0.0.1
#   2. 別の画面で            python tools/help_screenshots.py
#   → public/help/*.jpg が上書きされる。撮った元画像は tools/_help_raw/ に残る(コミット不要)
#
# Playwright(Python) と Chrome を使う。localhost なので全キャラ解放扱いになる。
# 開くたびに新しい匿名ユーザーが Firestore に作られる(テストデータ)。
import asyncio, os
from playwright.async_api import async_playwright
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'tools', '_help_raw')
DST = os.path.join(ROOT, 'public', 'help')
B = 'http://127.0.0.1:8123/'
VP = {'width': 1366, 'height': 768}


async def shoot():
    os.makedirs(RAW, exist_ok=True)
    async with async_playwright() as p:
        br = await p.chromium.launch(channel='chrome')
        ctx = await br.new_context(viewport=VP)
        pg = await ctx.new_page()

        # トップ
        await pg.goto(B + 'index.html'); await pg.wait_for_timeout(3500)
        await pg.screenshot(path=f'{RAW}/hub.png')

        # キャラ選択(CPU): 2番目のキャラを選ぶ → 挑戦モードに切り替え
        await pg.goto(B + 'select.html?mode=cpu'); await pg.wait_for_timeout(3500)
        th = await pg.query_selector_all('#thumbnailContainer > *')
        await th[1].click(); await pg.wait_for_timeout(800)
        await pg.fill('#playerName', 'うーこ')
        await pg.mouse.move(5, 400); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{RAW}/sel_chosen.png')
        await pg.click('#soloModeNext'); await pg.wait_for_timeout(800)
        await pg.mouse.move(5, 400); await pg.screenshot(path=f'{RAW}/sel_challenge1.png')

        # キャラ選択(マッチング)
        await pg.goto(B + 'select.html?mode=match'); await pg.wait_for_timeout(3500)
        th = await pg.query_selector_all('#thumbnailContainer > *')
        await th[5].click(); await pg.wait_for_timeout(800)
        await pg.mouse.move(5, 400); await pg.screenshot(path=f'{RAW}/sel_match_chosen.png')

        # 設定・プレイヤー情報(アチーブメントのタブ)
        await pg.goto(B + 'playerInfo.html'); await pg.wait_for_timeout(3500)
        await pg.click('[data-pi-tab="ach"]'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{RAW}/pi_ach.png')

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
        await pg.click('#thumbnailContainerP1'); await pg.wait_for_timeout(1000)
        await pg.screenshot(path=f'{RAW}/b_standby.png')
        await pg.click('#specialMoveButton'); await pg.wait_for_timeout(1000)
        await pg.screenshot(path=f'{RAW}/b_cutin.png')
        await br.close()


def save(name, im, width=None):
    im = im.convert('RGB')
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(os.path.join(DST, name + '.jpg'), quality=84, optimize=True)
    print(name, im.size)


def build():
    o = lambda f: Image.open(os.path.join(RAW, f))
    save('hub', o('hub.png'), 1100)
    save('select', o('sel_chosen.png').crop((60, 36, 462, 752)))
    save('match', o('sel_match_chosen.png').crop((60, 36, 462, 752)))
    save('playerinfo', o('pi_ach.png').crop((329, 60, 1069, 768)))
    save('battle', o('b_board.png'), 1100)
    save('standby', o('b_standby.png'), 1100)
    save('cutin', o('b_cutin.png'), 1100)
    # CPU対戦の設定部分と、挑戦モードに切り替えた部分をつなげる
    a = o('sel_chosen.png').convert('RGB').crop((60, 566, 462, 716))
    b = o('sel_challenge1.png').convert('RGB').crop((60, 566, 462, 662))
    im = Image.new('RGB', (a.width, a.height + 14 + b.height), (255, 255, 255))
    im.paste(a, (0, 0)); im.paste(b, (0, a.height + 14))
    save('challenge', im.resize((im.width * 3 // 2, im.height * 3 // 2), Image.LANCZOS))


if __name__ == '__main__':
    asyncio.run(shoot())
    build()
