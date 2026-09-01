#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TIMEOUT_MS = 12000;

function findBrowser() {
    const candidates = [];
    if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
    if (process.platform === 'win32') {
        const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
        const pfx86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
        const local = process.env.LOCALAPPDATA || '';
        candidates.push(
            path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(pfx86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            path.join(pfx86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        );
    } else if (process.platform === 'darwin') {
        candidates.push(
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
        );
    }
    candidates.push('chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome', 'msedge');
    for (const candidate of candidates) {
        if (!candidate) continue;
        if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
        const result = spawnSync(candidate, ['--version'], { stdio: 'ignore', timeout: 3000 });
        if (!result.error && result.status === 0) return candidate;
    }
    return null;
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(error => error ? reject(error) : resolve(port));
        });
    });
}

async function waitForJson(url, timeout = TIMEOUT_MS) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const data = await new Promise((resolve, reject) => {
                http.get(url, res => {
                    let body = '';
                    res.setEncoding('utf8');
                    res.on('data', chunk => { body += chunk; });
                    res.on('end', () => {
                        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
                    });
                }).on('error', reject).setTimeout(500, function () { this.destroy(); });
            });
            return data;
        } catch (_) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    throw new Error(`Chrome DevTools endpoint timeout (${timeout}ms)`);
}

class CDPClient {
    constructor(wsUrl) {
        if (typeof WebSocket !== 'function') {
            throw new Error('Visual tests require Node.js with built-in WebSocket support (Node 22+ recommended).');
        }
        this.ws = new WebSocket(wsUrl);
        this.nextId = 1;
        this.pending = new Map();
    }
    async open() {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 5000);
            this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.ws.addEventListener('error', event => { clearTimeout(timer); reject(event.error || new Error('WebSocket error')); }, { once: true });
        });
        this.ws.addEventListener('message', event => {
            const msg = JSON.parse(event.data);
            if (!msg.id || !this.pending.has(msg.id)) return;
            const { resolve, reject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
            else resolve(msg.result || {});
        });
    }
    call(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    close() { try { this.ws.close(); } catch (_) {} }
}

