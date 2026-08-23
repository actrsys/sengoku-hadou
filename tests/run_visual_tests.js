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
            const inline = document.querySelector('.interview-session-inline-btn');
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
                inlineUsesDetailButton: inline && inline.classList.contains('daimyo-detail-action-btn'),
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
    assert.ok(Math.abs((pc.rect.width / pc.rect.height) - (16 / 9)) < 0.03, `PC面談枠が16:9ではありません (${pc.rect.width}x${pc.rect.height})`);
    assert.strictEqual(pc.overflowY, 'hidden', 'PC面談枠をスクロール領域にしない');
    assert.ok(pc.scrollHeight <= pc.clientHeight + 3, 'PC面談内容が枠をはみ出している');
    assert.strictEqual(pc.footerOutside, true, 'PC面談の戻る/決定系ボタンは内容枠の外へ置く');
    assert.strictEqual(pc.standardInsideButtons, 0, 'PC面談の内容枠内に標準決定/キャンセルボタンを置かない');
    assert.strictEqual(pc.inlineUsesDetailButton, true, 'PC面談の内容内操作は詳細画面系ボタンを使う');
    assert.ok(pc.footer.top - pc.rect.bottom >= 14 && pc.footer.top - pc.rect.bottom <= 16, `PC面談の内容枠と外側ボタンの隙間は15px基準 (${pc.footer.top - pc.rect.bottom})`);

    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 1, mobile: true });
    await cdp.call('Runtime.evaluate', {
        expression: `document.body.classList.remove('is-pc'); const g=document.getElementById('game-screen'); g.style.width='360px';g.style.height='640px';true`,
        returnByValue: true
    });
    await new Promise(resolve => setTimeout(resolve, 80));
    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const content = document.getElementById('interview-session-content');
            const footer = document.getElementById('interview-session-footer');
            const r = content.getBoundingClientRect();
            const fr = footer.getBoundingClientRect();
            const cs = getComputedStyle(content);
            const actionBox = document.getElementById('interview-session-inline-actions').getBoundingClientRect();
            const action = document.querySelector('.interview-session-inline-btn').getBoundingClientRect();
            const message = document.querySelector('.interview-session-message-area').getBoundingClientRect();
            const footerButton = footer.querySelector('button').getBoundingClientRect();
            const metaAlign = getComputedStyle(document.querySelector('.interview-session-meta-row')).textAlign;
            return {
                innerWidth: 360, innerHeight: 640,
                rect:{width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom},
                footer:{top:fr.top,bottom:fr.bottom,left:fr.left,right:fr.right},
                footerOutside:footer.parentElement === document.getElementById('interview-modal') && !content.contains(footer),
                standardInsideButtons:content.querySelectorAll('.btn-primary, .btn-secondary, .btn-danger').length,
                overflowY:cs.overflowY,
                scrollHeight:content.scrollHeight,
                clientHeight:content.clientHeight,
                actionHeight:action.height,
                actionBottom:actionBox.bottom, messageTop:message.top, metaAlign,
                footerButtonHeight:footerButton.height
            };
        })()`,
        returnByValue: true
    });
    const mobile = result.result.value;
    assert.ok(Math.abs((mobile.rect.width / mobile.rect.height) - (9 / 16)) < 0.03, `スマホ面談枠が9:16ではありません (${mobile.rect.width}x${mobile.rect.height})`);
    assert.ok(mobile.rect.left >= -1 && mobile.rect.right <= mobile.innerWidth + 1, 'スマホ面談枠が横にはみ出している');
    assert.ok(mobile.rect.top >= -1 && mobile.rect.bottom <= mobile.innerHeight + 1, 'スマホ面談枠が縦にはみ出している');
    assert.strictEqual(mobile.overflowY, 'hidden', 'スマホ面談枠をスクロール領域にしない');
    assert.ok(mobile.scrollHeight <= mobile.clientHeight + 3, 'スマホ面談内容が枠をはみ出している');
    assert.ok(mobile.actionHeight >= 27, 'スマホ面談内操作ボタンが小さすぎる');
    assert.ok(mobile.actionBottom <= mobile.messageTop + 1, '面談の会話選択肢は会話本文より上に置く');
    assert.strictEqual(mobile.metaAlign, 'left', '面談相手の所在・身分・年齢は左揃えにする');
    assert.strictEqual(mobile.footerOutside, true, 'スマホ面談の戻る/決定系ボタンは内容枠の外へ置く');
    assert.strictEqual(mobile.standardInsideButtons, 0, 'スマホ面談の内容枠内に標準決定/キャンセルボタンを置かない');
    assert.ok(mobile.footer.top - mobile.rect.bottom >= 14 && mobile.footer.top - mobile.rect.bottom <= 16, `スマホ面談の内容枠と外側ボタンの隙間は15px基準 (${mobile.footer.top - mobile.rect.bottom})`);
    assert.ok(mobile.footer.bottom <= mobile.innerHeight + 1, 'スマホ面談の外側ボタンが9:16画面からはみ出している');
    assert.ok(mobile.footerButtonHeight >= 36, 'スマホ面談の外側ボタンが小さすぎる');

    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const content = document.getElementById('interview-session-content');
            const footer = document.getElementById('interview-session-footer');
            const inline = document.getElementById('interview-session-inline-actions');
            const body = document.getElementById('interview-session-body');
            const before = {contentTop:content.getBoundingClientRect().top, contentHeight:content.getBoundingClientRect().height, bodyTop:body.getBoundingClientRect().top};
            inline.classList.add('hidden');
            footer.classList.add('hidden');
            const after = {contentTop:content.getBoundingClientRect().top, contentHeight:content.getBoundingClientRect().height, bodyTop:body.getBoundingClientRect().top, footerDisplay:getComputedStyle(footer).display, footerVisibility:getComputedStyle(footer).visibility};
            return {before, after};
        })()`,
        returnByValue: true
    });
    const fixedConversation = result.result.value;
    assert.ok(Math.abs(fixedConversation.before.contentTop - fixedConversation.after.contentTop) < 1, '選択肢/外側ボタンの有無で面談枠を上下移動させない');
    assert.ok(Math.abs(fixedConversation.before.contentHeight - fixedConversation.after.contentHeight) < 1, '選択肢/外側ボタンの有無で面談枠の高さを変えない');
    assert.ok(Math.abs(fixedConversation.before.bodyTop - fixedConversation.after.bodyTop) < 1, '選択肢の有無で会話本文を上下移動させない');
    assert.strictEqual(fixedConversation.after.footerDisplay, 'flex', '面談外側フッターは非表示時も予約領域を維持する');
    assert.strictEqual(fixedConversation.after.footerVisibility, 'hidden', '面談外側フッターは予約時に見えない');

    // 最も狭いスマホ9:16で、検索・ソート付き8人一覧もスクロールなしで収まるか確認する。
    result = await cdp.call('Runtime.evaluate', {
        expression: `(() => {
            const content = document.getElementById('interview-session-content');
            content.classList.add('speaker-hidden');
            content.classList.remove('interview-conversation-active');
            document.getElementById('interview-session-summary-panel').classList.add('hidden');
            document.getElementById('interview-session-inline-actions').classList.add('hidden');
            const pager = document.getElementById('interview-session-pager');
            pager.classList.remove('hidden');
            pager.innerHTML = '<button class=\"daimyo-detail-action-btn\">前へ</button><span class=\"interview-session-page-label\">1 / 3</span><button class=\"daimyo-detail-action-btn\">次へ</button>';
            const body = document.getElementById('interview-session-body');
            body.className = 'interview-session-body interview-session-list-view interviewer-list-view';
            body.innerHTML = '<div class=\"interview-session-list-tools\"><input class=\"interview-session-search\" placeholder=\"名前で探す\"><select class=\"interview-session-sort-select\"><option>統率</option></select><button class=\"daimyo-detail-action-btn interview-session-sort-direction\">降順</button><span class=\"interview-session-list-count\">24人</span></div><div class=\"interview-session-person-grid\">' + Array.from({length:8},(_,i)=>'<button class=\"interview-session-person\"><span class=\"interview-session-person-face\"></span><span class=\"interview-session-person-name\">武将'+(i+1)+'</span></button>').join('') + '</div>';
            const cr = content.getBoundingClientRect();
            const br = body.getBoundingClientRect();
            const gr = body.querySelector('.interview-session-person-grid').getBoundingClientRect();
            const tr = body.querySelector('.interview-session-list-tools').getBoundingClientRect();
            return {
                contentScroll: content.scrollHeight, contentClient: content.clientHeight,
                bodyScroll: body.scrollHeight, bodyClient: body.clientHeight,
                contentBottom: cr.bottom, bodyBottom: br.bottom, gridBottom: gr.bottom, toolsHeight: tr.height,
                overflowY: getComputedStyle(body).overflowY
            };
        })()`,
        returnByValue: true
    });
    const mobileList = result.result.value;
    assert.strictEqual(mobileList.overflowY, 'hidden', 'スマホ面談一覧をスクロール領域にしない');
    assert.ok(mobileList.contentScroll <= mobileList.contentClient + 3, '検索・ソート付きスマホ面談一覧が内容枠をはみ出している');
    assert.ok(mobileList.bodyScroll <= mobileList.bodyClient + 3, '検索・ソート付きスマホ武将一覧が内部ではみ出している');
    assert.ok(mobileList.gridBottom <= mobileList.bodyBottom + 1, 'スマホ面談の武将カードが一覧領域からはみ出している');
    assert.ok(mobileList.toolsHeight >= 28, 'スマホ面談の検索・ソート帯が潰れている');

    console.log('✓ PC入れ子コマンド選択状態・面談固定16:9/9:16・標準外置きフッター・スマホ検索ソート一覧 visual regression');
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
        await validateCommandAndInterviewStates(cdp);
        await validateEndingAndWatchStates(cdp);
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