function fixtureHtml(name = 'busho_gauge.html') {
    const fixture = fs.readFileSync(path.join(ROOT, 'tests', 'visual', name), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
    return fixture.replace('<!-- APP_CSS -->', `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
}

function approx(actual, expected, tolerance, message) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected} ± ${tolerance}, got ${actual}`);
}

function validate(rows) {
    assert.strictEqual(rows.length, 4);
    const byValue = new Map(rows.map(row => [row.value, row]));
    for (const value of [80, 100, 110, 120]) {
        const row = byValue.get(value);
        assert.ok(row, `${value}の行がありません`);
        assert.ok(row.wrapper.width > 140, `${value}: ゲージ領域が短すぎます (${row.wrapper.width}px)`);
        assert.ok(row.wrapper.height >= 10, `${value}: ゲージ領域の高さが潰れています (${row.wrapper.height}px)`);
        assert.ok(row.base.height >= 10, `${value}: 基準ゲージの高さが潰れています (${row.base.height}px)`);
        assert.ok(row.fill.height >= 8, `${value}: 塗りゲージの高さが潰れています (${row.fill.height}px)`);
        approx(row.base.width / row.wrapper.width, 100 / 120, 0.015, `${value}: 100の基準枠比率`);
        approx(row.fill.width / row.wrapper.width, value / 120, 0.018, `${value}: 能力値に対する描画幅`);
        assert.ok(row.fill.right <= row.rightColumnLeft - 5, `${value}: 右側情報欄へ侵入しています`);
        assert.ok(row.fill.right <= row.row.right + 0.5, `${value}: 能力値行の外へ侵入しています`);
    }
    const v80 = byValue.get(80), v100 = byValue.get(100), v110 = byValue.get(110), v120 = byValue.get(120);
    assert.ok(v80.fill.right < v80.base.right - 2, '80は100枠内に収まる必要があります');
    approx(v100.fill.right, v100.base.right, 1.5, '100は通常枠右端に一致する必要があります');
    assert.ok(v110.fill.right > v110.base.right + 2, '110は100枠を突き破る必要があります');
    assert.ok(v110.fill.right < v110.wrapper.right - 2, '110は120最大端より手前で止まる必要があります');
    approx(v120.fill.right, v120.wrapper.right, 2.0, '120は予約領域の右端に到達する必要があります');
}


async function validateLegionCouncil(cdp) {
    const html = fixtureHtml('legion_council.html');

    const loadAt = async (width, height, mobile, isPc) => {
        await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
        await cdp.call('Runtime.evaluate', {
            expression: `(() => {
                document.open();document.write(${JSON.stringify(html)});document.close();
                document.body.classList.toggle('is-pc', ${isPc});
                const screen = document.getElementById('game-screen');
                const windowW = ${width};
                const windowH = ${height};
                let canvasW, canvasH, scale;
                if (${isPc}) {
                    canvasW = 1280; canvasH = 720;
                    scale = Math.min(windowW / canvasW, windowH / canvasH);
                } else {
                    const targetRatio = 9 / 16;
                    const currentRatio = windowW / windowH;
                    let finalW, finalH;
                    if (currentRatio > targetRatio) { finalH = windowH; finalW = windowH * targetRatio; }
                    else { finalW = windowW; finalH = windowW / targetRatio; }
                    const minMobileWidth = 360;
                    canvasW = finalW; canvasH = finalH; scale = 1;
                    if (finalW < minMobileWidth) {
                        canvasW = minMobileWidth; canvasH = minMobileWidth / targetRatio; scale = finalW / minMobileWidth;
                    }
                }
                const scaledW = canvasW * scale;
                const scaledH = canvasH * scale;
                screen.style.width = canvasW + 'px';
                screen.style.height = canvasH + 'px';
                screen.style.position = 'absolute';
                screen.style.left = ((windowW - scaledW) / 2) + 'px';
                screen.style.top = ((windowH - scaledH) / 2) + 'px';
                screen.style.transformOrigin = 'top left';
                screen.style.transform = Math.abs(scale - 1) < 0.000001 ? 'none' : 'scale(' + scale + ')';
                screen.style.overflow = 'hidden';
                return true;
            })()`,
            returnByValue: true,
            awaitPromise: true
        });
        await new Promise(resolve => setTimeout(resolve, 100));
    };

    await loadAt(1200, 850, false, true);
    let result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const contentEl = document.querySelector('.legion-council-content');
            const content = contentEl.getBoundingClientRect();
            const contentStyle = getComputedStyle(contentEl);
            const stage = document.querySelector('.legion-council-stage').getBoundingClientRect();
            const left = document.getElementById('legion-council-left').getBoundingClientRect();
            const center = document.querySelector('.legion-council-center').getBoundingClientRect();
            const right = document.getElementById('legion-council-right').getBoundingClientRect();
            const seats = [...document.querySelectorAll('.legion-council-seat')].map(x => x.getBoundingClientRect());
            const chips = [...document.querySelectorAll('.legion-council-policy-chip')].map(x => x.getBoundingClientRect());
            const bulk = document.getElementById('legion-council-bulk-btn').getBoundingClientRect();
            return {
                innerWidth: window.innerWidth, innerHeight: window.innerHeight,
                content:{left:content.left,right:content.right,top:content.top,bottom:content.bottom,width:content.width,height:content.height,clientHeight:document.querySelector('.legion-council-content').clientHeight,scrollHeight:document.querySelector('.legion-council-content').scrollHeight,overflowY:getComputedStyle(document.querySelector('.legion-council-content')).overflowY},
                stage:{width:stage.width}, left:{left:left.left,right:left.right,width:left.width}, center:{left:center.left,right:center.right,width:center.width}, right:{left:right.left,right:right.right,width:right.width},
                seats:seats.map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height})),
                chips:chips.map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height})),
                bulk:{top:bulk.top,bottom:bulk.bottom,left:bulk.left,right:bulk.right,height:bulk.height},
                bulkText:(() => {
                    const el = document.getElementById('legion-council-bulk-btn');
                    const cs = getComputedStyle(el);
                    return {scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,fontSize:parseFloat(cs.fontSize),lineHeight:parseFloat(cs.lineHeight)};
                })(),
                contentBorderBottom: parseFloat(getComputedStyle(document.querySelector('#legion-council-modal .legion-council-content')).borderBottomWidth) || 0,
                bulkBottomGap: content.bottom - bulk.bottom
            };
        })()`, returnByValue: true
    });
    const pc = result.result.value;
    assert.strictEqual(pc.seats.length, 8, 'PC評定は8席を描画できる必要があります');
    assert.ok(pc.content.left >= -1 && pc.content.right <= pc.innerWidth + 1, 'PC評定モーダルが画面外へはみ出しています');
    assert.ok(pc.left.right < pc.center.left, 'PC評定の左席と中央装飾が重なっています');
    assert.ok(pc.center.right < pc.right.left, 'PC評定の中央装飾と右席が重なっています');
    assert.ok(pc.seats.every(r => r.height >= 100), 'PC評定の国主席が潰れています');
    assert.ok(pc.chips.every(c => c.width > 0 && c.height >= 12), 'PC評定の方針表示が潰れています');
    const bulkTopGap = pc.bulk.top - pc.seats[7].bottom;
    const bulkBottomInnerGap = pc.bulkBottomGap - pc.contentBorderBottom;
    assert.ok(bulkTopGap >= 5, `PC評定の第八国主席と一括ボタンの間隔が狭すぎます (${bulkTopGap})`);
    assert.ok(bulkBottomInnerGap >= 5, `PC評定の一括ボタン下と内容枠内側の隙間が狭すぎます (${bulkBottomInnerGap})`);
    approx(bulkTopGap, bulkBottomInnerGap, 1.0, 'PC評定の一括ボタン上下の視覚上の隙間を揃える');
    assert.ok(pc.bulkText.scrollHeight <= pc.bulkText.clientHeight, `PC評定の一括ボタン文字が内側へ収まっていません (${pc.bulkText.scrollHeight}/${pc.bulkText.clientHeight})`);
    assert.ok(pc.bulkText.lineHeight <= pc.bulk.height - 8, `PC評定の一括ボタン文字が内側装飾枠へ近すぎます (line-height ${pc.bulkText.lineHeight}, height ${pc.bulk.height})`);
    const bulkCenterX = (pc.bulk.left + pc.bulk.right) / 2;
    const bulkCenterY = (pc.bulk.top + pc.bulk.bottom) / 2;
    await cdp.call('Input.dispatchMouseEvent', { type:'mouseMoved', x:bulkCenterX, y:bulkCenterY });
    await new Promise(resolve => setTimeout(resolve, 40));
    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => { const r = document.getElementById('legion-council-bulk-btn').getBoundingClientRect(); return {top:r.top,bottom:r.bottom}; })()`,
        returnByValue: true
    });
    const hoveredBulk = result.result.value;
    approx(hoveredBulk.top, pc.bulk.top, 0.2, 'PC評定の一括ボタンはhover時に上へ逃がさない');
    approx(hoveredBulk.bottom, pc.bulk.bottom, 0.2, 'PC評定の一括ボタンはhover時に位置を変えない');
    assert.ok(pc.content.scrollHeight <= pc.content.clientHeight + 1, `PC評定一覧に縦スクロールが発生しています (${pc.content.scrollHeight} > ${pc.content.clientHeight})`);
    assert.strictEqual(pc.content.overflowY, 'hidden', 'PC評定一覧はスクロール領域にしてはいけません');

    // PCは物理ウインドウが縦長・小型でも、内部1280×720を崩さず等比縮小し、上下の黒帯で吸収する。
    await loadAt(720, 620, false, true);
    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const screen = document.getElementById('game-screen').getBoundingClientRect();
            const content = document.querySelector('.legion-council-content').getBoundingClientRect();
            const centerEl = document.querySelector('.legion-council-center');
            const center = getComputedStyle(centerEl).display;
            const centerRect = centerEl.getBoundingClientRect();
            const left = document.getElementById('legion-council-left').getBoundingClientRect();
            const right = document.getElementById('legion-council-right').getBoundingClientRect();
            const seats = [...document.querySelectorAll('.legion-council-seat')].map(x => x.getBoundingClientRect());
            return { innerWidth:window.innerWidth, innerHeight:window.innerHeight, scrollWidth:document.documentElement.scrollWidth,
                screen:{left:screen.left,right:screen.right,top:screen.top,bottom:screen.bottom,width:screen.width,height:screen.height},
                content:{left:content.left,right:content.right,top:content.top,bottom:content.bottom,width:content.width,height:content.height}, center,
                centerRect:{left:centerRect.left,right:centerRect.right}, left:{left:left.left,right:left.right}, right:{left:right.left,right:right.right},
                seats:seats.map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height})) };
        })()`, returnByValue: true
    });
    const smallPc = result.result.value;
    approx(smallPc.screen.width / smallPc.screen.height, 16 / 9, 0.002, '小型PCでもゲーム画面は16:9を維持');
    assert.ok(smallPc.screen.top > 1 && smallPc.screen.bottom < smallPc.innerHeight - 1, '縦長PCウインドウでは上下黒帯で16:9を維持する必要があります');
    assert.ok(smallPc.scrollWidth <= smallPc.innerWidth + 2, `小型PC評定が物理画面を横にはみ出しています (${smallPc.scrollWidth} > ${smallPc.innerWidth})`);
    assert.strictEqual(smallPc.center, 'flex', 'PC評定は物理ウインドウ幅で中央装飾を畳んではいけません');
    assert.ok(smallPc.content.left >= smallPc.screen.left - 1 && smallPc.content.right <= smallPc.screen.right + 1, '小型PCでも評定は16:9ゲーム画面内に収まる必要があります');
    assert.ok(smallPc.left.right < smallPc.centerRect.left && smallPc.centerRect.right < smallPc.right.left, '小型PCでも左右4席＋中央装飾の論理配置を維持する必要があります');

    // 横長ウインドウでは左右黒帯を使い、同じ16:9論理レイアウトを維持する。
    await loadAt(1000, 500, false, true);
    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const screen = document.getElementById('game-screen').getBoundingClientRect();
            const center = getComputedStyle(document.querySelector('.legion-council-center')).display;
            return { innerWidth:window.innerWidth, screen:{left:screen.left,right:screen.right,top:screen.top,bottom:screen.bottom,width:screen.width,height:screen.height}, center };
        })()`, returnByValue: true
    });
    const widePc = result.result.value;
    approx(widePc.screen.width / widePc.screen.height, 16 / 9, 0.002, '横長PCでもゲーム画面は16:9を維持');
    assert.ok(widePc.screen.left > 1 && widePc.screen.right < widePc.innerWidth - 1, '横長PCウインドウでは左右黒帯で16:9を維持する必要があります');
    assert.strictEqual(widePc.center, 'flex', '横長PCでも評定レイアウトを物理ウインドウ幅で変更してはいけません');

    await loadAt(360, 800, true, false);
    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const modal = document.getElementById('legion-council-modal');
            const screen = document.getElementById('game-screen').getBoundingClientRect();
            const contentEl = document.querySelector('.legion-council-content');
            const content = contentEl.getBoundingClientRect();
            const contentStyle = getComputedStyle(contentEl);
            const stage = document.querySelector('.legion-council-stage').getBoundingClientRect();
            const footer = document.querySelector('.legion-council-footer').getBoundingClientRect();
            const actions = document.querySelector('.legion-council-actions').getBoundingClientRect();
            const bulk = document.getElementById('legion-council-bulk-btn').getBoundingClientRect();
            const center = getComputedStyle(document.querySelector('.legion-council-center')).display;
            const seats = [...document.querySelectorAll('.legion-council-seat')].map(x => x.getBoundingClientRect());
            const firstSeat = document.querySelector('.legion-council-seat');
            const heading = firstSeat.querySelector('.legion-council-seat-heading').getBoundingClientRect();
            const name = firstSeat.querySelector('.legion-council-name').getBoundingClientRect();
            const policy = firstSeat.querySelector('.legion-council-policy-summary').getBoundingClientRect();
            const hintDisplay = getComputedStyle(firstSeat.querySelector('.legion-council-seat-hint')).display;
            const orderButtons = [...document.querySelectorAll('.legion-council-order-btn')];
            return { innerWidth:window.innerWidth, innerHeight:window.innerHeight, scrollWidth:document.documentElement.scrollWidth, center,
                screen:{left:screen.left,right:screen.right,top:screen.top,bottom:screen.bottom,width:screen.width,height:screen.height},
                content:{left:content.left,right:content.right,top:content.top,bottom:content.bottom,borderBottom:parseFloat(contentStyle.borderBottomWidth)||0,clientHeight:contentEl.clientHeight,scrollHeight:contentEl.scrollHeight,overflowY:contentStyle.overflowY},
                stage:{top:stage.top,bottom:stage.bottom}, actions:{left:actions.left,right:actions.right,top:actions.top,bottom:actions.bottom}, bulk:{left:bulk.left,right:bulk.right,top:bulk.top,bottom:bulk.bottom}, footer:{top:footer.top,bottom:footer.bottom}, footerOutside:document.querySelector('.legion-council-footer').parentElement === modal,
                seats:seats.map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height})),
                firstText:{headingBottom:heading.bottom,nameTop:name.top,nameBottom:name.bottom,policyTop:policy.top,hintDisplay},
                orderButtonCount: orderButtons.length, modalWidth:modal.getBoundingClientRect().width };
        })()`, returnByValue: true
    });
    const mobile = result.result.value;
    assert.strictEqual(mobile.seats.length, 8, 'スマホ評定でも8席を描画できる必要があります');
    assert.ok(mobile.scrollWidth <= mobile.innerWidth + 2, `スマホ評定が横にはみ出しています (${mobile.scrollWidth} > ${mobile.innerWidth})`);
    assert.strictEqual(mobile.center, 'none', 'スマホ評定では中央装飾を一覧から外す必要があります');
    assert.strictEqual(mobile.orderButtonCount, 0, 'スマホ評定の国主席に個別命令ボタンを重ねてはいけません');
    const first = mobile.seats[0], second = mobile.seats[1];
    assert.ok(Math.abs(first.top - second.top) <= 2 && second.left > first.left, 'スマホ評定の国主席が2列配置になっていません');
    assert.ok(mobile.seats.every(r => r.left >= mobile.screen.left - 1 && r.right <= mobile.screen.right + 1), 'スマホ評定の国主席が9:16ゲーム画面外へ見切れています');
    approx(mobile.screen.width / mobile.screen.height, 9 / 16, 0.002, 'スマホ評定でもゲーム画面は9:16を維持');
    assert.ok(mobile.screen.top > 1 && mobile.screen.bottom < mobile.innerHeight - 1, '縦長スマホでは上下黒帯で9:16を維持する必要があります');
    assert.ok(mobile.content.scrollHeight <= mobile.content.clientHeight + 4, `スマホ評定一覧の内部内容が枠を超えています (${mobile.content.scrollHeight} > ${mobile.content.clientHeight})`);
    assert.strictEqual(mobile.content.overflowY, 'hidden', 'スマホ評定一覧はスクロール領域にしてはいけません');
    assert.strictEqual(mobile.footerOutside, true, '評定を終えるボタンは標準モーダルと同じく内容枠の外側へ置く');
    assert.ok(mobile.stage.bottom <= mobile.content.bottom + 1, 'スマホ評定の8席が内容枠からはみ出しています');
    assert.ok(mobile.actions.top >= mobile.stage.bottom - 1, '一括操作帯は軍団カード群の下側に置く');
    assert.ok(mobile.bulk.right <= mobile.content.right + 1 && mobile.bulk.right >= mobile.content.right - 20, '一括ボタンは評定内容枠の右下へ寄せる');
    assert.ok(mobile.bulk.bottom <= mobile.content.bottom + 1, '一括ボタンが評定内容枠からはみ出しています');
    const mobileBulkTopGap = mobile.bulk.top - mobile.stage.bottom;
    const mobileBulkBottomGap = (mobile.content.bottom - mobile.content.borderBottom) - mobile.bulk.bottom;
    approx(mobileBulkTopGap, mobileBulkBottomGap, 1.0, 'スマホ評定のカード→一括と一括→枠内側の隙間を揃える');
    assert.ok(mobile.content.bottom <= mobile.footer.top + 1, 'スマホ評定の内容枠と終了ボタンが重なっています');
    assert.ok(mobile.footer.top - mobile.content.bottom >= 12, `スマホ評定の内容枠と終了ボタンの隙間が標準モーダルより狭すぎます (${mobile.footer.top - mobile.content.bottom})`);
    assert.ok(mobile.footer.bottom <= mobile.screen.bottom + 1, 'スマホ評定の終了ボタンが9:16ゲーム画面外へ見切れています');
    assert.ok(mobile.firstText.nameTop - mobile.firstText.headingBottom <= 8, 'スマホ国主席の上段と名前が不自然に離れています');
    assert.ok(mobile.firstText.policyTop - mobile.firstText.nameBottom <= 8, 'スマホ国主席の名前と方針が不自然に離れています');
    assert.strictEqual(mobile.firstText.hintDisplay, 'none', 'スマホ国主席の補助文は高さを圧迫しないよう非表示にします');
    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const seat = document.querySelector('.legion-council-seat');
            const before = seat.getBoundingClientRect().top;
            seat.focus();
            const after = seat.getBoundingClientRect().top;
            return { before, after };
        })()`, returnByValue: true
    });
    const focusSeat = result.result.value;
    approx(focusSeat.after, focusSeat.before, 0.1, '軍団カードはfocus時にも上へ動かして見切れさせない');

    // 幅の広いスマホでも論理9:16が高くなった分だけカード内文字間隔を引き伸ばさない。
    await loadAt(430, 932, true, false);
    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const modal = document.getElementById('legion-council-modal');
            const screen = document.getElementById('game-screen').getBoundingClientRect();
            const contentEl = document.querySelector('.legion-council-content');
            const content = contentEl.getBoundingClientRect();
            const contentStyle = getComputedStyle(contentEl);
            const stage = document.querySelector('.legion-council-stage').getBoundingClientRect();
            const footerEl = document.querySelector('.legion-council-footer');
            const footer = footerEl.getBoundingClientRect();
            const actions = document.querySelector('.legion-council-actions').getBoundingClientRect();
            const bulk = document.getElementById('legion-council-bulk-btn').getBoundingClientRect();
            const firstSeat = document.querySelector('.legion-council-seat');
            const heading = firstSeat.querySelector('.legion-council-seat-heading').getBoundingClientRect();
            const name = firstSeat.querySelector('.legion-council-name').getBoundingClientRect();
            const policy = firstSeat.querySelector('.legion-council-policy-summary').getBoundingClientRect();
            const seats = [...document.querySelectorAll('.legion-council-seat')].map(x => x.getBoundingClientRect());
            return { screen:{bottom:screen.bottom}, content:{right:content.right,bottom:content.bottom,borderBottom:parseFloat(contentStyle.borderBottomWidth)||0}, stage:{bottom:stage.bottom}, actions:{top:actions.top,bottom:actions.bottom}, bulk:{top:bulk.top,right:bulk.right,bottom:bulk.bottom}, footer:{top:footer.top,bottom:footer.bottom}, footerOutside:footerEl.parentElement === modal,
                gaps:{a:name.top-heading.bottom,b:policy.top-name.bottom}, seatHeight:firstSeat.getBoundingClientRect().height,
                seatHeights:seats.map(r=>r.height) };
        })()`, returnByValue: true
    });
    const wideMobile = result.result.value;
    assert.strictEqual(wideMobile.footerOutside, true, '幅広スマホでも終了ボタンは内容枠の外側へ置く');
    assert.ok(wideMobile.stage.bottom <= wideMobile.content.bottom + 1, '幅広スマホでも国主席が内容枠からはみ出しています');
    assert.ok(wideMobile.actions.top >= wideMobile.stage.bottom - 1, '幅広スマホでも一括操作帯はカード群の下に置く');
    assert.ok(wideMobile.bulk.right <= wideMobile.content.right + 1 && wideMobile.bulk.right >= wideMobile.content.right - 24, '幅広スマホでも一括ボタンは右下に寄せる');
    assert.ok(wideMobile.bulk.bottom <= wideMobile.content.bottom + 1, '幅広スマホで一括ボタンが内容枠からはみ出しています');
    const wideMobileBulkTopGap = wideMobile.bulk.top - wideMobile.stage.bottom;
    const wideMobileBulkBottomGap = (wideMobile.content.bottom - wideMobile.content.borderBottom) - wideMobile.bulk.bottom;
    approx(wideMobileBulkTopGap, wideMobileBulkBottomGap, 1.0, '幅広スマホでもカード→一括と一括→枠内側の隙間を揃える');
    assert.ok(wideMobile.content.bottom <= wideMobile.footer.top + 1, '幅広スマホでも内容枠と終了ボタンが重なっています');
    assert.ok(wideMobile.footer.top - wideMobile.content.bottom >= 12, `幅広スマホでも内容枠と終了ボタンに標準相当の隙間が必要です (${wideMobile.footer.top - wideMobile.content.bottom})`);
    assert.ok(wideMobile.footer.bottom <= wideMobile.screen.bottom + 1, '幅広スマホでも終了ボタンが9:16ゲーム画面外へ見切れています');
    assert.ok(wideMobile.gaps.a <= 8 && wideMobile.gaps.b <= 8, `幅広スマホでカード内文字が縦に引き伸ばされています (${wideMobile.gaps.a}, ${wideMobile.gaps.b})`);
    assert.ok(wideMobile.seatHeights.every(h => h <= 84), `幅広スマホで軍団カード自体が縦に伸びています (${wideMobile.seatHeights.join(', ')})`);

    // 命令編集は別モーダルで、スマホでも一覧カードへ重ならず全幅で安全に表示する。
    await loadAt(360, 800, true, false);
    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const main = document.getElementById('legion-council-modal');
            const order = document.getElementById('legion-council-order-modal');
            order.classList.remove('hidden');
            const contentEl = order.querySelector('.legion-council-order-content');
            const content = contentEl.getBoundingClientRect();
            const rows = [...order.querySelectorAll('.legion-council-order-row')].map(x => x.getBoundingClientRect());
            const buttons = [...order.querySelectorAll('.legion-council-toggle button')].map(x => x.getBoundingClientRect());
            const footerEl = order.querySelector('.legion-council-order-footer');
            const footer = footerEl.getBoundingClientRect();
            const actionButtons = [...footerEl.querySelectorAll('button')].map(x => ({text:x.textContent.trim(), rect:x.getBoundingClientRect()}));
            return { innerWidth:window.innerWidth, mainVisible:!main.classList.contains('hidden'), orderVisible:!order.classList.contains('hidden'),
                footerOutside: footerEl.parentElement === order,
                content:{left:content.left,right:content.right,top:content.top,bottom:content.bottom,width:content.width,height:content.height,clientHeight:contentEl.clientHeight,scrollHeight:contentEl.scrollHeight,overflowY:getComputedStyle(contentEl).overflowY},
                rows:rows.map(r=>({top:r.top,bottom:r.bottom,width:r.width,height:r.height})), buttons:buttons.map(r=>({width:r.width,height:r.height})),
                footer:{top:footer.top,bottom:footer.bottom}, actionButtons:actionButtons.map(b=>({text:b.text,width:b.rect.width,height:b.rect.height})), text:contentEl.textContent };
        })()`, returnByValue: true
    });
    const orderMobile = result.result.value;
    assert.ok(orderMobile.mainVisible && orderMobile.orderVisible, '命令編集は評定を保持したまま別モーダルとして開く必要があります');
    assert.strictEqual(orderMobile.footerOutside, true, '命令画面の確定/戻るは他の標準モーダルと同じく内容枠の外側へ置く');
    assert.ok(orderMobile.content.left >= -1 && orderMobile.content.right <= orderMobile.innerWidth + 1, 'スマホ命令モーダルが横にはみ出しています');
    assert.ok(orderMobile.rows.every(r => r.height >= 70), 'スマホ命令項目が潰れています');
    assert.ok(orderMobile.buttons.every(b => b.height >= 40), 'スマホ命令ボタンが小さすぎます');
    assert.deepStrictEqual(orderMobile.actionButtons.map(b => b.text).sort(), ['戻る', '確定'], '命令画面は確定と戻るの2ボタンにします');
    assert.ok(orderMobile.actionButtons.every(b => b.height >= 36), 'スマホ命令画面の確定/戻るボタンが小さすぎます');
    assert.ok(orderMobile.actionButtons.every(b => b.width <= 128), `スマホ命令画面の確定/戻るボタンが横へ伸びすぎています (${orderMobile.actionButtons.map(b => b.width).join(', ')})`);
    assert.ok(orderMobile.footer.top - orderMobile.content.bottom >= 12, `スマホ命令画面の枠と外側ボタンの隙間が標準モーダルより狭すぎます (${orderMobile.footer.top - orderMobile.content.bottom})`);
    assert.ok(orderMobile.rows.length === 0 || orderMobile.footer.top - orderMobile.rows[orderMobile.rows.length - 1].bottom <= 60, 'スマホ命令画面の本文と外側ボタンが不自然に離れています');
    assert.ok(orderMobile.content.scrollHeight <= orderMobile.content.clientHeight + 4, `スマホ命令画面の内部内容が枠を超えています (${orderMobile.content.scrollHeight} > ${orderMobile.content.clientHeight})`);
    assert.strictEqual(orderMobile.content.overflowY, 'hidden', 'スマホ命令画面はスクロール領域にしてはいけません');
    assert.ok(!orderMobile.text.includes('※'), '命令画面に不要な※注意書きが残っています');
    assert.ok(!orderMobile.text.includes('「敵対」'), '敵対の表示に不要な鉤括弧が残っています');

    console.log('✓ 国主評定 固定16:9/9:16・非スクロール visual/layout regression');
    console.log('  PC 16:9／スマホ9:16の固定画面内に、評定一覧・命令画面ともスクロールなしで収まることを確認しました');
}


async function validateCommandAndInterviewStates(cdp) {
    const html = fixtureHtml('command_interview_states.html');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await cdp.call('Runtime.evaluate', {
        expression: `document.open();document.write(${JSON.stringify(html)});document.close();true`,
        returnByValue: true,
        awaitPromise: true
    });
    await new Promise(resolve => setTimeout(resolve, 80));

    let result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const normal = document.getElementById('cmd-normal');
            const active = document.getElementById('cmd-active');
            const normalStyle = getComputedStyle(normal);
            const activeStyle = getComputedStyle(active);
            const arrow = getComputedStyle(active, '::after');
            const content = document.getElementById('interview-session-content');
            const footer = document.getElementById('interview-session-footer');
            const inline = document.querySelector('.interview-choice-btn');
            const inlineBox = document.getElementById('interview-session-inline-actions').getBoundingClientRect();
            const interviewModal = document.getElementById('interview-modal');
            const conversation = document.getElementById('interview-session-dialog');
            const conversationRect = conversation.getBoundingClientRect();
            const modalRect = interviewModal.getBoundingClientRect();
            const nameRect = document.getElementById('interview-session-dialog-name').getBoundingClientRect();
            const hintRect = document.getElementById('interview-session-hint').getBoundingClientRect();
            const summaryRect = document.getElementById('interview-session-summary-panel').getBoundingClientRect();
            const r = content.getBoundingClientRect();
            const fr = footer.getBoundingClientRect();
            const cs = getComputedStyle(content);
            return {
                normalBg: normalStyle.backgroundImage,
                activeBg: activeStyle.backgroundImage,
                activeShadow: activeStyle.boxShadow,
                activeArrowTop: arrow.borderTopColor,
                activeArrowRight: arrow.borderRightColor,
                rect: {width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom},
                footer: {top:fr.top,bottom:fr.bottom,left:fr.left,right:fr.right},
                footerOutside: footer.parentElement === document.getElementById('interview-modal') && !content.contains(footer),
                standardInsideButtons: content.querySelectorAll('.btn-primary, .btn-secondary, .btn-danger').length,
                inlineUsesDedicatedChoiceButton: inline && inline.classList.contains('interview-choice-btn') && !inline.classList.contains('daimyo-detail-action-btn'),
                inlineButtons: [...document.querySelectorAll('.interview-choice-btn')].map(b => { const br=b.getBoundingClientRect(); return ({width:br.width,height:br.height,left:br.left,right:br.right,top:br.top,bottom:br.bottom,bg:getComputedStyle(b).backgroundImage}); }),
                inlineBox: {top:inlineBox.top,bottom:inlineBox.bottom},
                conversation: {top:conversationRect.top,bottom:conversationRect.bottom},
                modal: {top:modalRect.top,bottom:modalRect.bottom},
                name: {top:nameRect.top,bottom:nameRect.bottom,left:nameRect.left},
                hint: {top:hintRect.top,bottom:hintRect.bottom}, summary: {top:summaryRect.top,bottom:summaryRect.bottom},
                overflowY: cs.overflowY,
                scrollHeight: content.scrollHeight,
                clientHeight: content.clientHeight
            };
        })()`,
        returnByValue: true
    });
    const pc = result.result.value;
    assert.notStrictEqual(pc.activeBg, pc.normalBg, 'PCの選択中親コマンドは通常状態と背景を明確に変える');
    assert.ok(pc.activeShadow.includes('rgb(212, 175, 55)') || pc.activeShadow.includes('rgba(212, 175, 55'), 'PCの選択中親コマンドは金帯を持つ');
    assert.strictEqual(pc.activeArrowTop, 'rgb(255, 215, 90)', '選択中の階層矢印を金色にする');
    assert.strictEqual(pc.activeArrowRight, 'rgb(255, 215, 90)', '選択中の階層矢印を金色にする');
    assert.strictEqual(pc.overflowY, 'hidden', 'PC面談枠をスクロール領域にしない');
    assert.ok(pc.scrollHeight <= pc.clientHeight + 3, 'PC面談内容が枠をはみ出している');
    assert.strictEqual(pc.footerOutside, true, 'PC面談の戻る/決定系ボタンは内容枠の外へ置く');
    assert.strictEqual(pc.standardInsideButtons, 0, 'PC面談の内容枠内に標準決定/キャンセルボタンを置かない');
    assert.strictEqual(pc.inlineUsesDedicatedChoiceButton, true, 'PC面談の会話選択肢は詳細画面ボタンを流用せず専用ボタンを使う');
    assert.strictEqual(pc.inlineButtons.length, 4, 'PC面談メニューは4選択肢を2×2で描画する');
    assert.ok(pc.inlineButtons.every(b => b.width >= 240 && b.height >= 38), 'PC面談の選択肢は戻るボタンに負けない十分な大きさを持つ');
    assert.ok(pc.inlineButtons.every(b => b.bg && b.bg !== 'none'), 'PC面談の選択肢は不透明な専用背景を持つ');
    assert.ok(pc.inlineButtons.every(b => b.bg.includes('rgb(88, 105, 121)')), 'PC面談の選択肢は緑の情報枠と分離した藍鉄系を使う');
    assert.ok(Math.abs(pc.inlineButtons[0].top - pc.inlineButtons[1].top) <= 1, 'PC面談の1・2個目は同じ上段へ置く');
    assert.ok(Math.abs(pc.inlineButtons[0].left - pc.inlineButtons[2].left) <= 1 && pc.inlineButtons[2].top > pc.inlineButtons[0].bottom, 'PC面談の3個目は2段目左へ置く');
    assert.ok(Math.abs(pc.inlineButtons[1].left - pc.inlineButtons[3].left) <= 1 && Math.abs(pc.inlineButtons[2].top - pc.inlineButtons[3].top) <= 1, 'PC面談の4個目は2段目右へ置き2×2にする');
    assert.ok(pc.inlineButtons[0].top >= pc.inlineBox.top + 1 && pc.inlineButtons[2].bottom <= pc.inlineBox.bottom - 1, 'PC面談の上下段ボタン枠を操作帯内で見切らせない');
    assert.ok(pc.rect.width >= 1000, `PC会話開始時も上部情報ウインドウの横幅を維持する (${pc.rect.width})`);
    assert.ok(pc.hint.bottom < pc.summary.top, 'PC面談の案内文が情報枠へかぶらない');
    assert.ok(pc.inlineBox.bottom <= pc.footer.top + 1, 'PC面談は選択肢の下に戻るボタンを置く');
    assert.ok(pc.footer.bottom < pc.conversation.top, 'PC面談の戻るボタンは下段会話より上へ置く');
    assert.ok(pc.conversation.top - pc.footer.bottom >= 10, `PC面談は戻るボタンと会話の間に余白を取る (${pc.conversation.top - pc.footer.bottom})`);
    assert.ok(pc.name.top < pc.conversation.top && pc.name.bottom > pc.conversation.top, 'PC面談の人物名は通常会話と同じく会話枠上辺へ重ねる');
    assert.ok(pc.modal.bottom - pc.conversation.bottom >= 19 && pc.modal.bottom - pc.conversation.bottom <= 21, `PC面談の会話枠は通常会話と同じく画面下端20px基準 (${pc.modal.bottom - pc.conversation.bottom})`);
    const pcUpperCenter = (pc.modal.top + pc.inlineBox.top) / 2;
    const pcContentCenter = (pc.rect.top + pc.rect.bottom) / 2;
    assert.ok(Math.abs(pcContentCenter - pcUpperCenter) <= 18, `PC面談の情報ウインドウは上側空間の中央付近に置く (${pcContentCenter} / ${pcUpperCenter})`);

    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 1, mobile: true });
    await cdp.call('Runtime.evaluate', {
        expression: `document.body.classList.remove('is-pc'); const g=document.getElementById('game-screen'); g.style.width='360px';g.style.height='640px';true`,
        returnByValue: true
    });
    await new Promise(resolve => setTimeout(resolve, 80));
    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const interviewModal = document.getElementById('interview-modal');
            const content = document.getElementById('interview-session-content');
            const footer = document.getElementById('interview-session-footer');
            const modalRect = interviewModal.getBoundingClientRect();
            const r = content.getBoundingClientRect();
            const fr = footer.getBoundingClientRect();
            const cs = getComputedStyle(content);
            const actionBox = document.getElementById('interview-session-inline-actions').getBoundingClientRect();
            const action = document.querySelector('.interview-choice-btn').getBoundingClientRect();
            const actionButtons = [...document.querySelectorAll('.interview-choice-btn')].map(b => { const br=b.getBoundingClientRect(); return ({left:br.left,top:br.top,bottom:br.bottom}); });
            const conversation = document.getElementById('interview-session-dialog').getBoundingClientRect();
            const name = document.getElementById('interview-session-dialog-name').getBoundingClientRect();
            const message = document.getElementById('interview-session-dialog-message').getBoundingClientRect();
            const hint = document.getElementById('interview-session-hint').getBoundingClientRect();
            const summary = document.getElementById('interview-session-summary-panel').getBoundingClientRect();
            const footerButton = footer.querySelector('button').getBoundingClientRect();
            const metaAlign = getComputedStyle(document.querySelector('.interview-session-meta-row')).textAlign;
            return {
                innerWidth: 360, innerHeight: 640,
                modal:{top:modalRect.top,bottom:modalRect.bottom},
                rect:{width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom},
                footer:{top:fr.top,bottom:fr.bottom,left:fr.left,right:fr.right},
                footerOutside:footer.parentElement === document.getElementById('interview-modal') && !content.contains(footer),
                standardInsideButtons:content.querySelectorAll('.btn-primary, .btn-secondary, .btn-danger').length,
                overflowY:cs.overflowY,
                scrollHeight:content.scrollHeight,
                clientHeight:content.clientHeight,
                actionHeight:action.height,
                actionButtons,
                actionTop:actionBox.top, actionBottom:actionBox.bottom,
                conversationTop:conversation.top, conversationBottom:conversation.bottom,
                nameTop:name.top, nameBottom:name.bottom,
                messageTop:message.top, metaAlign,
                hintBottom:hint.bottom, summaryTop:summary.top,
                footerButtonHeight:footerButton.height
            };
        })()`,
        returnByValue: true
    });
    const mobile = result.result.value;
    assert.ok(mobile.rect.left >= -1 && mobile.rect.right <= mobile.innerWidth + 1, 'スマホ面談枠が横にはみ出している');
    assert.ok(mobile.rect.top >= -1 && mobile.rect.bottom <= mobile.innerHeight + 1, 'スマホ面談枠が縦にはみ出している');
    assert.strictEqual(mobile.overflowY, 'hidden', 'スマホ面談枠をスクロール領域にしない');
    assert.ok(mobile.scrollHeight <= mobile.clientHeight + 3, 'スマホ面談内容が枠をはみ出している');
    assert.ok(mobile.actionHeight >= 27, 'スマホ面談内操作ボタンが小さすぎる');
    assert.ok(Math.abs(mobile.actionButtons[0].top - mobile.actionButtons[1].top) <= 1, 'スマホ面談の1・2個目も同じ上段へ置く');
    assert.ok(Math.abs(mobile.actionButtons[0].left - mobile.actionButtons[2].left) <= 1 && mobile.actionButtons[2].top > mobile.actionButtons[0].bottom, 'スマホ面談の3個目は2段目左へ置く');
    assert.ok(Math.abs(mobile.actionButtons[1].left - mobile.actionButtons[3].left) <= 1 && Math.abs(mobile.actionButtons[2].top - mobile.actionButtons[3].top) <= 1, 'スマホ面談の4個目は2段目右へ置き2×2にする');
    assert.ok(mobile.hintBottom < mobile.summaryTop, 'スマホ面談の「話したい内容」案内が情報枠へかぶらない');
    assert.ok(mobile.actionBottom <= mobile.footer.top + 1, 'スマホ面談は選択肢の下に戻るボタンを置く');
    assert.ok(mobile.footer.bottom < mobile.conversationTop, 'スマホ面談の戻るボタンは下段会話より上へ置く');
    assert.ok(mobile.conversationTop - mobile.footer.bottom >= 10, `スマホ面談は戻るボタンと会話の間に余白を取る (${mobile.conversationTop - mobile.footer.bottom})`);
    assert.ok(mobile.nameTop < mobile.conversationTop && mobile.nameBottom > mobile.conversationTop, 'スマホ面談の人物名は会話枠上辺へ重ねる');
    assert.ok(mobile.actionBottom <= mobile.messageTop + 1, '面談の会話選択肢は会話本文より上に置く');
    assert.ok(mobile.modal.bottom - mobile.conversationBottom >= 19 && mobile.modal.bottom - mobile.conversationBottom <= 21, `スマホ面談の会話枠は通常会話と同じく画面下端20px基準 (${mobile.modal.bottom - mobile.conversationBottom})`);
    assert.strictEqual(mobile.metaAlign, 'left', '面談相手の所在・身分・年齢は左揃えにする');
    assert.strictEqual(mobile.footerOutside, true, 'スマホ面談の戻る/決定系ボタンは内容枠の外へ置く');
    assert.strictEqual(mobile.standardInsideButtons, 0, 'スマホ面談の内容枠内に標準決定/キャンセルボタンを置かない');
    const mobileUpperCenter = (mobile.modal.top + mobile.actionTop) / 2;
    const mobileContentCenter = (mobile.rect.top + mobile.rect.bottom) / 2;
    assert.ok(Math.abs(mobileContentCenter - mobileUpperCenter) <= 18, `スマホ面談の情報ウインドウは上側空間の中央付近に置く (${mobileContentCenter} / ${mobileUpperCenter})`);
    assert.ok(mobile.footer.bottom <= mobile.innerHeight + 1, 'スマホ面談の外側ボタンが9:16画面からはみ出している');
    assert.ok(mobile.footerButtonHeight >= 36, 'スマホ面談の外側ボタンが小さすぎる');

    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const content = document.getElementById('interview-session-content');
            const footer = document.getElementById('interview-session-footer');
            const inline = document.getElementById('interview-session-inline-actions');
            const dialog = document.getElementById('interview-session-dialog');
            const before = {contentTop:content.getBoundingClientRect().top, contentHeight:content.getBoundingClientRect().height, dialogTop:dialog.getBoundingClientRect().top};
            inline.classList.add('hidden');
            footer.classList.add('hidden');
            const after = {contentTop:content.getBoundingClientRect().top, contentHeight:content.getBoundingClientRect().height, dialogTop:dialog.getBoundingClientRect().top, footerDisplay:getComputedStyle(footer).display, footerVisibility:getComputedStyle(footer).visibility};
            return {before, after};
        })()`,
        returnByValue: true
    });
    const fixedConversation = result.result.value;
    assert.ok(Math.abs(fixedConversation.before.contentTop - fixedConversation.after.contentTop) < 1, '選択肢/外側ボタンの有無で面談枠を上下移動させない');
    assert.ok(Math.abs(fixedConversation.before.contentHeight - fixedConversation.after.contentHeight) < 1, '選択肢/外側ボタンの有無で面談枠の高さを変えない');
    assert.ok(Math.abs(fixedConversation.before.dialogTop - fixedConversation.after.dialogTop) < 1, '選択肢の有無で下段会話を上下移動させない');
    assert.strictEqual(fixedConversation.after.footerDisplay, 'flex', '面談外側フッターは非表示時も予約領域を維持する');
    assert.strictEqual(fixedConversation.after.footerVisibility, 'hidden', '面談外側フッターは予約時に見えない');

    // 最も狭いスマホ9:16で、初回の面談相手選択14人（2列×7行）がスクロールなしで収まるか確認する。
    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const content = document.getElementById('interview-session-content');
            document.getElementById('interview-modal').classList.remove('interview-conversation-mode');
            content.classList.add('speaker-hidden');
            content.classList.remove('interview-conversation-active');
            document.getElementById('interview-session-summary-panel').classList.add('hidden');
            document.getElementById('interview-session-inline-actions').classList.add('hidden');
            document.getElementById('interview-session-dialog').classList.add('hidden');
            const pager = document.getElementById('interview-session-pager');
            pager.classList.remove('hidden');
            pager.innerHTML = '<button class=\"daimyo-detail-action-btn\">前へ</button><span class=\"interview-session-page-label\">1 / 3</span><button class=\"daimyo-detail-action-btn\">次へ</button>';
            const body = document.getElementById('interview-session-body');
            body.className = 'interview-session-body interview-session-list-view interviewer-list-view';
            body.innerHTML = '<div class=\"interview-session-list-tools\"><input class=\"interview-session-search\" placeholder=\"名前で探す\"><select class=\"interview-session-sort-select\"><option>身分</option></select><button class=\"daimyo-detail-action-btn interview-session-sort-direction\">降順</button><span class=\"interview-session-list-count\">32人</span></div><div class=\"interview-session-person-grid\">' + Array.from({length:14},(_,i)=>'<button class=\"interview-session-person\"><span class=\"interview-session-person-face\"></span><span class=\"interview-session-person-text\"><span class=\"interview-session-person-name\">武将'+(i+1)+'</span><span class=\"interview-session-person-rank\">武将</span></span></button>').join('') + '</div>';
            const cr = content.getBoundingClientRect();
            const br = body.getBoundingClientRect();
            const gr = body.querySelector('.interview-session-person-grid').getBoundingClientRect();
            const tr = body.querySelector('.interview-session-list-tools').getBoundingClientRect();
            return {
                contentScroll: content.scrollHeight, contentClient: content.clientHeight,
                bodyScroll: body.scrollHeight, bodyClient: body.clientHeight,
                contentBottom: cr.bottom, bodyBottom: br.bottom, gridBottom: gr.bottom, toolsHeight: tr.height,
                firstHeight: body.querySelector('.interview-session-person')?.getBoundingClientRect().height || 0,
                headerBottom: document.querySelector('.interview-session-header').getBoundingClientRect().bottom, toolsTop: tr.top,
                sortWritingMode: getComputedStyle(body.querySelector('.interview-session-sort-direction')).writingMode,
                sortWhiteSpace: getComputedStyle(body.querySelector('.interview-session-sort-direction')).whiteSpace,
                overflowY: getComputedStyle(body).overflowY, width: cr.width, left: cr.left, right: cr.right
            };
        })()`,
        returnByValue: true
    });
    const mobileList = result.result.value;
    assert.ok(mobileList.width >= 346 && mobileList.left >= 5 && mobileList.right <= 355, `スマホ武将選択は9:16論理画面の左右を広く使う (${mobileList.width}, ${mobileList.left}-${mobileList.right})`);
    assert.strictEqual(mobileList.overflowY, 'hidden', 'スマホ面談一覧をスクロール領域にしない');
    assert.ok(mobileList.contentScroll <= mobileList.contentClient + 3, '検索・ソート付きスマホ面談一覧が内容枠をはみ出している');
    assert.ok(mobileList.bodyScroll <= mobileList.bodyClient + 3, '検索・ソート付きスマホ武将一覧が内部ではみ出している');
    assert.ok(mobileList.gridBottom <= mobileList.bodyBottom + 1, 'スマホ面談の初回14人（7行）武将カードが一覧領域からはみ出している');
    assert.ok(mobileList.toolsHeight >= 28, 'スマホ面談の検索・ソート帯が潰れている');
    assert.ok(mobileList.headerBottom <= mobileList.toolsTop - 2, `スマホ面談の案内文と検索帯が重なっている (${mobileList.headerBottom}/${mobileList.toolsTop})`);
    assert.strictEqual(mobileList.sortWritingMode, 'horizontal-tb', 'スマホ面談の昇順/降順は横書きに固定する');
    assert.strictEqual(mobileList.sortWhiteSpace, 'nowrap', 'スマホ面談の昇順/降順を途中改行しない');

    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const content = document.getElementById('interview-session-content');
            content.classList.remove('speaker-hidden');
            document.getElementById('interview-session-summary-panel').classList.remove('hidden');
            const body = document.getElementById('interview-session-body');
            body.className = 'interview-session-body interview-session-list-view target-list-view';
            body.innerHTML = '<div class="interview-session-list-tools"><input class="interview-session-search" placeholder="名前で探す"><select class="interview-session-sort-select"><option>身分</option></select><button class="daimyo-detail-action-btn interview-session-sort-direction">降順</button><span class="interview-session-list-count">24人</span></div><div class="interview-session-person-grid">' + Array.from({length:10},(_,i)=>'<button class="interview-session-person"><span class="interview-session-person-face"></span><span class="interview-session-person-text"><span class="interview-session-person-name">武将'+(i+1)+'</span><span class="interview-session-person-rank">武将</span></span></button>').join('') + '</div>';
            const br = body.getBoundingClientRect();
            const gr = body.querySelector('.interview-session-person-grid').getBoundingClientRect();
            const cards = Array.from(body.querySelectorAll('.interview-session-person'));
            const first = cards[0] ? cards[0].getBoundingClientRect() : null;
            const last = cards[cards.length - 1] ? cards[cards.length - 1].getBoundingClientRect() : null;
            return {
                bodyScroll:body.scrollHeight, bodyClient:body.clientHeight, bodyBottom:br.bottom, gridBottom:gr.bottom,
                firstHeight:first ? first.height : 0, lastBottom:last ? last.bottom : 0, remaining:last ? br.bottom - last.bottom : 0,
                summaryHeight: document.getElementById('interview-session-summary-panel').getBoundingClientRect().height
            };
        })()`,
        returnByValue: true
    });
    const mobileTargetList = result.result.value;
    assert.ok(mobileTargetList.bodyScroll <= mobileTargetList.bodyClient + 3, 'スマホの他者選択10人一覧が内部ではみ出している');
    assert.ok(mobileTargetList.gridBottom <= mobileTargetList.bodyBottom + 1, 'スマホの他者選択10人カードを一覧下端に収める');
    assert.ok(mobileTargetList.lastBottom <= mobileTargetList.bodyBottom + 1, 'スマホの他者選択5行目が一覧下端からはみ出している');
    assert.ok(mobileTargetList.firstHeight >= 40, 'スマホの他者選択カードが5行化で潰れすぎている');
    assert.ok(mobileTargetList.summaryHeight >= mobileList.firstHeight * 1.8 && mobileTargetList.summaryHeight <= mobileList.firstHeight * 2.3, `スマホ他者選択の情報欄は通常カード約2行分を使う (${mobileTargetList.summaryHeight}/${mobileList.firstHeight})`);

    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            document.body.classList.add('is-pc');
            const g=document.getElementById('game-screen'); g.style.width='1280px'; g.style.height='720px';
            const content = document.getElementById('interview-session-content');
            content.classList.add('speaker-hidden');
            document.getElementById('interview-session-summary-panel').classList.add('hidden');
            const body = document.getElementById('interview-session-body');
            body.className = 'interview-session-body interview-session-list-view interviewer-list-view';
            body.innerHTML = '<div class="interview-session-list-tools"><input class="interview-session-search" placeholder="名前で探す"><select class="interview-session-sort-select"><option>身分</option></select><button class="daimyo-detail-action-btn interview-session-sort-direction">降順</button><span class="interview-session-list-count">30人</span></div><div class="interview-session-person-grid">' + Array.from({length:20},(_,i)=>'<button class="interview-session-person"><span class="interview-session-person-face"></span><span class="interview-session-person-text"><span class="interview-session-person-name">武将'+(i+1)+'</span><span class="interview-session-person-rank">武将</span></span></button>').join('') + '</div>';
            const cr=content.getBoundingClientRect(), br=body.getBoundingClientRect(), gr=body.querySelector('.interview-session-person-grid').getBoundingClientRect();
            const cards=[...body.querySelectorAll('.interview-session-person')].map(el=>el.getBoundingClientRect()); return {contentScroll:content.scrollHeight,contentClient:content.clientHeight,bodyScroll:body.scrollHeight,bodyClient:body.clientHeight,bodyBottom:br.bottom,gridBottom:gr.bottom,contentBottom:cr.bottom,contentWidth:cr.width, firstWidth:cards[0]?.width||0, fifthTop:cards[4]?.top||0, firstTop:cards[0]?.top||0};
        })()`,
        returnByValue: true
    });
    const pcList = result.result.value;
    assert.ok(pcList.contentScroll <= pcList.contentClient + 3, 'PC面談20人（4列×5行）一覧が内容枠をはみ出している');
    assert.ok(pcList.bodyScroll <= pcList.bodyClient + 3, 'PC面談20人一覧が内部ではみ出している');
    assert.ok(pcList.gridBottom <= pcList.bodyBottom + 1, 'PC面談20人カードを一覧下端に収める');
    assert.ok(Math.abs(pcList.contentWidth - pc.rect.width) <= 1, `PC面談の武将選択時と個別会話時で上部枠幅を統一する (${pcList.contentWidth}/${pc.rect.width})`);
    assert.ok(pcList.fifthTop > pcList.firstTop + 10, 'PC通常面談一覧は4列で折り返す');

    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const content=document.getElementById('interview-session-content');
            content.classList.remove('speaker-hidden');
            const summary=document.getElementById('interview-session-summary-panel'); summary.classList.remove('hidden');
            const body=document.getElementById('interview-session-body');
            body.className='interview-session-body interview-session-list-view target-list-view';
            body.innerHTML='<div class="interview-session-list-tools"><input class="interview-session-search"><select class="interview-session-sort-select"><option>身分</option></select><button class="daimyo-detail-action-btn interview-session-sort-direction">降順</button><span class="interview-session-list-count">30人</span></div><div class="interview-session-person-grid">'+Array.from({length:15},(_,i)=>'<button class="interview-session-person"><span class="interview-session-person-face"></span><span class="interview-session-person-text"><span class="interview-session-person-name">武将'+(i+1)+'</span><span class="interview-session-person-rank">武将</span></span></button>').join('')+'</div>';
            const sr=summary.getBoundingClientRect(), cards=[...body.querySelectorAll('.interview-session-person')].map(el=>el.getBoundingClientRect());
            const stage=document.querySelector('.interview-session-stage').getBoundingClientRect();
            return {summaryWidth:sr.width, firstWidth:cards[0]?.width||0, firstLeft:cards[0]?.left||0, stageLeft:stage.left, fourthTop:cards[3]?.top||0, firstTop:cards[0]?.top||0};
        })()`, returnByValue:true
    });
    const pcTarget=result.result.value;
    assert.ok(Math.abs(pcTarget.summaryWidth - pcTarget.firstWidth) <= 12, `PC他者選択の左情報列と候補カード列幅を揃える (${pcTarget.summaryWidth}/${pcTarget.firstWidth})`);
    assert.ok(Math.abs(pcTarget.firstLeft - pcTarget.stageLeft) <= 1, 'PC他者選択は左情報1列の右隣から候補を開始する');
    assert.ok(pcTarget.fourthTop > pcTarget.firstTop + 10, 'PC他者選択は右側3列で折り返す');

    console.log('✓ PC入れ子コマンド選択状態・面談下端会話・中央情報枠・スマホ全幅一覧 visual regression');
}

async function validateFloatingStatusLayout(cdp) {
    const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="map-wrapper"><div id="map-floating-status"><div id="mobile-floating-info"><div class="floating-time">1560年 5月</div></div><div id="mobile-floating-market"><div class="floating-market">浪人 12人</div><div class="floating-market">米相場＝2.0</div></div></div></div></body></html>`;

    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    let result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            document.open();document.write(${JSON.stringify(html)});document.close();
            document.body.classList.add('is-pc');
            const map = document.getElementById('map-wrapper');
            map.style.position='relative'; map.style.width='1280px'; map.style.height='720px';
            const boxes=[...document.querySelectorAll('.floating-time,.floating-market')].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,text:el.textContent};});
            const group=document.getElementById('map-floating-status').getBoundingClientRect();
            const mr=map.getBoundingClientRect();
            return {boxes, group:{left:group.left,right:group.right,top:group.top}, map:{left:mr.left,right:mr.right,top:mr.top}};
        })()`,
        returnByValue: true,
        awaitPromise: true
    });
    const pc = result.result.value;
    assert.strictEqual(pc.boxes.length, 3, 'PC上部表示は年月・浪人・米相場の3項目');
    approx(pc.boxes[1].left - pc.boxes[0].right, 15, 0.6, 'PC 年月↔浪人 gap');
    approx(pc.boxes[2].left - pc.boxes[1].right, 15, 0.6, 'PC 浪人↔米相場 gap');
    approx(pc.map.right - pc.group.right, 30, 0.6, 'PC 上部情報グループの右余白');
    assert.ok(pc.boxes[0].right < pc.boxes[1].left && pc.boxes[1].right < pc.boxes[2].left, 'PC上部3項目が重ならない');

    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 1, mobile: true });
    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            document.body.classList.remove('is-pc');
            const map=document.getElementById('map-wrapper'); map.style.width='360px'; map.style.height='640px';
            const info=document.getElementById('mobile-floating-info').getBoundingClientRect();
            const market=document.getElementById('mobile-floating-market').getBoundingClientRect();
            const mr=map.getBoundingClientRect();
            return {info:{left:info.left,bottom:info.bottom},market:{top:market.top,right:market.right},map:{left:mr.left,right:mr.right,top:mr.top,bottom:mr.bottom}};
        })()`,
        returnByValue: true
    });
    const mobile = result.result.value;
    approx(mobile.info.left - mobile.map.left, 10, 0.6, 'スマホ年月の左余白を維持');
    approx(mobile.map.bottom - mobile.info.bottom, 20, 0.6, 'スマホ年月の下余白を維持');
    approx(mobile.market.top - mobile.map.top, 10, 0.6, 'スマホ浪人・相場の上余白を維持');
    approx(mobile.map.right - mobile.market.right, 10, 0.6, 'スマホ浪人・相場の右余白を維持');
    console.log('✓ PC上部年月・浪人・米相場 flex-gap / スマホ配置維持 visual regression');
}

async function validateEndingAndWatchStates(cdp) {
    const html = fixtureHtml('ending_watch_states.html');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
    await cdp.call('Runtime.evaluate', {
        expression: `document.open();document.write(${JSON.stringify(html)});document.close();true`,
        returnByValue: true,
        awaitPromise: true
    });
    await new Promise(resolve => setTimeout(resolve, 80));

    let result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const screen = document.getElementById('game-screen').getBoundingClientRect();
            const notice = document.getElementById('watch-return-reserved-notice').getBoundingClientRect();
            const ending = getComputedStyle(document.getElementById('ending-screen'));
            const btn = document.getElementById('under-button').getBoundingClientRect();
            return {screen:{top:screen.top,bottom:screen.bottom,left:screen.left,right:screen.right},notice:{top:notice.top,bottom:notice.bottom,left:notice.left,right:notice.right},pointerEvents:ending.pointerEvents,btn:{x:(btn.left+btn.right)/2,y:(btn.top+btn.bottom)/2}};
        })()`,
        returnByValue: true
    });
    const state = result.result.value;
    assert.ok(state.notice.top >= state.screen.top && state.notice.bottom <= state.screen.bottom, '観戦帰還予約は黒帯ではなくgame-screen内に収める');
    assert.ok(state.notice.left >= state.screen.left && state.notice.right <= state.screen.right, '観戦帰還予約はgame-screen横幅からはみ出さない');
    assert.strictEqual(state.pointerEvents, 'auto', '透明な暗転開始直後でもending-screenが入力を捕捉する');

    await cdp.call('Input.dispatchMouseEvent', { type:'mousePressed', x:state.btn.x, y:state.btn.y, button:'left', clickCount:1 });
    await cdp.call('Input.dispatchMouseEvent', { type:'mouseReleased', x:state.btn.x, y:state.btn.y, button:'left', clickCount:1 });
    await new Promise(resolve => setTimeout(resolve, 30));
    result = await cdp.call('Runtime.evaluate', { expression:'window.__underClicks', returnByValue:true });
    assert.strictEqual(result.result.value, 0, '暗転レイヤーが透明な開始フレームでも背面ボタンを押せてはいけない');
    console.log('✓ game-over input guard / watch-return logical-screen visual regression');
}


async function validateGuideLayout(cdp) {
    const html = fixtureHtml('guide.html');
    const loadAt = async (width, height, mobile, isPc) => {
        await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
        await cdp.call('Runtime.evaluate', {
            expression: `(() => {
                document.open();document.write(${JSON.stringify(html)});document.close();
                document.body.classList.toggle('is-pc', ${isPc});
                const screen = document.getElementById('game-screen');
                const windowW = ${width}, windowH = ${height};
                let canvasW, canvasH, scale;
                if (${isPc}) {
                    canvasW = 1280; canvasH = 720; scale = Math.min(windowW / canvasW, windowH / canvasH);
                } else {
                    const targetRatio = 9 / 16, currentRatio = windowW / windowH;
                    let finalW, finalH;
                    if (currentRatio > targetRatio) { finalH = windowH; finalW = windowH * targetRatio; }
                    else { finalW = windowW; finalH = windowW / targetRatio; }
                    const minMobileWidth = 360;
                    canvasW = finalW; canvasH = finalH; scale = 1;
                    if (finalW < minMobileWidth) { canvasW = minMobileWidth; canvasH = minMobileWidth / targetRatio; scale = finalW / minMobileWidth; }
                }
                screen.style.width = canvasW + 'px'; screen.style.height = canvasH + 'px';
                screen.style.position = 'absolute'; screen.style.left = ((windowW - canvasW * scale) / 2) + 'px';
                screen.style.top = ((windowH - canvasH * scale) / 2) + 'px'; screen.style.transformOrigin = 'top left';
                screen.style.transform = Math.abs(scale - 1) < 0.000001 ? 'none' : 'scale(' + scale + ')'; screen.style.overflow = 'hidden';
                return true;
            })()`, returnByValue: true, awaitPromise: true
        });
        await new Promise(resolve => setTimeout(resolve, 80));
        const result = await cdp.call('Runtime.evaluate', {
            expression: `(() => {
                const screen = document.getElementById('game-screen').getBoundingClientRect();
                const contentEl = document.querySelector('.guide-content');
                const content = contentEl.getBoundingClientRect();
                const nav = document.querySelector('.guide-nav');
                const article = document.querySelector('.guide-article');
                const lead = document.querySelector('.guide-article-lead');
                const commandList = document.querySelector('.guide-command-list');
                const commandTopBefore = commandList.getBoundingClientRect().top;
                const firstOverview = document.querySelector('.guide-article-body .guide-section p');
                if (firstOverview) firstOverview.textContent += ' 追加の説明は本文側へ入るため、見出し下の項目一覧位置には影響しません。';
                const commandTopAfter = commandList.getBoundingClientRect().top;

                const guideLayoutRect = document.querySelector('.guide-layout').getBoundingClientRect();
                const guideFooter = document.querySelector('#guide-modal .modal-footer');
                const guideClose = guideFooter.querySelector('.btn-secondary').getBoundingClientRect();
                const guideGap = guideClose.top - guideLayoutRect.bottom;

                document.getElementById('guide-modal').classList.add('hidden');
                const scenarioModal = document.getElementById('scenario-modal');
                scenarioModal.classList.remove('hidden');
                const scenarioDesc = document.getElementById('scenario-desc-box');
                scenarioDesc.style.display = 'flex';
                const scenarioContentEl = scenarioModal.querySelector('.start-content');
                const scenarioListEl = document.getElementById('scenario-list');
                const scenarioFooter = scenarioModal.querySelector('.modal-footer');

                const captureScenarioLayout = () => {
                    const scenarioContent = scenarioContentEl.getBoundingClientRect();
                    const scenarioListRect = scenarioListEl.getBoundingClientRect();
                    const scenarioDescRect = scenarioDesc.getBoundingClientRect();
                    const scenarioClose = scenarioFooter.querySelector('.btn-secondary').getBoundingClientRect();
                    const scenarioMainBottom = Math.max(scenarioListRect.bottom, scenarioDescRect.bottom);
                    const cards = [...scenarioListEl.querySelectorAll('.clan-btn')].map(el => {
                        const r = el.getBoundingClientRect();
                        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
                    });
                    return {
                        gap: scenarioClose.top - scenarioMainBottom,
                        content:{left:scenarioContent.left,top:scenarioContent.top,right:scenarioContent.right,bottom:scenarioContent.bottom,clientHeight:scenarioContentEl.clientHeight,scrollHeight:scenarioContentEl.scrollHeight},
                        list:{clientHeight:scenarioListEl.clientHeight,scrollHeight:scenarioListEl.scrollHeight,clientWidth:scenarioListEl.clientWidth,scrollWidth:scenarioListEl.scrollWidth},
                        cards
                    };
                };

                const scenarioMany = captureScenarioLayout();

                // 4件以下の従来密度も同じfixtureで再確認する。
                [...scenarioListEl.children].slice(4).forEach(el => el.remove());
                scenarioContentEl.classList.remove('scenario-layout-many');
                scenarioListEl.classList.remove('scenario-list-many');
                const scenarioFew = captureScenarioLayout();

                return {
                    screen:{left:screen.left,top:screen.top,right:screen.right,bottom:screen.bottom},
                    content:{left:content.left,top:content.top,right:content.right,bottom:content.bottom,clientHeight:contentEl.clientHeight,scrollHeight:contentEl.scrollHeight},
                    nav:{clientHeight:nav.clientHeight,scrollHeight:nav.scrollHeight},
                    article:{clientHeight:article.clientHeight,scrollHeight:article.scrollHeight},
                    leadExists: !!lead, commandTopBefore, commandTopAfter,
                    guideGap, scenarioMany, scenarioFew
                };
            })()`, returnByValue: true
        });
        return result.result.value;
    };

    for (const cfg of [
        { width: 1280, height: 720, mobile: false, isPc: true, label: 'PC' },
        { width: 390, height: 844, mobile: true, isPc: false, label: 'mobile' },
        { width: 820, height: 1180, mobile: true, isPc: false, label: 'tablet-mobile' }
    ]) {
        const state = await loadAt(cfg.width, cfg.height, cfg.mobile, cfg.isPc);
        assert.ok(state.content.left >= state.screen.left - 1 && state.content.right <= state.screen.right + 1, `${cfg.label}: 指南書が横にはみ出す`);
        assert.ok(state.content.top >= state.screen.top - 1 && state.content.bottom <= state.screen.bottom + 1, `${cfg.label}: 指南書が縦にはみ出す`);
        assert.ok(state.content.scrollHeight <= state.content.clientHeight + 1, `${cfg.label}: 指南書外枠がスクロールを要求する`);
        assert.ok(state.nav.scrollHeight <= state.nav.clientHeight + 1, `${cfg.label}: 指南書ナビが見切れる`);
        assert.ok(state.article.scrollHeight <= state.article.clientHeight + 1, `${cfg.label}: 指南書記事が見切れる`);
        assert.strictEqual(state.leadExists, false, `${cfg.label}: 見出し下の説明専用エリアを残さない`);
        assert.ok(Math.abs(state.commandTopBefore - state.commandTopAfter) <= 0.5, `${cfg.label}: 本文の説明量でコマンド一覧の位置が動く`);
        for (const [density, scenario] of [['9件', state.scenarioMany], ['4件', state.scenarioFew]]) {
            assert.ok(scenario.content.left >= state.screen.left - 1 && scenario.content.right <= state.screen.right + 1, `${cfg.label}/${density}: シナリオ選択が横にはみ出す`);
            assert.ok(scenario.content.top >= state.screen.top - 1 && scenario.content.bottom <= state.screen.bottom + 1, `${cfg.label}/${density}: シナリオ選択が縦にはみ出す`);
            assert.ok(scenario.content.scrollHeight <= scenario.content.clientHeight + 1, `${cfg.label}/${density}: シナリオ選択外枠がスクロールを要求する`);
            assert.ok(scenario.list.scrollHeight <= scenario.list.clientHeight + 1, `${cfg.label}/${density}: シナリオ一覧が縦スクロールを要求する (${scenario.list.scrollHeight}/${scenario.list.clientHeight})`);
            assert.ok(scenario.list.scrollWidth <= scenario.list.clientWidth + 1, `${cfg.label}/${density}: シナリオ一覧が横スクロールを要求する`);
            assert.ok(Math.abs(state.guideGap - scenario.gap) <= 1.5, `${cfg.label}/${density}: 指南書とシナリオ選択で閉じるボタン上の余白感が揃っていない (${state.guideGap} vs ${scenario.gap})`);
        }
        assert.strictEqual(state.scenarioMany.cards.length, 9, `${cfg.label}: 増加確認用は実シナリオ1件＋ダミー8件を表示する`);
        assert.strictEqual(state.scenarioFew.cards.length, 4, `${cfg.label}: 少数時の4件確認ができる`);
        assert.ok(Math.abs(state.scenarioMany.cards[0].top - state.scenarioMany.cards[1].top) <= 3, `${cfg.label}: 5件以上では先頭2件を同じ行に置いて複数列化する`);
        assert.ok(state.scenarioFew.cards[1].top - state.scenarioFew.cards[0].top >= 30, `${cfg.label}: 4件以下では先頭2件を縦に並べて一列表示を保つ`);
    }
    console.log('✓ 指南書 PC16:9 / スマホ9:16・非スクロール / シナリオ・観戦footer余白 visual/layout regression');
}


async function validateWarAptitudeLayout(cdp) {
    const html = fixtureHtml('war_aptitude_layout.html');
    for (const cfg of [
        { width: 1280, height: 720, mobile: false, isPc: true, label: 'PC' },
        { width: 390, height: 844, mobile: true, isPc: false, label: 'mobile' }
    ]) {
        await cdp.call('Emulation.setDeviceMetricsOverride', { width: cfg.width, height: cfg.height, deviceScaleFactor: 1, mobile: cfg.mobile });
        const result = await cdp.call('Runtime.evaluate', {
            expression: `(() => {
                document.open();document.write(${JSON.stringify(html)});document.close();
                document.body.classList.toggle('is-pc', ${cfg.isPc});
                const screen = document.getElementById('game-screen');
                const windowW = ${cfg.width}, windowH = ${cfg.height};
                let canvasW, canvasH, scale;
                if (${cfg.isPc}) { canvasW=1280; canvasH=720; scale=Math.min(windowW/canvasW,windowH/canvasH); }
                else {
                    const targetRatio=9/16, currentRatio=windowW/windowH; let finalW,finalH;
                    if(currentRatio>targetRatio){finalH=windowH;finalW=windowH*targetRatio;}else{finalW=windowW;finalH=windowW/targetRatio;}
                    const minMobileWidth=360; canvasW=finalW; canvasH=finalH; scale=1;
                    if(finalW<minMobileWidth){canvasW=minMobileWidth;canvasH=minMobileWidth/targetRatio;scale=finalW/minMobileWidth;}
                }
                screen.style.width=canvasW+'px';screen.style.height=canvasH+'px';screen.style.position='absolute';
                screen.style.left=((windowW-canvasW*scale)/2)+'px';screen.style.top=((windowH-canvasH*scale)/2)+'px';
                screen.style.transformOrigin='top left';screen.style.transform=Math.abs(scale-1)<0.000001?'none':'scale('+scale+')';
                const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,cx:(r.left+r.right)/2,cy:(r.top+r.bottom)/2};};
                const rowEls=[1,2,3,4,5].map(i=>document.getElementById('row-'+i));
                const rows=rowEls.map(rect);
                const content=rect(document.querySelector('#unit-divide-modal .modal-content'));
                const list=rect(document.getElementById('divide-list'));
                const visibleSelector = row => [...row.querySelectorAll('.troop-type-selector')].find(el => getComputedStyle(el).display !== 'none');
                const selectors=rowEls.map(row=>visibleSelector(row));
                const selectorRects=selectors.map(rect);
                const buttonCounts=selectors.map(sel=>sel.querySelectorAll('button.troop-type-btn').length);
                const firstButtons=[...selectors[0].querySelectorAll('button.troop-type-btn')].map(rect);
                const cardInfos=rowEls.map(row=>row.querySelector('.divide-card-info')).filter(el=>el && getComputedStyle(el).display !== 'none');
                const cardInfoRects=cardInfos.map(rect);
                const firstPcAptLabels=cardInfos[0] ? [...cardInfos[0].querySelectorAll('.troop-aptitude-label')].map(el=>el.textContent.trim()) : [];
                const firstPcGrades=cardInfos[0] ? cardInfos[0].querySelectorAll('.grade-container').length : 0;
                const firstAbilities=cardInfos[0] ? [...cardInfos[0].querySelectorAll('.divide-info-label')].map(el=>el.textContent.trim()) : [];
                const seaPcSelector=rowEls[3].querySelector('.is-pc-selector');
                const seaPcButtons=seaPcSelector && getComputedStyle(seaPcSelector).display !== 'none' ? seaPcSelector.querySelectorAll('button').length : 0;
                const firstHeader=rowEls[0].querySelector('.divide-row-header');
                const mobileButton=firstHeader.querySelector('.troop-type-cycle-btn');
                const mobileName=firstHeader.querySelector('.slider-row-label');
                const mobileSummary=firstHeader.querySelector('.troop-aptitude-summary');
                const firstShortcut=rowEls[0].querySelector('.qty-shortcut-btn');
                const seaSummary=rowEls[3].querySelector('.troop-aptitude-summary');
                const mobileLabels=mobileSummary ? [...mobileSummary.querySelectorAll('.troop-aptitude-label')].map(el=>el.textContent.trim()) : [];
                const seaMobileLabels=seaSummary ? [...seaSummary.querySelectorAll('.troop-aptitude-label')].map(el=>el.textContent.trim()) : [];
                const infoEl=document.getElementById('fw-unit-info');
                const info=rect(infoEl);
                const infoLabels=[...document.querySelectorAll('#fw-unit-info .fw-unit-aptitude-label')].map(el=>el.textContent.trim());
                const infoType=document.querySelector('#fw-unit-info .fw-unit-type-value');
                const infoName=document.querySelector('#fw-unit-info .fw-unit-name');
                const infoAffiliation=document.querySelector('#fw-unit-info .fw-unit-affiliation');
                if(infoType) infoType.textContent='鉄砲';
                if(infoName) infoName.textContent='とても長い武将姓名表示確認用';
                if(infoAffiliation) infoAffiliation.textContent='とても長い勢力名称表示確認用';
                const infoAfterContentChange=rect(infoEl);
                return {
                    rows, content, list, selectorRects, buttonCounts, firstButtons, cardInfoRects,
                    firstPcAptLabels, firstPcGrades, firstAbilities, seaPcButtons,
                    mobileButton: mobileButton && getComputedStyle(mobileButton).display !== 'none' ? rect(mobileButton) : null,
                    mobileName: mobileName ? rect(mobileName) : null,
                    mobileSummary: mobileSummary && getComputedStyle(mobileSummary).display !== 'none' ? rect(mobileSummary) : null,
                    firstShortcut: firstShortcut ? rect(firstShortcut) : null,
                    mobileLabels, seaMobileLabels, info, infoLabels, infoAfterContentChange,
                    listClientHeight: document.getElementById('divide-list').clientHeight,
                    listScrollHeight: document.getElementById('divide-list').scrollHeight
                };
            })()`, returnByValue: true, awaitPromise: true
        });
        const st=result.result.value;
        assert.ok(st.content.left >= -1 && st.content.right <= cfg.width + 1, `${cfg.label}: 編成モーダルが横にはみ出す`);
        assert.ok(st.selectorRects.every((sel, i) => sel.right <= st.rows[i].right + 1 && sel.left >= st.rows[i].left - 1), `${cfg.label}: 兵科欄が武将行からはみ出す`);
        assert.ok(st.info.right <= st.content.right + 1, `${cfg.label}: 適性付き個別部隊情報が画面外へはみ出す`);
        assert.deepStrictEqual(st.infoLabels, ['足軽','馬術','弓術','砲術','操船'], `${cfg.label}: 個別部隊情報は全適性を固定順で表示する`);
        assert.ok(Math.abs(st.info.width - st.infoAfterContentChange.width) <= 0.5 && Math.abs(st.info.height - st.infoAfterContentChange.height) <= 0.5, `${cfg.label}: 兵科・武将名・勢力名の長さで個別部隊情報の寸法を変えない`);

        if (cfg.isPc) {
            assert.ok(Math.abs(st.rows[0].left - st.rows[1].left) <= 1 && Math.abs(st.rows[1].left - st.rows[2].left) <= 1, 'PC: 先頭3人を左列へ配置する');
            assert.ok(st.rows[3].left > st.rows[0].right, 'PC: 4人目を右列へ配置する');
            assert.ok(Math.abs(st.rows[3].left - st.rows[4].left) <= 1, 'PC: 4・5人目を同じ右列へ配置する');
            assert.ok(Math.abs(st.rows[0].top - st.rows[3].top) <= 1, 'PC: 右列1人目は左列1人目と同じ高さに置く');
            assert.ok(Math.abs(st.rows[1].top - st.rows[4].top) <= 1, 'PC: 右列2人目は左列2人目と同じ高さに置く');
            assert.ok(st.rows.every(r=>r.height >= 108), 'PC: 各武将を十分な高さのカードとして表示する');
            assert.ok(st.rows[2].bottom <= st.list.bottom + 1, 'PC: 3段のカードが縦に収まる');
            assert.strictEqual(st.buttonCounts[0], 3, 'PC: 陸戦は3兵科ボタンを直接選択できる');
            assert.strictEqual(st.seaPcButtons, 2, 'PC海戦: 選択可能な足軽・鉄砲の2ボタンだけ表示する');
            assert.ok(st.firstButtons.length === 3 && Math.max(...st.firstButtons.map(x=>x.width)) - Math.min(...st.firstButtons.map(x=>x.width)) <= 1, 'PC: 兵科変更ボタンの幅を揃える');
            assert.ok(st.firstAbilities.includes('統率') && st.firstAbilities.includes('武勇') && st.firstAbilities.includes('智謀'), 'PC: 統率・武勇・智謀を独立情報として表示する');
            assert.deepStrictEqual(st.firstPcAptLabels.slice(0,4), ['足軽','馬術','弓術','砲術'], 'PC: 適性名を正式名称で独立表示する');
            assert.ok(st.firstPcGrades >= 4, 'PC: 適性に共通ランク文字を使う');
            assert.ok(st.cardInfoRects.every((info,i)=>info.right <= st.rows[i].right + 1), 'PC: 情報欄がカード内に収まる');
        } else {
            assert.ok(st.buttonCounts.every(count => count === 1), 'mobile: 各武将の兵科ボタンは1個だけにする');
            assert.ok(st.mobileButton && st.mobileName && st.mobileSummary, 'mobile: 兵科・武将名・適性を同じヘッダーへ置く');
            assert.ok(st.mobileButton.right <= st.mobileName.left + 1, 'mobile: 兵科ボタンを武将名の左側へ置く');
            assert.ok(Math.abs(st.mobileButton.height - st.firstShortcut.height) <= 0.5 && Math.abs(st.mobileButton.width - st.firstShortcut.width) <= 0.5, 'mobile: 兵科ボタンを最小/半分/最大ボタンと同じ大きさにする');
            assert.ok(Math.abs(st.mobileButton.cy - st.mobileName.cy) <= 2 && Math.abs(st.mobileButton.cy - st.mobileSummary.cy) <= 2, 'mobile: 兵科・武将名・適性の縦位置を揃える');
            assert.deepStrictEqual(st.mobileLabels, ['足軽','弓術'], 'mobile: 適性名を省略しない');
            assert.ok(st.seaMobileLabels.includes('操船'), 'mobile海戦: 操船適性を同じ情報欄へ表示する');
            assert.ok(st.rows.every((row, i, arr) => i === 0 || row.top >= arr[i-1].bottom - 1), 'mobile: 武将行は縦一列を維持する');
        }
    }
    console.log('✓ 部隊編成 PC情報カード / スマホ左兵科＋正式適性名 visual/layout regression');
}



async function validateDialogConfirmPlacement(cdp) {
    const html = fixtureHtml('dialog_confirm.html');
    const cases = [
        { label:'PC', width:1280, height:720, mobile:false, isPc:true },
        { label:'mobile', width:360, height:640, mobile:true, isPc:false }
    ];

    for (const cfg of cases) {
        await cdp.call('Emulation.setDeviceMetricsOverride', { width:cfg.width, height:cfg.height, deviceScaleFactor:1, mobile:cfg.mobile });
        const result = await cdp.call('Runtime.evaluate', {
            expression: `(() => {
                document.open();document.write(${JSON.stringify(html)});document.close();
                document.body.classList.toggle('is-pc', ${cfg.isPc});
                const screen=document.getElementById('game-screen');
                screen.style.position='absolute';screen.style.left='0px';screen.style.top='0px';
                screen.style.width='${cfg.width}px';screen.style.height='${cfg.height}px';screen.style.overflow='hidden';
                const rect=(sel)=>{const r=document.querySelector(sel).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
                return {
                    content:rect('#dialog-modal .modal-content'),
                    footer:rect('#dialog-modal .modal-footer'),
                    body:rect('#dialog-modal .dialog-body-container'),
                    message:rect('#dialog-modal .message-area'),
                    name:rect('#dialog-left-name'),
                    ok:rect('#dialog-btn-ok'),
                    cancel:rect('#dialog-btn-cancel')
                };
            })()`,
            returnByValue: true,
            awaitPromise: true
        });
        const st=result.result.value;
        assert.ok(st.content.bottom >= cfg.height - 25 && st.content.bottom <= cfg.height + 1, `${cfg.label}: 下部会話枠を画面下端付近に置く`);
        assert.ok(st.footer.bottom <= st.content.top + 0.5, `${cfg.label}: 選択肢を会話枠より上に置く`);
        // 見た目の間隔はfooter下端→会話枠上端で測る。bodyには枠内paddingがあるため、
        // body.topを使うと実際の見た目より約7px広く計測される。
        const gap=st.content.top-st.footer.bottom;
        if (cfg.isPc) {
            approx(gap, 18, 1.5, 'PC: 名前札の張り出しを避ける会話専用18px間隔にする');
            assert.ok(st.footer.height >= 59, `PC: 標準footer寸法を維持する (${st.footer.height})`);
        } else {
            approx(gap, 18, 1.5, 'mobile: 名前札の張り出しを避ける会話専用18px間隔にする');
            assert.ok(st.footer.height >= 59, `mobile: 他の標準モーダルと同じ60px操作列を維持する (${st.footer.height})`);
            assert.ok(st.footer.bottom >= cfg.height * 0.70, `mobile: はい/いいえ操作列を下部会話の近傍へ置く (${st.footer.bottom})`);
            assert.ok(st.ok.bottom <= st.name.top + 0.5 && st.cancel.bottom <= st.name.top + 0.5, `mobile: はい/いいえを武将名札へ重ねない (button=${Math.max(st.ok.bottom, st.cancel.bottom)}, name=${st.name.top})`);
            assert.ok(st.message.top >= cfg.height * 0.75, `mobile: 本文は従来どおり下部へ置く (${st.message.top})`);
        }
    }
    console.log('✓ 会話確認 はい/いいえ PC維持 / スマホ下部配置 visual/layout regression');
}

async function validateFieldWarFullscreen(cdp) {
    const html = fixtureHtml('field_war_fullscreen.html');
    const cases = [
        { label:'PC', width:1280, height:720, mobile:false, isPc:true },
        { label:'mobile', width:360, height:640, mobile:true, isPc:false }
    ];
    for (const cfg of cases) {
        await cdp.call('Emulation.setDeviceMetricsOverride', { width:cfg.width, height:cfg.height, deviceScaleFactor:1, mobile:cfg.mobile });
        const result = await cdp.call('Runtime.evaluate', {
            expression: `(() => {
                document.open();document.write(${JSON.stringify(html)});document.close();
                document.body.classList.toggle('is-pc', ${cfg.isPc});
                const screen=document.getElementById('game-screen');
                screen.style.left='0px';screen.style.top='0px';screen.style.width='${cfg.width}px';screen.style.height='${cfg.height}px';screen.style.transform='none';
                const sr=screen.getBoundingClientRect();
                const modal=document.getElementById('field-war-modal');
                const content=document.querySelector('#field-war-modal .fw-fullscreen-content');
                const mr=modal.getBoundingClientRect();
                const cr=content.getBoundingClientRect();
                const cs=getComputedStyle(content);
                return {
                    screen:{left:sr.left,top:sr.top,right:sr.right,bottom:sr.bottom,width:sr.width,height:sr.height},
                    modal:{left:mr.left,top:mr.top,right:mr.right,bottom:mr.bottom,width:mr.width,height:mr.height},
                    content:{left:cr.left,top:cr.top,right:cr.right,bottom:cr.bottom,width:cr.width,height:cr.height},
                    borderTop:parseFloat(cs.borderTopWidth)||0,borderRight:parseFloat(cs.borderRightWidth)||0,
                    radius:cs.borderTopLeftRadius,
                    marginTop:parseFloat(cs.marginTop)||0,marginLeft:parseFloat(cs.marginLeft)||0
                };
            })()`, returnByValue:true, awaitPromise:true
        });
        const st=result.result.value;
        assert.ok(st.content.left <= st.screen.left + 1 && st.content.top <= st.screen.top + 1, `${cfg.label}: 野戦画面の左上に元画面が見える隙間があります`);
        assert.ok(st.content.right >= st.screen.right - 1 && st.content.bottom >= st.screen.bottom - 1, `${cfg.label}: 野戦画面の右下に元画面が見える隙間があります`);
        assert.strictEqual(st.borderTop, 0, `${cfg.label}: 野戦全画面に外枠を付けない`);
        assert.strictEqual(st.borderRight, 0, `${cfg.label}: 野戦全画面に外枠を付けない`);
        assert.ok(st.radius === '0px' || st.radius === '0', `${cfg.label}: 野戦全画面は角丸にしない (${st.radius})`);
        assert.ok(Math.abs(st.marginTop) <= 0.1 && Math.abs(st.marginLeft) <= 0.1, `${cfg.label}: 野戦全画面に外側余白を残さない`);
    }
    console.log('✓ 野戦 PC/スマホ full-screen visual/layout regression');
}

async function validateBushoBiographyLayout(cdp) {
    const html = fixtureHtml('busho_detail_biography.html');
    const cases = [
        { label:'PC', width:1280, height:720, mobile:false, isPc:true, tab:'列伝' },
        { label:'mobile', width:360, height:640, mobile:true, isPc:false, tab:'伝' }
    ];
    for (const cfg of cases) {
        await cdp.call('Emulation.setDeviceMetricsOverride', { width:cfg.width, height:cfg.height, deviceScaleFactor:1, mobile:cfg.mobile });
        const result = await cdp.call('Runtime.evaluate', {
            expression: `(() => {
                document.open();document.write(${JSON.stringify(html)});document.close();
                document.body.classList.toggle('is-pc', ${cfg.isPc});
                const screen=document.getElementById('game-screen');
                screen.style.width='${cfg.width}px';screen.style.height='${cfg.height}px';screen.style.transform='none';
                document.getElementById('fixture-biography-tab').textContent=${JSON.stringify(cfg.tab)};
                const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
                const text=document.getElementById('fixture-biography-text');
                const tab=document.getElementById('fixture-biography-tab');
                const tabs=tab.parentElement.getBoundingClientRect();
                const tr=tab.getBoundingClientRect();
                const ts=getComputedStyle(text);
                return {
                    layout:rect('fixture-biography-layout'), placeholder:rect('fixture-placeholder'), reference:rect('fixture-status-reference'), panel:rect('fixture-biography-panel'), right:rect('fixture-right'),
                    text:{...rect('fixture-biography-text'),clientHeight:text.clientHeight,scrollHeight:text.scrollHeight,overflowY:ts.overflowY,fontSize:parseFloat(ts.fontSize),lineHeight:parseFloat(ts.lineHeight)},
                    tab:{text:tab.textContent,left:tr.left,right:tr.right,top:tr.top,bottom:tr.bottom}, tabs:{left:tabs.left,right:tabs.right}
                };
            })()`, returnByValue:true, awaitPromise:true
        });
        const st=result.result.value;
        approx(st.layout.height, st.placeholder.height, 0.5, `${cfg.label}: 列伝レイアウト高は基本参照高と一致する`);
        approx(st.placeholder.height, st.reference.height, 0.5, `${cfg.label}: 透明参照枠は基本タブ高をそのまま確保する`);
        approx(st.panel.height, st.placeholder.height, 0.5, `${cfg.label}: 列伝本文枠は基本タブと同じ高さにする`);
        approx(st.panel.width, st.placeholder.width, 0.5, `${cfg.label}: 列伝本文枠は基本タブと同じ幅にする`);
        assert.ok(st.panel.left >= st.right.left - 0.5 && st.panel.right <= st.right.right + 0.5, `${cfg.label}: 列伝本文が右側表示範囲からはみ出す`);
        assert.strictEqual(st.text.overflowY, 'auto', `${cfg.label}: 長い列伝は本文枠内だけでスクロールする`);
        assert.ok(st.text.clientHeight <= st.panel.height + 1, `${cfg.label}: 列伝本文の表示高が本文枠を越える`);
        assert.strictEqual(st.tab.text, cfg.tab, `${cfg.label}: 列伝タブ表記が違う`);
        assert.ok(st.tab.left >= st.tabs.left - 0.5 && st.tab.right <= st.tabs.right + 0.5, `${cfg.label}: 列伝タブがタブ列からはみ出す`);
        if (!cfg.isPc) assert.ok(st.text.fontSize >= 12, `mobile: 列伝文字が小さすぎます (${st.text.fontSize})`);
    }
    console.log('✓ 武将詳細 列伝タブ PC/スマホ同一表示範囲 visual/layout regression');
}

async function validateFieldTerrainLayout(cdp) {
    const html = fixtureHtml('field_terrain.html');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 720, height: 420, deviceScaleFactor: 1, mobile: false });
    let result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            document.open();document.write(${JSON.stringify(html)});document.close();
            const map=document.getElementById('terrain-map');
            const tiles=[...map.querySelectorAll('.fw-hex')];
            const rects=tiles.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};});
            const styleFor=t=>{const el=document.querySelector('.hex-'+t);const cs=getComputedStyle(el);return {bg:cs.backgroundImage,color:cs.backgroundColor,anim:cs.animationName};};
            return {count:tiles.length,rects,plain:styleFor('plain'),forest:styleFor('forest'),mountain:styleFor('mountain'),river:styleFor('river'),sea:styleFor('sea')};
        })()`, returnByValue: true, awaitPromise: true
    });
    const st=result.result.value;
    assert.strictEqual(st.count, 240, '野戦地形fixtureは240HEXを描画する');
    assert.ok(st.rects.every(r=>r.width >= 29 && r.height >= 25), '地形チップ寸法が潰れている');
    for (const [name,data] of Object.entries({plain:st.plain,forest:st.forest,mountain:st.mountain,river:st.river,sea:st.sea})) {
        assert.ok(data.bg && data.bg !== 'none', `${name}: 静的な地形模様が必要`);
    }
    assert.strictEqual(st.river.anim, 'none', '川チップは常時アニメーションしない');
    const colors=new Set([st.plain.color,st.forest.color,st.mountain.color,st.river.color,st.sea.color]);
    assert.strictEqual(colors.size,5,'5地形は基調色だけでも識別できる必要がある');
    if (process.env.KEEP_VISUAL_SCREENSHOT === '1') {
        const shot=await cdp.call('Page.captureScreenshot',{format:'png',fromSurface:true});
        const keep=path.join(ROOT,'tests','visual','last_field_terrain.png');
        fs.writeFileSync(keep,Buffer.from(shot.data,'base64'));
        console.log(`  terrain screenshot: ${keep}`);
    }
    console.log('✓ 野戦地形チップ static visual/layout regression');
}


async function validateLowMemoryPagerLayout(cdp) {
    const html = fixtureHtml('low_memory_pager.html');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 1, mobile: true });
    const result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            document.open();document.write(${JSON.stringify(html)});document.close();
            const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
            const pager=document.getElementById('selector-list-pager');
            const modal=document.querySelector('#selector-modal .modal-content').getBoundingClientRect();
            const footer=document.querySelector('#selector-modal .modal-footer').getBoundingClientRect();
            const list=document.getElementById('selector-list').getBoundingClientRect();
            const next=pager.querySelector('.low-memory-page-next').getBoundingClientRect();
            const prev=pager.querySelector('.low-memory-page-prev').getBoundingClientRect();
            const cs=getComputedStyle(pager);
            return {pager:rect('selector-list-pager'),modal:{top:modal.top,bottom:modal.bottom},footer:{top:footer.top,bottom:footer.bottom},list:{top:list.top,bottom:list.bottom},next:{width:next.width,height:next.height},prev:{width:prev.width,height:prev.height},display:cs.display,visibility:cs.visibility};
        })()`, returnByValue:true, awaitPromise:true
    });
    const st=result.result.value;
    assert.notStrictEqual(st.display, 'none', '軽量一覧のページャーがdisplay:noneになっている');
    assert.notStrictEqual(st.visibility, 'hidden', '軽量一覧のページャーが非表示になっている');
    assert.ok(st.pager.height >= 34, `ページャーが潰れています (${st.pager.height}px)`);
    assert.ok(st.pager.top >= st.list.bottom - 1, 'ページャーはスクロール一覧の外側・直下に置く');
    assert.ok(st.pager.bottom <= st.footer.top + 1, 'ページャーは共通footerより上に収める');
    assert.ok(st.pager.top >= st.modal.top && st.pager.bottom <= st.modal.bottom, 'ページャーがモーダル外へはみ出す');
    assert.ok(st.prev.width >= 60 && st.next.width >= 60 && st.prev.height >= 28 && st.next.height >= 28, '前/次ボタンのタップ領域が小さすぎる');
    console.log('✓ 軽量モード一覧 ページ送り操作常時表示 visual/layout regression');
}

async function main() {
    const browser = findBrowser();
    if (!browser) throw new Error('Chrome / Chromium / Edge が見つかりません。CHROME_PATH を指定してください。');
    const port = await freePort();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sengoku-visual-'));
    const userData = path.join(tempDir, 'profile');
    const args = [
        '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
        '--remote-allow-origins=*', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, 'about:blank'
    ];
    if (process.platform !== 'win32') args.push('--no-sandbox');
    const child = spawn(browser, args, { stdio: ['ignore', 'ignore', 'ignore'] });
    let cdp;
    try {
        const pages = await waitForJson(`http://127.0.0.1:${port}/json/list`);
        const page = pages.find(item => item.type === 'page');
        assert.ok(page && page.webSocketDebuggerUrl, 'DevTools page endpoint がありません');
        cdp = new CDPClient(page.webSocketDebuggerUrl);
        await cdp.open();
        await cdp.call('Runtime.enable');
        await cdp.call('Page.enable');
        await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false });
        const html = fixtureHtml();
        await cdp.call('Runtime.evaluate', {
            expression: `document.open();document.write(${JSON.stringify(html)});document.close();true`,
            returnByValue: true,
            awaitPromise: true
        });
        await new Promise(resolve => setTimeout(resolve, 150));
        const expression = `(() => {
            const right = document.getElementById('right-column').getBoundingClientRect();
            return [...document.querySelectorAll('[data-value]')].map(row => {
                const wrapper = row.querySelector('.busho-stat-bar-wrapper').getBoundingClientRect();
                const base = row.querySelector('.bar-bg-busho').getBoundingClientRect();
                const fill = row.querySelector('.bar-fill-busho').getBoundingClientRect();
                const rr = row.getBoundingClientRect();
                return { value:Number(row.dataset.value), wrapper:{left:wrapper.left,right:wrapper.right,width:wrapper.width,height:wrapper.height}, base:{left:base.left,right:base.right,width:base.width,height:base.height}, fill:{left:fill.left,right:fill.right,width:fill.width,height:fill.height}, row:{right:rr.right}, rightColumnLeft:right.left };
            });
        })()`;
        const result = await cdp.call('Runtime.evaluate', { expression, returnByValue: true });
        const rows = result.result && result.result.value;
        assert.ok(Array.isArray(rows), 'ブラウザからゲージ寸法を取得できませんでした');
        validate(rows);

        const shot = await cdp.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
        const screenshot = path.join(tempDir, 'busho_gauge.png');
        fs.writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
        assert.ok(fs.statSync(screenshot).size > 4000, '確認用スクリーンショットが空に近いです');
        if (process.env.KEEP_VISUAL_SCREENSHOT === '1') {
            const keep = path.join(ROOT, 'tests', 'visual', 'last_busho_gauge.png');
            fs.copyFileSync(screenshot, keep);
            console.log(`  screenshot: ${keep}`);
        }
        console.log('✓ PC武将能力ゲージ visual/layout regression');
        console.log('  80/100/110/120 の幅・高さ・限界突破・右列非侵入を実ブラウザで確認しました');
        await validateLegionCouncil(cdp);
        await validateFloatingStatusLayout(cdp);
        await validateCommandAndInterviewStates(cdp);
        await validateEndingAndWatchStates(cdp);
        await validateGuideLayout(cdp);
        await validateWarAptitudeLayout(cdp);
        await validateDialogConfirmPlacement(cdp);
        await validateBushoBiographyLayout(cdp);
        await validateLowMemoryPagerLayout(cdp);
        await validateFieldWarFullscreen(cdp);
        await validateFieldTerrainLayout(cdp);
    } finally {
        if (cdp) cdp.close();
        child.kill('SIGTERM');
        setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} }, 400).unref();
    }
}

main().catch(error => {
    console.error('✗ visual test failed');
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
});
